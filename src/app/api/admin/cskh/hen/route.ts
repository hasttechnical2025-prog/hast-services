import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const gate = () => requireTab('cong_viec', 'cong_viec.cham_soc_kh')

// GET: danh sách KHÁCH có việc hẹn chăm sóc ĐẾN HẠN (ngay_hen <= hôm nay) mà CHƯA xử lý
// (không có lượt chăm sóc nào — log tay hoặc phiếu CSKH — sau ngày hẹn). Dùng cho chuông header.
// Gate = cong_viec.cham_soc_kh (admin-only mặc định) -> role khác nhận 401 -> chuông tự ẩn mục này.
export async function GET() {
  try {
    const session = await gate()
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)

    const [clusters, members, logs, phieuCskh, tiemNang] = await Promise.all([
      selectAll<any>((f, t) => supabaseAdmin.from('soct_khach_cum').select('ma_khach_hang, ten_khach_hang').range(f, t)),
      selectAll<any>((f, t) => supabaseAdmin.from('soct_khach_hang').select('id, ma_khach_cum').not('ma_khach_cum', 'is', null).range(f, t)),
      selectAll<any>((f, t) => supabaseAdmin.from('soct_cskh_log').select('ma_khach_cum, tiem_nang_id, ngay, ngay_hen').range(f, t)),
      selectAll<any>((f, t) => supabaseAdmin.from('soct_cong_viec').select('id_khach_hang, ngay').eq('loai_cong_viec', 'CSKH').eq('ket_qua', 'Hoàn thành').range(f, t)),
      selectAll<any>((f, t) => supabaseAdmin.from('soct_cskh_khach').select('id, ten_khach_hang').eq('an', false).range(f, t)),
    ])

    const idToCum = new Map<string, string>()
    for (const m of members || []) idToCum.set(m.id, m.ma_khach_cum)
    const cumTen = new Map<string, string>()
    for (const c of clusters || []) cumTen.set(c.ma_khach_hang, c.ten_khach_hang || c.ma_khach_hang)
    const tnTen = new Map<string, string>()
    for (const k of tiemNang || []) tnTen.set(String(k.id), k.ten_khach_hang || `#${k.id}`)

    // Ngày có lượt chăm sóc theo khóa (log + phiếu CSKH) để xét hẹn đã xử lý chưa.
    const actDates = new Map<string, string[]>()
    const pushAct = (key: string, ngay: string) => { if (!key || !ngay) return; const a = actDates.get(key) || []; a.push(ngay); actDates.set(key, a) }
    for (const l of logs || []) {
      const key = l.tiem_nang_id != null ? `tn:${l.tiem_nang_id}` : (l.ma_khach_cum ? `cum:${l.ma_khach_cum}` : '')
      pushAct(key, l.ngay)
    }
    for (const p of phieuCskh || []) { const cum = idToCum.get(p.id_khach_hang); if (cum) pushAct(`cum:${cum}`, p.ngay) }

    // Hẹn đến hạn chưa xử lý: ngay_hen <= hôm nay và không có lượt chăm sóc nào sau ngày hẹn.
    const pend = new Map<string, string>()  // key -> ngày hẹn trễ nhất còn treo
    for (const l of logs || []) {
      if (!l.ngay_hen || l.ngay_hen > today) continue
      const key = l.tiem_nang_id != null ? `tn:${l.tiem_nang_id}` : (l.ma_khach_cum ? `cum:${l.ma_khach_cum}` : '')
      if (!key) continue
      const after = (actDates.get(key) || []).some(d => d > l.ngay_hen)
      if (after) continue
      const cur = pend.get(key)
      if (!cur || l.ngay_hen > cur) pend.set(key, l.ngay_hen)
    }

    const data = Array.from(pend.entries()).map(([key, ngay_hen]) => {
      const isTn = key.startsWith('tn:')
      const id = key.slice(key.indexOf(':') + 1)
      return {
        key, loai: isTn ? 'tiem_nang' : 'cum',
        ma_khach_cum: isTn ? null : id, id: isTn ? Number(id) : null,
        ten: isTn ? (tnTen.get(id) || id) : (cumTen.get(id) || id),
        ngay_hen, qua_han: ngay_hen < today,
      }
    }).sort((a, b) => String(a.ngay_hen).localeCompare(String(b.ngay_hen)))

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error GET cskh/hen:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
