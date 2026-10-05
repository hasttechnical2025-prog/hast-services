import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { getCauHinh } from '@/lib/config'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// Cảnh báo máy thuê SẮP HẾT vật tư (ước lượng chủ động). còn lại = định lượng − (counter MOD định lượng).
// Candidate khi còn ≤ max(ngưỡng cố định, mức in ~1 tháng gần nhất) [ngưỡng động chống gọi muộn].
// Tắt khi: (1) office bấm "Đã gửi" (ack theo chu kỳ hộp); (2) CÂN ĐỐI TỒN HỘP còn dự phòng:
// (1 hộp theo máy lúc lắp) + tổng hộp đã giao/thay (phiếu đúng loại) > số hộp đã mở (soHop+1).

const LOAI_HD_BILLING = ['Máy thuê', 'Máy CPC']
const normModel = (s: any) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    const showAll = new URL(request.url).searchParams.get('all') === '1' // tra cứu MỌI máy (kể cả chưa cảnh báo)
    const cfg = await getCauHinh()
    const nguong = parseInt(cfg.muc_canh_bao_con_trang || '2000') || 2000

    // Máy thuê/CPC
    const mays = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_khach_hang')
      .select('id, ten_khach_hang, ma_may, model, may_mau, chot_so_ngay, chot_so_cuoi_thang')
      .in('loai_hd', LOAI_HD_BILLING).range(from, to))

    // Map model -> mực (chỉ mực có định lượng)
    const maps = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_muc_may_thue')
      .select('model_may, ma_hang, dinh_luong, dinh_luong_dau, loai, nhom').range(from, to))
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
      .select('ma_may, ngay, report, loai_cong_viec, soct_chi_tiet_vat_tu(ma_hang,so_luong)')
      .in('loai_cong_viec', ['Giao mực', 'Thay vật tư']).gte('ngay', cutoff).range(from, to))
    // ma_may -> [{ ma_hang, ngay, loai_cv, so_luong, so_phieu }]
    const giaoByMay = new Map<string, { ma_hang: string; ngay: string; loai_cv: string; so_luong: number; so_phieu: string }[]>()
    for (const p of giaoMuc || []) {
      const mm = String(p.ma_may || '').trim()
      if (!mm) continue
      if (!giaoByMay.has(mm)) giaoByMay.set(mm, [])
      for (const v of (p.soct_chi_tiet_vat_tu || [])) giaoByMay.get(mm)!.push({ ma_hang: String(v.ma_hang || '').trim(), ngay: String(p.ngay || ''), loai_cv: String(p.loai_cong_viec || ''), so_luong: Math.max(1, Number(v.so_luong) || 1), so_phieu: String(p.report || '') })
    }

    // counter theo loại: mau->so_mau, tong->so_bw+so_mau, bw->so_bw. Dùng chung cho mọi máy.
    const counterOf = (h: any, loai: string) => loai === 'mau' ? Number(h.so_mau) : loai === 'tong' ? (Number(h.so_bw) || 0) + (Number(h.so_mau) || 0) : Number(h.so_bw)
    // Counter nội suy tại 1 ngày phiếu = kỳ counter gần nhất CÓ thang_nam <= tháng của ngày đó. hist đã sort tăng dần.
    const counterAtDate = (hist: any[], ngay: string, loai: string): number => {
      const ym = String(ngay || '').slice(0, 7)
      let best: any = null
      for (const h of hist) { if (String(h.thang_nam) <= ym) best = h }
      return best ? counterOf(best, loai) : NaN
    }
    const median = (a: number[]): number | null => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : Math.round((s[n / 2 - 1] + s[n / 2]) / 2) }

    const nowVN = Date.now() + 7 * 3600 * 1000
    const alerts: any[] = []
    for (const may of mays || []) {
      const mapped = mapByModel.get(normModel(may.model)) || []
      if (!mapped.length) continue
      const hist = histByMay.get(may.id) || []
      if (!hist.length) continue
      const latest = hist[hist.length - 1]
      const prev = hist.length >= 2 ? hist[hist.length - 2] : null
      // Số ngày kể từ KỲ CHỐT gần nhất tới hôm nay (để nội suy counter). Chặn trần 45 ngày (dữ liệu cũ -> đừng suy quá đà).
      const [yy, mm] = String(latest.thang_nam).split('-').map(Number)
      const lastDay = new Date(Date.UTC(yy, mm, 0)).getUTCDate()
      const readDay = may.chot_so_cuoi_thang ? lastDay : Math.min(Number(may.chot_so_ngay) || lastDay, lastDay)
      const readMs = Date.UTC(yy, mm - 1, readDay)
      const daysSince = Math.max(0, Math.min(45, Math.floor((nowVN - readMs) / 86400000)))
      for (const mc of mapped) {
        const Y = Number(mc.dinh_luong) || 0
        if (Y <= 0) continue
        const Cchot = counterOf(latest, mc.loai)
        if (!Number.isFinite(Cchot) || Cchot <= 0) continue
        // DỰ ĐOÁN counter HÔM NAY = counter chốt + (mức in/ngày × số ngày đã qua).
        // Mức in/ngày = mức in tháng gần nhất ÷ 26 (ngày làm việc/tháng) -> sát thực tế hơn /30.
        const mucInThang = prev ? Math.max(0, Cchot - counterOf(prev, mc.loai)) : 0
        const mucInNgay = mucInThang / 26
        const C = Math.round(Cchot + mucInNgay * daysSince) // dùng counter DỰ ĐOÁN cho mọi tính toán
        // Phiếu thay/giao ĐÚNG mã này (mực: "Giao mực"; trống: "Thay vật tư"), sắp theo ngày tăng dần.
        const giaoList = giaoByMay.get(String(may.ma_may || '').trim()) || []
        const need = (mc.nhom === 'trong') ? 'Thay vật tư' : 'Giao mực' // mực: chỉ Giao mực; trống: chỉ Thay vật tư
        const matched = giaoList.filter(g => g.ma_hang === mc.ma_hang && g.loai_cv === need)
        const tongGiao = matched.reduce((s, g) => s + g.so_luong, 0)
        const evSorted = matched.slice().sort((a, b) => String(a.ngay).localeCompare(String(b.ngay)))
        const countersAtThay = evSorted.map(g => counterAtDate(hist, g.ngay, mc.loai)).filter(c => Number.isFinite(c) && c > 0) as number[]
        // HỌC DUNG LƯỢNG THỰC:
        //  - Hộp FACTORY (hộp đầu): admin khai (dinh_luong_dau) > học từ counter lúc thay LẦN ĐẦU > = định lượng khai.
        //    (counter lúc thay lần đầu = số trang hộp factory đã in tới khi phải thay lần đầu.)
        //  - Hộp THAY: chỉ học khi có ≥2 Δ (≥3 lần thay) -> tránh bẫy "giao mực dự phòng TRƯỚC"
        //    (khi đó Δ giữa 2 phiếu < dung lượng thật). Học xong chỉ nhận nếu ≤ định lượng khai (an toàn: báo SỚM hơn).
        const D0admin = Number(mc.dinh_luong_dau) > 0 ? Number(mc.dinh_luong_dau) : 0
        const D0 = D0admin > 0 ? D0admin : (countersAtThay.length >= 1 ? countersAtThay[0] : Y)
        const deltas: number[] = []
        for (let i = 1; i < countersAtThay.length; i++) { const d = countersAtThay[i] - countersAtThay[i - 1]; if (d > 0) deltas.push(d) }
        const Ylearn = deltas.length >= 2 ? median(deltas) : null
        const Yrep = (Ylearn != null && Ylearn > 0) ? Math.min(Ylearn, Y) : Y
        // Kế toán hộp: hộp 1 = D0 (factory), các hộp sau = Yrep.
        let soHop: number, daIn: number, conLai: number, dinhLuongHop: number
        if (C <= D0) { soHop = 0; daIn = C; conLai = D0 - C; dinhLuongHop = D0 }
        else { const rem = C - D0; const k = Math.floor(rem / Yrep); soHop = 1 + k; daIn = rem % Yrep; conLai = Yrep - daIn; dinhLuongHop = Yrep }
        // (b) NGƯỠNG ĐỘNG: cảnh báo khi còn ≤ max(ngưỡng cố định, mức in ~1 tháng gần nhất).
        const nguongHieuLuc = Math.max(nguong, mucInThang)
        // (a) CÂN ĐỐI TỒN HỘP: 1 hộp factory + tổng hộp đã giao/thay so với số hộp đã "mở" (soHop+1).
        const duPhong = (1 + tongGiao) - (soHop + 1)
        const isAck = ackSet.has(`${may.ma_may}|${mc.ma_hang}|${soHop}`)
        // Trạng thái: da_gui (office đã bấm) > du_phong (còn hộp) > canh_bao (cần liên hệ) > on (còn nhiều)
        const trang_thai = isAck ? 'da_gui' : duPhong >= 1 ? 'du_phong' : conLai <= nguongHieuLuc ? 'canh_bao' : 'on'
        if (!showAll && trang_thai !== 'canh_bao') continue // mặc định chỉ trả máy cần cảnh báo
        // Phiếu giao/thay gần nhất của mã này (để office đối chiếu).
        const gn = evSorted[evSorted.length - 1]
        alerts.push({
          ma_may: may.ma_may, ten_khach_hang: may.ten_khach_hang, model: may.model,
          ma_muc: mc.ma_hang, loai: mc.loai, nhom: mc.nhom || 'muc', dinh_luong: Y,
          dinh_luong_hop: dinhLuongHop, dinh_luong_dau: D0 < Y ? D0 : null, // dung lượng hộp hiện tại + hộp factory (admin khai/tự học)
          yrep: Yrep < Y ? Yrep : null, // dung lượng hộp thay TỰ HỌC (nếu khác khai)
          counter: C, counter_chot: Cchot, muc_in_ngay: Math.round(mucInNgay), days_since: daysSince,
          da_in: daIn, con_lai: conLai, so_hop: soHop, thang_nam: latest.thang_nam,
          du_phong: duPhong, trang_thai,
          giao_gan_nhat: gn ? { so_phieu: gn.so_phieu, ngay: gn.ngay, so_luong: gn.so_luong } : null,
        })
      }
    }
    // MỖI MÃ 1 DÒNG (KHÔNG gộp bộ màu C/M/Y nữa — các màu mòn lệch nhau nên hiển thị riêng từng mã).
    const out = alerts.map(a => ({ ...a, ma_muc_list: [a.ma_muc] }))
    out.sort((a, b) => a.con_lai - b.con_lai)
    const count = out.filter((x: any) => x.trang_thai === 'canh_bao').length
    return NextResponse.json({ data: out, count, nguong })
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
