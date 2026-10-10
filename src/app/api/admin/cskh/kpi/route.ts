import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const gate = () => requireTab('cong_viec', 'cong_viec.cham_soc_kh')

// GET: chỉ số KPI chăm sóc khách hàng.
//  - luot_30 / luot_tong : số lượt chăm sóc (log tay + phiếu CSKH Hoàn thành) 30 ngày / toàn bộ.
//  - do_phu               : độ phủ = số khách CỤM có ≥1 lượt chăm sóc trong 90 ngày / tổng khách cụm.
//  - hen_qua_han          : việc hẹn đã quá hạn mà chưa có lượt chăm sóc nào sau ngày hẹn.
//  - pipeline             : phân bố khách tiềm năng theo trạng thái + tỉ lệ chuyển đổi (thành khách).
export async function GET() {
  try {
    const session = await gate()
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const nowMs = Date.now() + 7 * 3600 * 1000
    const today = new Date(nowMs).toISOString().slice(0, 10)
    const d30 = new Date(nowMs - 30 * 86400000).toISOString().slice(0, 10)
    const d90 = new Date(nowMs - 90 * 86400000).toISOString().slice(0, 10)

    const [clusters, members, logs, phieuCskh, tiemNang] = await Promise.all([
      selectAll<any>((f, t) => supabaseAdmin.from('soct_khach_cum').select('ma_khach_hang, ten_khach_hang').range(f, t)),
      selectAll<any>((f, t) => supabaseAdmin.from('soct_khach_hang').select('id, ma_khach_cum').not('ma_khach_cum', 'is', null).range(f, t)),
      selectAll<any>((f, t) => supabaseAdmin.from('soct_cskh_log').select('ma_khach_cum, tiem_nang_id, ngay, ngay_hen').range(f, t)),
      selectAll<any>((f, t) => supabaseAdmin.from('soct_cong_viec').select('id_khach_hang, ngay').eq('loai_cong_viec', 'CSKH').eq('ket_qua', 'Hoàn thành').range(f, t)),
      selectAll<any>((f, t) => supabaseAdmin.from('soct_cskh_khach').select('id, ten_khach_hang, trang_thai').eq('an', false).range(f, t)),
    ])

    const idToCum = new Map<string, string>()
    for (const m of members || []) idToCum.set(m.id, m.ma_khach_cum)
    const cumTen = new Map<string, string>()
    for (const c of clusters || []) cumTen.set(c.ma_khach_hang, c.ten_khach_hang || c.ma_khach_hang)
    const tnTen = new Map<string, string>()
    for (const k of tiemNang || []) tnTen.set(String(k.id), k.ten_khach_hang || `#${k.id}`)

    // Lượt chăm sóc = log tay + phiếu CSKH. Mỗi lượt gắn 1 khóa (cum:/tn:) và 1 ngày.
    type Act = { key: string; ngay: string }
    const acts: Act[] = []
    for (const l of logs || []) {
      if (!l.ngay) continue
      const key = l.tiem_nang_id != null ? `tn:${l.tiem_nang_id}` : (l.ma_khach_cum ? `cum:${l.ma_khach_cum}` : '')
      if (key) acts.push({ key, ngay: l.ngay })
    }
    for (const p of phieuCskh || []) {
      const cum = idToCum.get(p.id_khach_hang)
      if (cum && p.ngay) acts.push({ key: `cum:${cum}`, ngay: p.ngay })
    }
    const luot_tong = acts.length
    const luot_30 = acts.filter(a => a.ngay >= d30).length

    // Độ phủ 90 ngày (chỉ tính khách CỤM).
    const covered = new Set<string>()
    for (const a of acts) if (a.key.startsWith('cum:') && a.ngay >= d90) covered.add(a.key)
    const totalCum = (clusters || []).length

    // Ngày chăm sóc gần nhất theo khóa (để xét hẹn quá hạn chưa xử lý).
    const actDates = new Map<string, string[]>()
    for (const a of acts) { const arr = actDates.get(a.key) || []; arr.push(a.ngay); actDates.set(a.key, arr) }
    // Hẹn quá hạn: ngay_hen < hôm nay và KHÔNG có lượt chăm sóc nào sau ngày hẹn đó.
    const overdueByKey = new Map<string, string>()  // key -> ngày hẹn quá hạn trễ nhất
    for (const l of logs || []) {
      if (!l.ngay_hen || l.ngay_hen >= today) continue
      const key = l.tiem_nang_id != null ? `tn:${l.tiem_nang_id}` : (l.ma_khach_cum ? `cum:${l.ma_khach_cum}` : '')
      if (!key) continue
      const after = (actDates.get(key) || []).some(d => d > l.ngay_hen)
      if (after) continue
      const cur = overdueByKey.get(key)
      if (!cur || l.ngay_hen > cur) overdueByKey.set(key, l.ngay_hen)
    }
    const hen_list = Array.from(overdueByKey.entries()).map(([key, ngay_hen]) => {
      const isTn = key.startsWith('tn:')
      const id = key.slice(key.indexOf(':') + 1)
      return { key, ten: isTn ? (tnTen.get(id) || id) : (cumTen.get(id) || id), ngay_hen }
    }).sort((a, b) => String(a.ngay_hen).localeCompare(String(b.ngay_hen)))

    // Pipeline tiềm năng.
    const pipeline: Record<string, number> = { moi: 0, dang_tiep_can: 0, thanh_khach: 0, khong_thanh: 0 }
    for (const k of tiemNang || []) { const s = k.trang_thai || 'moi'; if (s in pipeline) pipeline[s]++ }
    const tnTotal = (tiemNang || []).length
    const chuyen_doi_pct = tnTotal ? Math.round((pipeline.thanh_khach / tnTotal) * 1000) / 10 : 0

    return NextResponse.json({
      data: {
        luot_30, luot_tong,
        do_phu: { covered: covered.size, total: totalCum, pct: totalCum ? Math.round((covered.size / totalCum) * 1000) / 10 : 0 },
        hen_qua_han: { count: overdueByKey.size, list: hen_list },
        pipeline: { ...pipeline, total: tnTotal, chuyen_doi_pct },
      },
    })
  } catch (error: any) {
    console.error('Error GET cskh/kpi:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
