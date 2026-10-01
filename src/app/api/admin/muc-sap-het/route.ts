import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { getCauHinh } from '@/lib/config'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// Cảnh báo máy thuê SẮP HẾT MỰC (ước lượng "chia dư"): còn lại = định lượng − (counter MOD định lượng);
// cảnh báo khi còn lại ≤ ngưỡng. Tắt khi: office bấm "Đã gửi mực" (ack theo chu kỳ hộp) HOẶC có phiếu
// loại "Giao mực" cho máy đó + đúng mã mực, lập trong chu kỳ hộp hiện tại. CHỈ ước lượng chủ động.

const LOAI_HD_BILLING = ['Máy thuê', 'Máy CPC']
const normModel = (s: any) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export async function GET() {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    const cfg = await getCauHinh()
    const nguong = parseInt(cfg.muc_canh_bao_con_trang || '2000') || 2000

    // Máy thuê/CPC
    const mays = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_khach_hang')
      .select('id, ten_khach_hang, ma_may, model, may_mau')
      .in('loai_hd', LOAI_HD_BILLING).range(from, to))

    // Map model -> mực (chỉ mực có định lượng)
    const maps = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_muc_may_thue')
      .select('model_may, ma_hang, dinh_luong, loai').range(from, to))
    const mapByModel = new Map<string, any[]>()
    for (const m of maps || []) {
      if (!m.dinh_luong || m.dinh_luong <= 0) continue
      const k = normModel(m.model_may)
      if (!mapByModel.has(k)) mapByModel.set(k, [])
      mapByModel.get(k)!.push(m)
    }

    // Counter history theo máy (id_khach_hang)
    const counters = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_thue_cpc_counter')
      .select('id_khach_hang, thang_nam, so_bw, so_mau').range(from, to))
    const histByMay = new Map<string, any[]>()
    for (const c of counters || []) {
      if (!histByMay.has(c.id_khach_hang)) histByMay.set(c.id_khach_hang, [])
      histByMay.get(c.id_khach_hang)!.push(c)
    }
    for (const arr of histByMay.values()) arr.sort((a, b) => String(a.thang_nam).localeCompare(String(b.thang_nam)))

    // Ack đã gửi mực
    const acks = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_muc_canh_bao_ack').select('ma_may, ma_muc, so_hop').range(from, to))
    const ackSet = new Set((acks || []).map(a => `${a.ma_may}|${a.ma_muc}|${a.so_hop}`))

    // Phiếu "Giao mực" trong 1 năm gần đây -> tự bù trừ (máy + mã mực + ngày)
    const cutoff = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10)
    const giaoMuc = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_cong_viec')
      .select('ma_may, ngay, soct_chi_tiet_vat_tu(ma_hang)')
      .eq('loai_cong_viec', 'Giao mực').gte('ngay', cutoff).range(from, to))
    // ma_may -> [{ ma_hang, ngay }]
    const giaoByMay = new Map<string, { ma_hang: string; ngay: string }[]>()
    for (const p of giaoMuc || []) {
      const mm = String(p.ma_may || '').trim()
      if (!mm) continue
      if (!giaoByMay.has(mm)) giaoByMay.set(mm, [])
      for (const v of (p.soct_chi_tiet_vat_tu || [])) giaoByMay.get(mm)!.push({ ma_hang: String(v.ma_hang || '').trim(), ngay: String(p.ngay || '') })
    }

    const alerts: any[] = []
    for (const may of mays || []) {
      const mapped = mapByModel.get(normModel(may.model)) || []
      if (!mapped.length) continue
      const hist = histByMay.get(may.id) || []
      if (!hist.length) continue
      const latest = hist[hist.length - 1]
      for (const mc of mapped) {
        const Y = Number(mc.dinh_luong) || 0
        if (Y <= 0) continue
        const C = Number(mc.loai === 'mau' ? latest.so_mau : latest.so_bw)
        if (!Number.isFinite(C) || C <= 0) continue
        const soHop = Math.floor(C / Y)
        const daIn = C % Y
        const conLai = Y - daIn
        if (conLai > nguong) continue
        // Tắt theo ack
        if (ackSet.has(`${may.ma_may}|${mc.ma_hang}|${soHop}`)) continue
        // Tắt theo phiếu Giao mực trong chu kỳ hộp hiện tại
        const cycleStartVal = soHop * Y
        let cycleStartMonth = ''
        for (const h of hist) { const v = Number(mc.loai === 'mau' ? h.so_mau : h.so_bw); if (Number.isFinite(v) && v >= cycleStartVal) { cycleStartMonth = String(h.thang_nam); break } }
        const cycleStartDate = cycleStartMonth ? `${cycleStartMonth}-01` : ''
        const giaoList = giaoByMay.get(String(may.ma_may || '').trim()) || []
        const daGiao = giaoList.some(g => g.ma_hang === mc.ma_hang && (!cycleStartDate || g.ngay >= cycleStartDate))
        if (daGiao) continue
        alerts.push({
          ma_may: may.ma_may, ten_khach_hang: may.ten_khach_hang, model: may.model,
          ma_muc: mc.ma_hang, loai: mc.loai, dinh_luong: Y,
          counter: C, da_in: daIn, con_lai: conLai, so_hop: soHop, thang_nam: latest.thang_nam,
        })
      }
    }
    alerts.sort((a, b) => a.con_lai - b.con_lai)
    return NextResponse.json({ data: alerts, count: alerts.length, nguong })
  } catch (error: any) {
    console.error('Error GET muc-sap-het:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST { ma_may, ma_muc, so_hop } -> đánh dấu "đã gửi mực" cho chu kỳ hộp này (tắt cảnh báo tới hộp kế).
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    const b = await request.json()
    const ma_may = String(b.ma_may || '').trim()
    const ma_muc = String(b.ma_muc || '').trim()
    const so_hop = parseInt(String(b.so_hop))
    if (!ma_may || !ma_muc || !Number.isFinite(so_hop)) return NextResponse.json({ error: 'Thiếu tham số' }, { status: 400 })
    const { error } = await supabaseAdmin.from('soct_muc_canh_bao_ack')
      .upsert({ ma_may, ma_muc, so_hop, nguoi_ack: session.id, acked_at: new Date().toISOString() }, { onConflict: 'ma_may,ma_muc,so_hop' })
    if (error) throw error
    await logAudit(session, 'Đã gửi mực máy thuê', `${ma_may} · ${ma_muc}`)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error POST muc-sap-het:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
