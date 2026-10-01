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
      .select('model_may, ma_hang, dinh_luong, loai, nhom').range(from, to))
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

    // Phiếu "Giao mực" / "Thay vật tư" trong 1 năm gần đây -> tự bù trừ THEO NHÓM:
    // mực chỉ tắt bởi "Giao mực"; trống chỉ tắt bởi "Thay vật tư" (đúng loại việc trừ kho).
    const cutoff = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10)
    const giaoMuc = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_cong_viec')
      .select('ma_may, ngay, loai_cong_viec, soct_chi_tiet_vat_tu(ma_hang)')
      .in('loai_cong_viec', ['Giao mực', 'Thay vật tư']).gte('ngay', cutoff).range(from, to))
    // ma_may -> [{ ma_hang, ngay, loai_cv, so_luong }]
    const giaoByMay = new Map<string, { ma_hang: string; ngay: string; loai_cv: string; so_luong: number }[]>()
    for (const p of giaoMuc || []) {
      const mm = String(p.ma_may || '').trim()
      if (!mm) continue
      if (!giaoByMay.has(mm)) giaoByMay.set(mm, [])
      for (const v of (p.soct_chi_tiet_vat_tu || [])) giaoByMay.get(mm)!.push({ ma_hang: String(v.ma_hang || '').trim(), ngay: String(p.ngay || ''), loai_cv: String(p.loai_cong_viec || ''), so_luong: Math.max(1, Number(v.so_luong) || 1) })
    }

    // counter theo loại: mau->so_mau, tong->so_bw+so_mau, bw->so_bw. Dùng chung cho mọi máy.
    const counterOf = (h: any, loai: string) => loai === 'mau' ? Number(h.so_mau) : loai === 'tong' ? (Number(h.so_bw) || 0) + (Number(h.so_mau) || 0) : Number(h.so_bw)
    // counter tại (hoặc gần nhất TRƯỚC) tháng giao mực -> suy "hộp lúc giao".
    const counterAtMonth = (h: any[], month: string, loai: string) => { let best: any = null; for (const r of h) { if (String(r.thang_nam) <= month) best = r; else break } return best ? counterOf(best, loai) : NaN }

    const alerts: any[] = []
    for (const may of mays || []) {
      const mapped = mapByModel.get(normModel(may.model)) || []
      if (!mapped.length) continue
      const hist = histByMay.get(may.id) || []
      if (!hist.length) continue
      const latest = hist[hist.length - 1]
      const prev = hist.length >= 2 ? hist[hist.length - 2] : null
      for (const mc of mapped) {
        const Y = Number(mc.dinh_luong) || 0
        if (Y <= 0) continue
        const C = counterOf(latest, mc.loai)
        if (!Number.isFinite(C) || C <= 0) continue
        const soHop = Math.floor(C / Y)
        const daIn = C % Y
        const conLai = Y - daIn
        // (b) NGƯỠNG ĐỘNG: cảnh báo khi còn ≤ max(ngưỡng cố định, mức in ~1 tháng gần nhất)
        // -> máy in nhiều luôn được báo trước ~1 tháng, bù độ phân giải counter theo tháng.
        const mucInThang = prev ? Math.max(0, C - counterOf(prev, mc.loai)) : 0
        const nguongHieuLuc = Math.max(nguong, mucInThang)
        if (conLai > nguongHieuLuc) continue
        // Tắt theo ack
        if (ackSet.has(`${may.ma_may}|${mc.ma_hang}|${soHop}`)) continue
        // (a) Tắt theo phiếu Giao mực/Thay vật tư + NỚI theo SỐ LƯỢNG: giao N hộp phủ N chu kỳ hộp.
        const giaoList = giaoByMay.get(String(may.ma_may || '').trim()) || []
        const need = (mc.nhom === 'trong') ? 'Thay vật tư' : 'Giao mực' // mực: chỉ Giao mực; trống: chỉ Thay vật tư
        const covered = giaoList.some(g => {
          if (g.ma_hang !== mc.ma_hang || g.loai_cv !== need) return false
          const cAtGiao = counterAtMonth(hist, String(g.ngay).slice(0, 7), mc.loai)
          if (!Number.isFinite(cAtGiao)) return false
          const hopLucGiao = Math.floor(cAtGiao / Y)
          const phuDenHop = hopLucGiao + (g.so_luong - 1) // N hộp -> phủ thêm (N-1) chu kỳ
          return soHop <= phuDenHop
        })
        if (covered) continue
        alerts.push({
          ma_may: may.ma_may, ten_khach_hang: may.ten_khach_hang, model: may.model,
          ma_muc: mc.ma_hang, loai: mc.loai, nhom: mc.nhom || 'muc', dinh_luong: Y,
          counter: C, da_in: daIn, con_lai: conLai, so_hop: soHop, thang_nam: latest.thang_nam,
        })
      }
    }
    // Gom các vật tư cùng (máy, nhóm, counter, chu kỳ) khi có NHIỀU mã (bộ màu C/M/Y) -> 1 dòng; còn lại = min.
    // ma_muc_list dùng cho ack nhiều mã cùng lúc.
    const groups = new Map<string, any[]>()
    for (const a of alerts) {
      const k = `${a.ma_may}|${a.nhom}|${a.loai}|${a.so_hop}`
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(a)
    }
    const out: any[] = []
    for (const arr of groups.values()) {
      if (arr.length === 1) { out.push({ ...arr[0], ma_muc_list: [arr[0].ma_muc] }); continue }
      const codes = [...new Set(arr.map(x => x.ma_muc))]
      const rep = arr.reduce((m, x) => (x.con_lai < m.con_lai ? x : m), arr[0])
      out.push({ ...rep, is_group: true, ma_muc: codes.join(', '), ma_muc_list: codes, con_lai: Math.min(...arr.map(x => x.con_lai)) })
    }
    out.sort((a, b) => a.con_lai - b.con_lai)
    return NextResponse.json({ data: out, count: out.length, nguong })
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
    const ma_mucs: string[] = (Array.isArray(b.ma_mucs) ? b.ma_mucs : (b.ma_muc ? [b.ma_muc] : [])).map((s: any) => String(s).trim()).filter(Boolean)
    const so_hop = parseInt(String(b.so_hop))
    if (!ma_may || ma_mucs.length === 0 || !Number.isFinite(so_hop)) return NextResponse.json({ error: 'Thiếu tham số' }, { status: 400 })
    const now = new Date().toISOString()
    const rows = ma_mucs.map(mc => ({ ma_may, ma_muc: mc, so_hop, nguoi_ack: session.id, acked_at: now }))
    const { error } = await supabaseAdmin.from('soct_muc_canh_bao_ack')
      .upsert(rows, { onConflict: 'ma_may,ma_muc,so_hop' })
    if (error) throw error
    await logAudit(session, 'Đã gửi mực máy thuê', `${ma_may} · ${ma_mucs.join(', ')}`)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error POST muc-sap-het:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
