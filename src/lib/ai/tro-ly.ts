// Trợ lý AI nội bộ.
// Kiến trúc 2 bước: (1) LLM phân loại câu hỏi -> chọn tool + rút tham số; (2) chạy
// query THẬT (không để AI tự tính); (3) LLM diễn đạt NGẮN dựa trên dữ liệu thật.
// => Con số luôn từ DB, AI chỉ diễn đạt.
//
// Loại A (tra theo mã hàng chính xác): tonKho, datHang.
// Loại B (khớp tên khách/địa chỉ qua resolver + alias): congNo, giamDinh, baoTri, thueCpc.

import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { canBaoTriThang, LOAI_HD_BAO_TRI } from '@/lib/bao-tri'
import { chotSoDate, counterStatus } from '@/lib/thue-cpc'
import { geminiJSON, geminiText } from './gemini'

export type ToolResult = { summary: string; rows: any[]; columns: { key: string; label: string }[] }

// Bỏ dấu + chữ thường để so khớp tiếng Việt không phân biệt hoa/thường/dấu.
const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim()
const fmtVnd = (x: any) => (Math.round(Number(x) || 0)).toLocaleString('vi-VN')

// Từ dừng (bỏ khi tách từ khóa tìm hàng) — để "mực máy c227i" -> [muc, c227i].
// Lưu ý: KHÔNG cho "muc" vào đây vì trùng chuẩn hóa với "mực" (toner).
const KHO_STOP = new Set(['may', 'cua', 'cai', 'chiec', 'hop', 'con', 'bao', 'nhieu', 'la', 'ma', 'nao', 'cho', 'co', 'nhu', 'the', 'gi', 'o', 'va', 'bang', 'muon', 'hoi', 'thi', 'hang'])

// Tìm mặt hàng: theo MÃ chính xác trước; không có thì tách từ khóa và khớp TẤT CẢ
// trên (mã + tên + model). => "mực c227i", "trống c301i", "cụm sấy 6120" đều ra.
async function findKhoItems(query: string): Promise<any[]> {
  const raw = (query || '').trim()
  if (!raw) return []
  const sel = 'ma_hang, ten_hang, model, hang, ton_kho'
  const exact = await supabaseAdmin.from('soct_kho_hang').select(sel).eq('ma_hang', raw)
  if (exact.data && exact.data.length) return exact.data
  const tokens = norm(raw).split(/[^a-z0-9]+/).filter(t => t.length >= 2 && !KHO_STOP.has(t))
  if (!tokens.length) return []
  // Model Konica hay gõ kèm "C" (c301i) nhưng lưu "301i" -> cho phép bỏ "C" khi là c+số.
  const tokenHit = (hay: string, t: string) => hay.includes(t) || (/^c\d/.test(t) && hay.includes(t.slice(1)))
  const all = await selectAll((from, to) => supabaseAdmin.from('soct_kho_hang').select(sel).range(from, to))
  return (all as any[]).filter(it => {
    const hay = norm(it.ma_hang) + ' ' + norm(it.ten_hang) + ' ' + norm(it.model)
    return tokens.every(t => tokenHit(hay, t))
  }).slice(0, 40)
}

// ===== Tool A1: Tồn kho theo mã hàng / mô tả + model =====
async function tonKho(maHang: string): Promise<ToolResult> {
  const q = (maHang || '').trim()
  const columns = [{ key: 'ma_hang', label: 'Mã hàng' }, { key: 'ten_hang', label: 'Tên hàng' }, { key: 'model', label: 'Model' }, { key: 'ton_kho', label: 'Tồn kho' }]
  if (!q) return { summary: 'Thiếu mã hàng / mô tả.', rows: [], columns }
  const rows = await findKhoItems(q)
  const summary = rows.length === 0 ? `Không tìm thấy mặt hàng nào khớp "${q}".`
    : rows.map((d: any) => `${d.ma_hang} (${d.ten_hang || ''}${d.model ? ', model ' + d.model : ''}): tồn kho ${d.ton_kho}`).join('; ')
  return { summary, rows, columns }
}

// ===== Tool A2: Đặt hàng theo mã hàng / mô tả + model =====
async function datHang(maHang: string): Promise<ToolResult> {
  const q = (maHang || '').trim()
  const columns = [
    { key: 'ma_hang', label: 'Mã hàng' }, { key: 'so_don_hang', label: 'Số đơn' }, { key: 'ngay_dat', label: 'Ngày đặt' },
    { key: 'sl_dat', label: 'SL đặt' }, { key: 'da_nhan', label: 'Đã về' },
    { key: 'con_lai', label: 'Còn lại' }, { key: 'trang_thai', label: 'Trạng thái' },
  ]
  if (!q) return { summary: 'Thiếu mã hàng / mô tả.', rows: [], columns }
  // Giải mô tả -> danh sách mã hàng, rồi tra đơn đặt của các mã đó.
  const codes = (await findKhoItems(q)).map((i: any) => i.ma_hang)
  if (codes.length === 0) return { summary: `Không tìm thấy mặt hàng nào khớp "${q}".`, rows: [], columns }

  const sel = 'id, ma_hang, sl_dat, hoan_thanh, soct_dat_hang ( so_don_hang, ngay_dat, nha_cung_cap, da_dat ), soct_hang_ve_dot ( so_luong_nhan )'
  const { data: cts } = await supabaseAdmin.from('soct_dat_hang_ct').select(sel).in('ma_hang', codes)
  const rows = (cts || []).map((c: any) => {
    const nhan = (c.soct_hang_ve_dot || []).reduce((s: number, v: any) => s + (Number(v.so_luong_nhan) || 0), 0)
    const dat = Number(c.sl_dat) || 0
    return {
      ma_hang: c.ma_hang, so_don_hang: c.soct_dat_hang?.so_don_hang || '—', ngay_dat: c.soct_dat_hang?.ngay_dat || '',
      sl_dat: dat, da_nhan: nhan, con_lai: Math.max(0, dat - nhan),
      trang_thai: c.hoan_thanh ? 'Đã về đủ' : (nhan > 0 ? 'Về một phần' : (c.soct_dat_hang?.da_dat ? 'Chưa về' : 'Đơn nháp')),
    }
  }).sort((a: any, b: any) => String(b.ngay_dat).localeCompare(String(a.ngay_dat)))
  const summary = rows.length === 0 ? `Mặt hàng khớp (${codes.join(', ')}) nhưng chưa có đơn đặt nào.`
    : rows.map((r: any) => `${r.ma_hang} - đơn ${r.so_don_hang} (đặt ${r.ngay_dat}): đặt ${r.sl_dat}, đã về ${r.da_nhan}, còn ${r.con_lai} — ${r.trang_thai}`).join('; ')
  return { summary, rows, columns }
}

// ===== Tool A3: Liệt kê ĐƠN đặt hàng theo tháng (không theo mã hàng) =====
async function donHang(thang: string): Promise<ToolResult> {
  const columns = [
    { key: 'so_don_hang', label: 'Số đơn' }, { key: 'ngay_dat', label: 'Ngày đặt' },
    { key: 'nha_cung_cap', label: 'Nhà cung cấp' }, { key: 'so_dong', label: 'Số dòng' }, { key: 'trang_thai', label: 'Trạng thái' },
  ]
  const th = /^\d{4}-\d{2}$/.test(thang || '') ? thang : new Date().toISOString().slice(0, 7)
  const [y, m] = th.split('-').map(Number)
  const start = `${th}-01`
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

  const { data } = await supabaseAdmin
    .from('soct_dat_hang')
    .select('id, so_don_hang, ngay_dat, nha_cung_cap, da_dat, hoan_thanh, soct_dat_hang_ct ( id )')
    .gte('ngay_dat', start).lt('ngay_dat', next)
    .order('ngay_dat', { ascending: false })

  const rows = (data || []).map((d: any) => ({
    so_don_hang: d.so_don_hang || '—', ngay_dat: d.ngay_dat || '', nha_cung_cap: d.nha_cung_cap || '—',
    so_dong: (d.soct_dat_hang_ct || []).length,
    trang_thai: d.hoan_thanh ? 'Đã về đủ' : (d.da_dat ? 'Đã đặt (chờ về)' : 'Nháp'),
  }))
  const summary = rows.length === 0 ? `Tháng ${th} không có đơn đặt hàng nào.`
    : `Tháng ${th} có ${rows.length} đơn đặt hàng: ${rows.map((r: any) => `${r.so_don_hang} (${r.ngay_dat}, ${r.so_dong} dòng, ${r.trang_thai})`).join('; ')}.`
  return { summary, rows, columns }
}

// ===== Resolver: dựng danh sách "từ khóa" tìm khách (kèm mở rộng alias) =====
// Từ quá chung, bỏ khi tách để không làm loãng phép khớp.
const KH_STOP = new Set(['cua', 'tai', 'va', 'la', 'cho', 'o'])
const tokenize = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(t => t.length >= 2 && !KH_STOP.has(t))
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Trả về DANH SÁCH CỤM TỪ, mỗi cụm là mảng token.
// Khớp = ĐỦ MỌI token trong MỘT cụm (AND trong cụm, OR giữa các cụm).
// Trước đây gộp hết thành từ khóa rời rồi khớp OR -> biệt danh "vp -> văn phòng" khiến
// MỌI khách có chữ "Văn phòng" đều trúng (nhận nhầm khách). Nay biệt danh THAY THẾ
// từ viết tắt ngay trong cụm, giữ nguyên các từ còn lại -> chính xác hơn hẳn.
async function buildTerms(khach: string, khachMoRong: string, diaChi: string): Promise<string[][]> {
  const raws = [khach, khachMoRong, diaChi].map(s => norm(s)).filter(Boolean)
  if (raws.length === 0) return []

  const { data: aliases } = await supabaseAdmin.from('soct_alias').select('tu_khoa, mo_rong')
  const expand = (s: string) => {
    let out = s
    for (const a of (aliases || []) as any[]) {
      const tk = norm(a.tu_khoa), mr = norm(a.mo_rong)
      if (!tk || !mr) continue
      // chỉ thay khi khớp NGUYÊN từ (tránh "vp" ăn vào giữa chữ khác)
      out = out.replace(new RegExp(`(^|[^a-z0-9])${escapeRe(tk)}(?=[^a-z0-9]|$)`, 'g'), `$1${mr}`)
    }
    return out
  }

  const cands = new Set<string>()
  for (const r of raws) { cands.add(r); const e = expand(r); if (e && e !== r) cands.add(e) }
  return [...cands].map(tokenize).filter(t => t.length > 0)
}
// Khớp nếu có ÍT NHẤT MỘT cụm mà MỌI token của cụm đó đều xuất hiện.
const hitAny = (hay: string, terms: string[][]) => terms.some(ts => ts.every(t => hay.includes(t)))

// ===== Tool B1: Công nợ theo khách/cụm =====
async function congNo(terms: string[][]): Promise<ToolResult> {
  const columns = [{ key: 'don_vi', label: 'Đơn vị' }, { key: 'so_phieu', label: 'Số phiếu' }, { key: 'tong_tien', label: 'Tổng (chưa VAT)' }]
  if (terms.length === 0) return { summary: 'Chưa xác định được khách hàng cần tra.', rows: [], columns }

  const list = await selectAll((from, to) => supabaseAdmin
    .from('soct_cong_viec')
    .select(`id, report, trang_thai_hd, id_khach_hang,
      soct_khach_hang ( ten_khach_hang, dia_chi, ma_khach_cum, soct_khach_cum ( ten_khach_hang ) ),
      soct_chi_tiet_vat_tu ( so_luong, don_gia )`)
    .not('report', 'is', null).neq('report', '').neq('trang_thai_hd', 'Đã lên hóa đơn')
    .range(from, to))

  // Gom theo cụm/điểm máy giống giao diện Công nợ; chỉ giữ ticket khớp từ khóa.
  const groups = new Map<string, { don_vi: string; so_phieu: number; tong_tien: number }>()
  for (const t of list as any[]) {
    const kh = t.soct_khach_hang; const cum = kh?.soct_khach_cum
    const hay = norm(kh?.ten_khach_hang) + ' ' + norm(kh?.dia_chi) + ' ' + norm(cum?.ten_khach_hang)
    if (!hitAny(hay, terms)) continue
    const key = cum ? `cum:${kh.ma_khach_cum}` : `may:${t.id_khach_hang}`
    const ten = cum ? (cum.ten_khach_hang || '—') : (kh?.ten_khach_hang || '—')
    if (!groups.has(key)) groups.set(key, { don_vi: ten, so_phieu: 0, tong_tien: 0 })
    const g = groups.get(key)!
    g.so_phieu += 1
    g.tong_tien += (t.soct_chi_tiet_vat_tu || []).reduce((s: number, v: any) => s + (Number(v.don_gia) || 0) * (Number(v.so_luong) || 0), 0)
  }
  const rows = [...groups.values()].sort((a, b) => b.tong_tien - a.tong_tien).map(g => ({ ...g, tong_tien: fmtVnd(g.tong_tien) }))
  const total = [...groups.values()].reduce((s, g) => s + g.tong_tien, 0)
  const summary = rows.length === 0 ? 'Không tìm thấy công nợ nào khớp.'
    : `${rows.map(r => `${r.don_vi}: ${r.so_phieu} phiếu, ${r.tong_tien} đ (chưa VAT)`).join('; ')}. Tổng cộng: ${fmtVnd(total)} đ (chưa VAT).`
  return { summary, rows, columns }
}

// ===== Tool B2: Giám định chưa thay theo khách =====
async function giamDinh(terms: string[][]): Promise<ToolResult> {
  const columns = [{ key: 'khach', label: 'Khách hàng' }, { key: 'ma_may', label: 'Mã máy' }, { key: 'tinh_trang', label: 'Tình trạng' }, { key: 'bao_gia', label: 'Báo giá' }]
  if (terms.length === 0) return { summary: 'Chưa xác định được khách hàng cần tra.', rows: [], columns }

  const data = await selectAll((from, to) => supabaseAdmin
    .from('soct_giam_dinh')
    .select('id, ma_may, tinh_trang_may, da_bao_gia, ngay_giam_dinh, soct_khach_hang ( ten_khach_hang, dia_chi )')
    .eq('da_thay', false)
    .range(from, to))

  const rows = (data as any[])
    .filter(g => hitAny(norm(g.soct_khach_hang?.ten_khach_hang) + ' ' + norm(g.soct_khach_hang?.dia_chi) + ' ' + norm(g.ma_may), terms))
    .map(g => ({ khach: g.soct_khach_hang?.ten_khach_hang || '—', ma_may: g.ma_may || '—', tinh_trang: g.tinh_trang_may || '—', bao_gia: g.da_bao_gia ? 'Đã báo giá' : 'Chưa báo giá' }))
  const summary = rows.length === 0 ? 'Không có biên bản giám định nào chưa thay khớp khách này.'
    : `Có ${rows.length} máy giám định chưa thay: ${rows.map(r => `${r.ma_may} (${r.khach}) - ${r.tinh_trang} [${r.bao_gia}]`).join('; ')}.`
  return { summary, rows, columns }
}

// ===== Tool B3: Bảo trì theo khách/nơi — liệt kê máy thuộc diện bảo trì + trạng thái tháng này =====
async function baoTri(terms: string[][]): Promise<ToolResult> {
  const columns = [{ key: 'khach', label: 'Khách hàng' }, { key: 'ma_may', label: 'Mã máy' }, { key: 'model', label: 'Model' }, { key: 'loai_hd', label: 'Loại HĐ' }, { key: 'trang_thai', label: 'Bảo trì tháng này' }]
  if (terms.length === 0) return { summary: 'Chưa xác định được khách/nơi cần tra.', rows: [], columns }
  const thang = new Date().toISOString().slice(0, 7)

  const customers = await selectAll((from, to) => supabaseAdmin
    .from('soct_khach_hang')
    .select('ma_may, ten_khach_hang, dia_chi, model, loai_hd, thang_bao_tri, bat_dau_tu_thang, tam_dung_tu_thang')
    .range(from, to))
  const { data: btRecords } = await supabaseAdmin.from('soct_bao_tri').select('ma_may').eq('thang_nam', thang)
  const done = new Set((btRecords || []).map((r: any) => String(r.ma_may).toLowerCase()))

  const matched = (customers as any[]).filter(c => c.ma_may && hitAny(norm(c.ten_khach_hang) + ' ' + norm(c.dia_chi), terms))
  const dien = matched.filter(c => LOAI_HD_BAO_TRI.includes(String(c.loai_hd || '').trim()))
  const rows = dien.map(c => {
    const tt = done.has(String(c.ma_may).toLowerCase()) ? 'Đã bảo trì'
      : canBaoTriThang(c, thang) ? 'Chưa bảo trì' : 'Không đến hạn tháng này'
    return { khach: c.ten_khach_hang || '—', ma_may: c.ma_may || '—', model: c.model || '—', loai_hd: c.loai_hd || '—', trang_thai: tt }
  })
  const chua = rows.filter(r => r.trang_thai === 'Chưa bảo trì').length

  let summary: string
  if (matched.length === 0) summary = 'Không tìm thấy khách/máy nào khớp.'
  else if (rows.length === 0) summary = `Tìm thấy ${matched.length} máy khớp nhưng KHÔNG máy nào thuộc diện bảo trì (không có hợp đồng bảo trì HĐBT/MF).`
  else summary = `Có ${rows.length} máy thuộc diện bảo trì (tháng ${thang}): ${rows.map(r => `${r.ma_may} (${r.khach}, ${r.loai_hd}) - ${r.trang_thai}`).join('; ')}. Trong đó ${chua} máy chưa bảo trì tháng này.`
  return { summary, rows, columns }
}

// ===== Tool B4: Máy thuê / CPC theo địa chỉ hoặc khách =====
async function thueCpc(terms: string[][], loai: string): Promise<ToolResult> {
  const columns = [{ key: 'khach', label: 'Khách hàng' }, { key: 'ma_may', label: 'Mã máy' }, { key: 'model', label: 'Model' }, { key: 'loai_hd', label: 'Loại' }, { key: 'dia_chi', label: 'Địa chỉ' }]
  if (terms.length === 0) return { summary: 'Chưa xác định được nơi/khách cần tra.', rows: [], columns }

  const wanted = ['Máy thuê', 'Máy CPC'].includes(loai) ? [loai] : ['Máy thuê', 'Máy CPC']
  const customers = await selectAll((from, to) => supabaseAdmin
    .from('soct_khach_hang')
    .select('ma_may, ten_khach_hang, dia_chi, model, loai_hd')
    .in('loai_hd', wanted)
    .range(from, to))

  const rows = (customers as any[])
    .filter(c => hitAny(norm(c.ten_khach_hang) + ' ' + norm(c.dia_chi), terms))
    .map(c => ({ khach: c.ten_khach_hang || '—', ma_may: c.ma_may || '—', model: c.model || '—', loai_hd: c.loai_hd || '—', dia_chi: c.dia_chi || '—' }))
  const summary = rows.length === 0 ? 'Không tìm thấy máy thuê/CPC nào khớp.'
    : `Có ${rows.length} máy: ${rows.map(r => `${r.ma_may} - ${r.model} (${r.loai_hd}, ${r.khach}, ${r.dia_chi})`).join('; ')}.`
  return { summary, rows, columns }
}

// ===== Tool B4b: Lấy counter máy thuê/CPC — cần lấy / quá hạn / khách đã lấy chưa =====
async function counter(tinhTrang: string, ngay: string, maMay: string, terms: string[][]): Promise<ToolResult> {
  const columns = [{ key: 'khach', label: 'Khách hàng' }, { key: 'ma_may', label: 'Mã máy' }, { key: 'loai_hd', label: 'Loại' }, { key: 'chot', label: 'Ngày chốt' }, { key: 'trang_thai', label: 'Trạng thái counter' }]
  const vnNow = new Date(Date.now() + 7 * 3600 * 1000)
  const thang = vnNow.toISOString().slice(0, 7)
  const today = vnNow.toISOString().slice(0, 10)
  // Ngưỡng "sắp đến hạn" = ít nhất 5 ngày, mở tới CUỐI THÁNG để hợp câu "từ giờ đến cuối tháng".
  const [y, m] = thang.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const lead = Math.max(5, lastDay - vnNow.getUTCDate())

  const mays = await selectAll((from, to) => supabaseAdmin
    .from('soct_khach_hang')
    .select('id, ten_khach_hang, ma_may, loai_hd, chot_so_ngay, chot_so_cuoi_thang')
    .in('loai_hd', ['Máy thuê', 'Máy CPC'])
    .range(from, to))
  const { data: counters } = await supabaseAdmin
    .from('soct_thue_cpc_counter').select('id_khach_hang, so_bw, so_mau').eq('thang_nam', thang)
  const daNhapSet = new Set((counters || []).filter((c: any) => c.so_bw != null || c.so_mau != null).map((c: any) => c.id_khach_hang))

  const label = (st: any) => st.status === 'done' ? 'Đã nhập'
    : st.status === 'overdue' ? `Quá hạn ${st.days} ngày`
      : st.status === 'due_soon' ? (st.days === 0 ? 'Đến hạn hôm nay' : `Còn ${st.days} ngày`)
        : st.status === 'not_yet' ? `Chưa tới hạn (còn ${st.days} ngày)` : 'Chưa đặt ngày chốt'

  let list = (mays as any[]).map(mc => ({ ...mc, _st: counterStatus(chotSoDate(thang, mc.chot_so_ngay, mc.chot_so_cuoi_thang), daNhapSet.has(mc.id), today, lead) }))

  // Hỏi theo NGÀY CHỐT SỐ cụ thể ("máy nào cần lấy counter ngày 25")
  const day = /^\d{4}-\d{2}-\d{2}$/.test(ngay || '') ? parseInt(ngay.slice(8, 10), 10) : null
  const qMa = norm(maMay || '')

  if (qMa) list = list.filter(mc => norm(mc.ma_may).includes(qMa))
  if (terms.length) list = list.filter(mc => hitAny(norm(mc.ten_khach_hang) + ' ' + norm(mc.ma_may), terms))

  if (day != null) {
    // Lọc đúng máy CHỐT SỐ vào ngày đó (cuối tháng tính là ngày cuối), và chỉ máy CHƯA nhập
    list = list.filter(mc => (mc.chot_so_ngay === day || (mc.chot_so_cuoi_thang && day === lastDay)) && mc._st.status !== 'done')
  } else if (!qMa && terms.length === 0) {
    // Hỏi chung -> chỉ máy cần lấy: quá hạn (+ sắp đến hạn nếu không yêu cầu riêng "quá hạn").
    list = list.filter(mc => tinhTrang === 'qua_han' ? mc._st.status === 'overdue' : (mc._st.status === 'overdue' || mc._st.status === 'due_soon'))
  }
  // Có mã máy / khách cụ thể -> giữ nguyên mọi máy khớp kèm trạng thái (kể cả đã nhập)
  list.sort((a, b) => (a._st.status === 'overdue' ? 0 : 1) - (b._st.status === 'overdue' ? 0 : 1) || a._st.days - b._st.days)

  const chotLbl = (mc: any) => mc.chot_so_cuoi_thang ? 'Cuối tháng' : (mc.chot_so_ngay ? `Ngày ${mc.chot_so_ngay}` : '—')
  const rows = list.map(mc => ({ khach: mc.ten_khach_hang || '—', ma_may: mc.ma_may || '—', loai_hd: mc.loai_hd || '—', chot: chotLbl(mc), trang_thai: label(mc._st) }))
  const dayLbl = day != null ? ` chốt số ngày ${day}` : ''
  const summary = rows.length === 0
    ? ((qMa || terms.length) ? 'Không tìm thấy máy thuê/CPC nào khớp.' : `Không có máy thuê/CPC nào cần lấy counter${dayLbl} (tới ${today}).`)
    : `${rows.length} máy${dayLbl}: ${rows.map(r => `${r.ma_may} (${r.khach}, ${r.chot}) - ${r.trang_thai}`).join('; ')}.`
  return { summary, rows, columns }
}

// ===== Tool B5: Thống kê / liệt kê công việc theo thời gian + loại việc + trạng thái + khách =====
async function congViec(ngay: string, thang: string, loaiViec: string, tinhTrang: string, terms: string[][]): Promise<ToolResult> {
  const columns = [
    { key: 'ngay', label: 'Ngày' }, { key: 'khach', label: 'Khách hàng' }, { key: 'ma_may', label: 'Mã máy' },
    { key: 'loai_cong_viec', label: 'Loại việc' }, { key: 'ket_qua', label: 'Trạng thái' }, { key: 'ktv', label: 'KTV' }, { key: 'report', label: 'Số phiếu' },
  ]
  const sel = 'id, ngay, loai_cong_viec, ket_qua, report, ma_may, soct_khach_hang ( ten_khach_hang, dia_chi ), soct_users!ktv_id ( full_name )'
  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(ngay || '')
  const th = /^\d{4}-\d{2}$/.test(thang || '') ? thang : new Date().toISOString().slice(0, 7)
  const [y, m] = th.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

  const data = await selectAll((from, to) => {
    let q = supabaseAdmin.from('soct_cong_viec').select(sel)
    if (isDay) q = q.eq('ngay', ngay)
    else q = q.gte('ngay', `${th}-01`).lt('ngay', next)
    if (loaiViec) q = q.ilike('loai_cong_viec', `%${loaiViec}%`)
    // chưa xong = chưa Hoàn thành; đã xong = Hoàn thành
    if (tinhTrang === 'chua_xong') q = q.neq('ket_qua', 'Hoàn thành')
    else if (tinhTrang === 'da_xong') q = q.eq('ket_qua', 'Hoàn thành')
    return q.order('ngay', { ascending: false }).range(from, to)
  })

  let list = data as any[]
  if (terms.length) list = list.filter(t => hitAny(norm(t.soct_khach_hang?.ten_khach_hang) + ' ' + norm(t.soct_khach_hang?.dia_chi) + ' ' + norm(t.ma_may), terms))
  const rows = list.map(t => ({
    ngay: t.ngay, khach: t.soct_khach_hang?.ten_khach_hang || '—', ma_may: t.ma_may || '—',
    loai_cong_viec: t.loai_cong_viec || '—', ket_qua: t.ket_qua || '—', ktv: t.soct_users?.full_name || '—', report: t.report || '—',
  }))
  const kyLabel = isDay ? `ngày ${ngay}` : `tháng ${th}`
  const loaiLabel = loaiViec ? ` loại "${loaiViec}"` : ''
  const ttLabel = tinhTrang === 'chua_xong' ? ' (chưa xong)' : tinhTrang === 'da_xong' ? ' (đã xong)' : ''
  const summary = rows.length === 0 ? `Không có phiếu công việc nào${loaiLabel}${ttLabel} trong ${kyLabel}.`
    : `${kyLabel}${loaiLabel}${ttLabel}: có ${rows.length} phiếu — ${rows.slice(0, 40).map(r => `${r.report} ${r.khach} (${r.loai_cong_viec}, ${r.ket_qua}${r.ma_may !== '—' ? ', máy ' + r.ma_may : ''})`).join('; ')}.`
  return { summary, rows, columns }
}

// ===== Tool B6: Tra thông tin khách hàng / điểm máy theo tên =====
async function khachHang(terms: string[][]): Promise<ToolResult> {
  const columns = [{ key: 'khach', label: 'Khách hàng' }, { key: 'dia_chi', label: 'Địa chỉ' }, { key: 'ma_may', label: 'Mã máy' }, { key: 'model', label: 'Model' }, { key: 'loai_hd', label: 'Loại HĐ' }]
  if (terms.length === 0) return { summary: 'Chưa xác định được khách cần tra.', rows: [], columns }
  const customers = await selectAll((from, to) => supabaseAdmin
    .from('soct_khach_hang').select('ten_khach_hang, dia_chi, ma_may, model, hang, loai_hd').range(from, to))
  const rows = (customers as any[])
    .filter(c => hitAny(norm(c.ten_khach_hang) + ' ' + norm(c.dia_chi), terms))
    .map(c => ({ khach: c.ten_khach_hang || '—', dia_chi: c.dia_chi || '—', ma_may: c.ma_may || '—', model: c.model || '—', loai_hd: c.loai_hd || '—' }))
    .slice(0, 50)
  const summary = rows.length === 0 ? 'Không tìm thấy khách hàng nào khớp.'
    : `Có ${rows.length} kết quả: ${rows.map(r => `${r.khach} — ${r.dia_chi}${r.ma_may !== '—' ? ` (máy ${r.ma_may}, ${r.model})` : ''}`).join('; ')}.`
  return { summary, rows, columns }
}

// ===== Tool B7: Lịch sử thay vật tư của một MÃ MÁY =====
async function vatTuMay(maMay: string): Promise<ToolResult> {
  const columns = [{ key: 'ngay', label: 'Ngày' }, { key: 'vat_tu', label: 'Vật tư đã thay' }, { key: 'loai_cong_viec', label: 'Loại việc' }, { key: 'report', label: 'Số phiếu' }]
  const q = (maMay || '').trim()
  if (!q) return { summary: 'Thiếu mã máy.', rows: [], columns }
  const sel = 'ngay, loai_cong_viec, report, ma_may, soct_chi_tiet_vat_tu ( so_luong, ma_hang, soct_kho_hang ( ten_hang ) )'
  let { data } = await supabaseAdmin.from('soct_cong_viec').select(sel).eq('ma_may', q).order('ngay', { ascending: false })
  if (!data || data.length === 0) {
    const r = await supabaseAdmin.from('soct_cong_viec').select(sel).ilike('ma_may', `%${q}%`).order('ngay', { ascending: false }).limit(100)
    data = r.data || []
  }
  const rows = (data || [])
    .filter((t: any) => (t.soct_chi_tiet_vat_tu || []).length > 0)
    .map((t: any) => ({
      ngay: t.ngay, ma_may: t.ma_may || '—',
      vat_tu: (t.soct_chi_tiet_vat_tu || []).map((v: any) => `${v.soct_kho_hang?.ten_hang || v.ma_hang}${(Number(v.so_luong) || 0) > 1 ? ' x' + v.so_luong : ''}`).join(', '),
      loai_cong_viec: t.loai_cong_viec || '—', report: t.report || '—',
    }))
  const summary = rows.length === 0 ? `Không thấy lần thay vật tư nào cho máy "${q}".`
    : `Máy ${q} đã thay vật tư ${rows.length} lần: ${rows.map((r: any) => `${r.ngay}: ${r.vat_tu}`).join('; ')}.`
  return { summary, rows, columns }
}

// ===== Tool B8: Giá BÁN vật tư cho khách (lấy từ vật tư đã xuất trên phiếu) =====
async function giaBan(maHang: string, terms: string[][]): Promise<ToolResult> {
  const columns = [{ key: 'ngay', label: 'Ngày' }, { key: 'khach', label: 'Khách hàng' }, { key: 'ten_hang', label: 'Vật tư' }, { key: 'so_luong', label: 'SL' }, { key: 'don_gia', label: 'Đơn giá' }, { key: 'vat', label: 'VAT%' }]
  const q = (maHang || '').trim()
  if (!q) return { summary: 'Chưa rõ vật tư cần tra giá.', rows: [], columns }

  const items = await findKhoItems(q)
  if (items.length === 0) return { summary: `Không tìm thấy mặt hàng nào khớp "${q}".`, rows: [], columns }
  const codes = items.map((i: any) => i.ma_hang)
  const tenByMa = new Map(items.map((i: any) => [i.ma_hang, i.ten_hang]))

  const data = await selectAll((from, to) => supabaseAdmin
    .from('soct_chi_tiet_vat_tu')
    .select('ma_hang, so_luong, don_gia, vat, soct_cong_viec ( ngay, soct_khach_hang ( ten_khach_hang ) )')
    .in('ma_hang', codes)
    .range(from, to))

  let list = (data as any[]).filter(v => (Number(v.don_gia) || 0) > 0)
  if (terms.length) list = list.filter(v => hitAny(norm(v.soct_cong_viec?.soct_khach_hang?.ten_khach_hang), terms))
  list.sort((a, b) => String(b.soct_cong_viec?.ngay || '').localeCompare(String(a.soct_cong_viec?.ngay || '')))

  const rows = list.slice(0, 30).map(v => ({
    ngay: v.soct_cong_viec?.ngay || '', khach: v.soct_cong_viec?.soct_khach_hang?.ten_khach_hang || '—',
    ten_hang: tenByMa.get(v.ma_hang) || v.ma_hang, so_luong: Number(v.so_luong) || 0,
    don_gia: fmtVnd(v.don_gia), vat: Number(v.vat) || 0,
  }))
  const summary = rows.length === 0
    ? `Chưa có lần bán nào có giá cho "${q}"${terms.length ? ' với khách này' : ''}.`
    : `Giá bán gần nhất: ${rows[0].don_gia} đ (${rows[0].ngay}, ${rows[0].khach}). ${rows.length} lần bán gần đây: ${rows.map(r => `${r.ngay} ${r.khach} - ${r.ten_hang} x${r.so_luong} @ ${r.don_gia} đ (VAT ${r.vat}%)`).join('; ')}.`
  return { summary, rows, columns }
}

// ===== Tool B9: Counter ĐÃ GHI của một máy (bảo trì + phiếu công việc + thuê/CPC) =====
async function counterMay(maMay: string, terms: string[][]): Promise<ToolResult> {
  const columns = [{ key: 'ngay', label: 'Thời điểm' }, { key: 'ma_may', label: 'Mã máy' }, { key: 'khach', label: 'Khách hàng' }, { key: 'counter', label: 'Counter' }, { key: 'nguon', label: 'Nguồn' }]
  const qMa = norm(maMay || '')
  if (!qMa && terms.length === 0) return { summary: 'Chưa rõ máy cần tra counter.', rows: [], columns }

  const customers = await selectAll((from, to) => supabaseAdmin
    .from('soct_khach_hang').select('id, ma_may, ten_khach_hang').range(from, to))
  let mays = (customers as any[]).filter(c => c.ma_may)
  if (qMa) mays = mays.filter(c => norm(c.ma_may).includes(qMa))
  if (terms.length) mays = mays.filter(c => hitAny(norm(c.ten_khach_hang) + ' ' + norm(c.ma_may), terms))
  if (mays.length === 0) return { summary: 'Không tìm thấy máy nào khớp.', rows: [], columns }

  const codes = mays.map(c => c.ma_may)
  const ids = mays.map(c => c.id)
  const khachByMa = new Map(mays.map(c => [c.ma_may, c.ten_khach_hang]))
  const maById = new Map(mays.map(c => [c.id, c.ma_may]))

  const [bt, cv, tc] = await Promise.all([
    supabaseAdmin.from('soct_bao_tri').select('ma_may, thang_nam, counter').in('ma_may', codes).not('counter', 'is', null),
    supabaseAdmin.from('soct_cong_viec').select('ma_may, ngay, counter').in('ma_may', codes).not('counter', 'is', null),
    supabaseAdmin.from('soct_thue_cpc_counter').select('id_khach_hang, thang_nam, so_bw, so_mau').in('id_khach_hang', ids),
  ])

  const rows: any[] = []
  for (const r of (bt.data || []) as any[]) rows.push({ ngay: r.thang_nam, ma_may: r.ma_may, khach: khachByMa.get(r.ma_may) || '—', counter: Number(r.counter).toLocaleString('vi-VN'), nguon: 'Bảo trì' })
  for (const r of (cv.data || []) as any[]) rows.push({ ngay: r.ngay, ma_may: r.ma_may, khach: khachByMa.get(r.ma_may) || '—', counter: Number(r.counter).toLocaleString('vi-VN'), nguon: 'Phiếu công việc' })
  for (const r of (tc.data || []) as any[]) {
    const ma = maById.get(r.id_khach_hang) || '—'
    const parts = [r.so_bw != null ? `đen ${Number(r.so_bw).toLocaleString('vi-VN')}` : '', r.so_mau != null ? `màu ${Number(r.so_mau).toLocaleString('vi-VN')}` : ''].filter(Boolean)
    if (parts.length) rows.push({ ngay: r.thang_nam, ma_may: ma, khach: khachByMa.get(ma) || '—', counter: parts.join(' / '), nguon: 'Thuê/CPC' })
  }
  rows.sort((a, b) => String(b.ngay).localeCompare(String(a.ngay)))

  const top = rows.slice(0, 30)
  const summary = top.length === 0
    ? `Máy khớp (${codes.slice(0, 5).join(', ')}) nhưng chưa ghi counter lần nào.`
    : `Counter gần nhất: ${top[0].counter} (${top[0].ngay}, máy ${top[0].ma_may}, nguồn ${top[0].nguon}). Lịch sử: ${top.map(r => `${r.ngay} máy ${r.ma_may}: ${r.counter} [${r.nguon}]`).join('; ')}.`
  return { summary, rows: top, columns }
}

// ===== Orchestration =====
const CLASSIFY_SYSTEM = `Bạn là bộ phân loại câu hỏi cho phần mềm quản lý dịch vụ máy photocopy (tiếng Việt).
Chọn 1 công cụ và rút tham số:
- tonKho: hỏi TỒN KHO / còn bao nhiêu, HOẶC hỏi MÃ HÀNG của một vật tư/bộ phận. Vật tư có thể nêu bằng MÃ (S6704G) hoặc MÔ TẢ kèm model máy (VD "mực c227i", "trống máy c301i", "cụm sấy 6120", "hộp mực thải máy 6120"). -> điền ma_hang = NGUYÊN cụm mô tả/mã người dùng nói (giữ cả tên bộ phận lẫn model).
- datHang: hỏi ĐẶT HÀNG đã về chưa / về mấy hộp của MỘT vật tư cụ thể (nêu bằng mã hoặc mô tả + model như trên) -> điền ma_hang tương tự.
- donHang: hỏi LIỆT KÊ đơn đặt hàng theo THỜI GIAN, KHÔNG gắn mã hàng cụ thể (VD "tháng này có đơn đặt hàng nào", "các đơn đặt hàng tháng 6", "gần đây đặt gì") -> nếu rõ tháng thì điền thang dạng YYYY-MM, "tháng này"/"gần đây" thì để thang rỗng.
- congNo: hỏi CÔNG NỢ / còn nợ bao nhiêu của một KHÁCH -> điền khach.
- giamDinh: hỏi GIÁM ĐỊNH chưa thay / còn giám định nào của một KHÁCH -> điền khach.
- baoTri: hỏi về BẢO TRÌ ở một KHÁCH/NƠI (có máy nào bảo trì, máy nào chưa bảo trì, máy thuộc diện bảo trì) -> điền khach (và/hoặc dia_chi nếu là nơi chốn).
- thueCpc: hỏi DANH SÁCH MÁY THUÊ / MÁY CPC ở đâu / của ai (KHÔNG hỏi về counter) -> điền dia_chi (nơi chốn) hoặc khach, và loai nếu rõ.
- counter: hỏi VIỆC LẤY COUNTER máy thuê-CPC — máy nào CẦN LẤY / SẮP đến hạn / QUÁ HẠN, "khách X đã lấy counter chưa" -> tinh_trang="qua_han" nếu chỉ hỏi quá hạn; điền khach/ma_may nếu hỏi cụ thể. QUAN TRỌNG: nếu hỏi theo NGÀY CHỐT SỐ ("máy nào cần lấy counter ngày 25") -> điền ngay = ngày đó (YYYY-MM-DD, tháng/năm của hôm nay).
- counterMay: hỏi CHỈ SỐ COUNTER ĐÃ GHI của một máy là bao nhiêu (VD "counter máy 958 ở vp tw đảng", "máy X counter bao nhiêu", "chỉ số máy Y") -> điền ma_may và khach nếu có. (Khác counter: bên kia hỏi CÓ CẦN LẤY không, bên này hỏi SỐ LÀ BAO NHIÊU.)
- giaBan: hỏi GIÁ BÁN / bán bao nhiêu tiền của một VẬT TƯ (có thể kèm khách) (VD "mực im2500 phòng tccb bán giá bao nhiêu", "giá bán trống c301i", "mực máy 2500 bán bao nhiêu") -> điền ma_hang = mô tả vật tư, khach nếu có nêu khách.
- congViec: THỐNG KÊ / LIỆT KÊ phiếu công việc theo THỜI GIAN và/hoặc LOẠI VIỆC và/hoặc TRẠNG THÁI và/hoặc khách (VD "ngày 16/7 có bao nhiêu phiếu sửa chữa", "hôm nay có phiếu nào chưa xong", "hôm nay lắp mấy máy") -> điền ngay (YYYY-MM-DD) nếu hỏi 1 ngày, hoặc thang (YYYY-MM) nếu hỏi tháng; loai_viec = loại công việc (Sửa máy, Thay vật tư, Lắp máy, Bảo trì, Giao mực, Bảo hành...) nếu có; tinh_trang = "chua_xong" nếu hỏi phiếu CHƯA XONG/chưa hoàn thành/còn dở, "da_xong" nếu hỏi ĐÃ XONG/hoàn thành, để rỗng nếu không nói; khach nếu giới hạn 1 khách.
- vatTuMay: hỏi LỊCH SỬ THAY VẬT TƯ/linh kiện của một MÃ MÁY cụ thể (VD "máy 36114 đã thay vật tư gì", "máy X thay linh kiện ngày nào") -> điền ma_may = mã máy đó.
- khachHang: tra THÔNG TIN khách hàng/điểm máy — địa chỉ ở đâu, model máy gì, KHÁCH DÙNG MÁY GÌ, loại HĐ (VD "công ty X địa chỉ ở đâu", "khách Y dùng máy gì") -> điền khach.
- none: không thuộc các loại trên.
ma_hang có thể là MÃ (chuỗi chữ-số như 1T02NK0AX0, S6704G) HOẶC MÔ TẢ vật tư kèm model máy (như "mực c227i", "trống c301i"). "khach" là mảnh tên khách/phòng/đơn vị người dùng nói. "ma_may" là mã máy (dãy số như 36114).
QUY ĐỔI NGÀY theo dòng "Hôm nay là YYYY-MM-DD" ở đầu: "hôm nay"/"nay" -> ngay = hôm nay; "hôm qua" -> hôm trước; "16/7" hoặc "ngày 16/7" -> ngay theo NĂM của hôm nay; "tháng này" -> thang của hôm nay; "tháng 6"/"đầu tháng 6" -> thang=YYYY-06 (năm hôm nay). TUYỆT ĐỐI KHÔNG bịa năm khác.
Quan trọng: nếu "khach" có VIẾT TẮT hoặc tên rút gọn, điền dạng ĐẦY ĐỦ vào "khach_mo_rong"
(VD "tccb" -> "tổ chức cán bộ"; "pv06" -> "cục hồ sơ nghiệp vụ"; "vp" -> "văn phòng"; "tw" -> "trung ương";
"vp tw đảng" -> "văn phòng trung ương đảng"; "ct" -> "công ty"; "bca" -> "bộ công an"; "btp" -> "bộ tư pháp").
Không rút được thì để rỗng.
Chỉ trả JSON đúng schema.`

const CLASSIFY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    tool: { type: 'STRING', enum: ['tonKho', 'datHang', 'donHang', 'congNo', 'giamDinh', 'baoTri', 'thueCpc', 'counter', 'counterMay', 'giaBan', 'congViec', 'vatTuMay', 'khachHang', 'none'] },
    ma_hang: { type: 'STRING' }, khach: { type: 'STRING' }, khach_mo_rong: { type: 'STRING' },
    dia_chi: { type: 'STRING' }, loai: { type: 'STRING' }, thang: { type: 'STRING' },
    ngay: { type: 'STRING' }, loai_viec: { type: 'STRING' }, tinh_trang: { type: 'STRING' }, ma_may: { type: 'STRING' },
  },
  required: ['tool', 'ma_hang', 'khach', 'khach_mo_rong', 'dia_chi', 'loai', 'thang', 'ngay', 'loai_viec', 'tinh_trang', 'ma_may'],
}

const PHRASE_SYSTEM = `Bạn là trợ lý nội bộ công ty dịch vụ máy photocopy. Trả lời NGẮN GỌN bằng tiếng Việt,
CHỈ dựa trên "Dữ liệu" được cung cấp — TUYỆT ĐỐI không bịa thêm số liệu.
QUY TẮC BẮT BUỘC:
- Nếu "Số mục tìm được" > 0 (Dữ liệu không rỗng): PHẢI khẳng định là CÓ và tóm tắt/liệt kê kết quả.
  TUYỆT ĐỐI KHÔNG nói "không tìm thấy" / "không có" khi Dữ liệu có mục.
- Chỉ nói "không tìm thấy" khi "Số mục tìm được" = 0.
- Dữ liệu đã được lọc đúng theo câu hỏi; hãy tin và trình bày, không tự phủ nhận.
Tiền hiển thị dạng phân tách nghìn kèm "đ"; số lượng/tồn kho để nguyên.`

type Cls = { tool: string; ma_hang: string; khach: string; khach_mo_rong: string; dia_chi: string; loai: string; thang: string; ngay: string; loai_viec: string; tinh_trang: string; ma_may: string }

const TOOL_LABEL: Record<string, string> = {
  tonKho: 'Tồn kho', datHang: 'Đặt hàng', donHang: 'Đơn đặt hàng', congNo: 'Công nợ', giamDinh: 'Giám định', baoTri: 'Bảo trì', thueCpc: 'Thuê / CPC', counter: 'Lấy counter', counterMay: 'Counter máy', giaBan: 'Giá bán', congViec: 'Công việc', vatTuMay: 'Vật tư máy', khachHang: 'Khách hàng',
}

// allow(tool): trợ lý chỉ trả lời module mà người dùng có quyền xem (admin luôn true).
export async function runAssistant(question: string, opts?: { allow?: (tool: string) => boolean }): Promise<{ answer: string; rows: any[]; columns: { key: string; label: string }[]; tool: string; params: any }> {
  // Tiêm NGÀY HÔM NAY (giờ VN) để AI quy đổi "hôm nay/16-7/đầu tháng 6..." đúng, khỏi đoán bừa.
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
  const c = await geminiJSON<Cls>(CLASSIFY_SYSTEM, `Hôm nay là ${today}.\nCâu hỏi: ${question}`, CLASSIFY_SCHEMA)
  // Tham số AI rút ra (bỏ trường rỗng) — để soi trong Nhật ký khi trả lời sai.
  const params: any = {}
  for (const k of ['ma_hang', 'khach', 'khach_mo_rong', 'dia_chi', 'loai', 'thang', 'ngay', 'loai_viec', 'tinh_trang', 'ma_may'] as const) if (c[k]) params[k] = c[k]

  if (c.tool !== 'none' && opts?.allow && !opts.allow(c.tool)) {
    return { answer: `Bạn không có quyền xem dữ liệu ${TOOL_LABEL[c.tool] || 'này'} nên trợ lý không thể trả lời câu hỏi này.`, rows: [], columns: [], tool: c.tool, params }
  }

  let result: ToolResult
  if (c.tool === 'tonKho') result = await tonKho(c.ma_hang)
  else if (c.tool === 'datHang') result = await datHang(c.ma_hang)
  else if (c.tool === 'donHang') result = await donHang(c.thang)
  else if (c.tool === 'congViec') { const terms = await buildTerms(c.khach, c.khach_mo_rong, ''); result = await congViec(c.ngay, c.thang, c.loai_viec, c.tinh_trang, terms) }
  else if (c.tool === 'vatTuMay') result = await vatTuMay(c.ma_may)
  else if (c.tool === 'counter') { const terms = await buildTerms(c.khach, c.khach_mo_rong, c.dia_chi); result = await counter(c.tinh_trang, c.ngay, c.ma_may, terms) }
  else if (c.tool === 'counterMay') { const terms = await buildTerms(c.khach, c.khach_mo_rong, c.dia_chi); result = await counterMay(c.ma_may, terms) }
  else if (c.tool === 'giaBan') { const terms = await buildTerms(c.khach, c.khach_mo_rong, ''); result = await giaBan(c.ma_hang, terms) }
  else if (c.tool === 'khachHang') { const terms = await buildTerms(c.khach, c.khach_mo_rong, c.dia_chi); result = await khachHang(terms) }
  else if (c.tool === 'congNo' || c.tool === 'giamDinh' || c.tool === 'baoTri' || c.tool === 'thueCpc') {
    const terms = await buildTerms(c.khach, c.khach_mo_rong, c.dia_chi)
    if (c.tool === 'congNo') result = await congNo(terms)
    else if (c.tool === 'giamDinh') result = await giamDinh(terms)
    else if (c.tool === 'baoTri') result = await baoTri(terms)
    else result = await thueCpc(terms, c.loai)
  } else return {
    answer: 'Tôi chưa hiểu câu hỏi của bạn / hoặc bạn chưa có quyền khai thác dữ liệu liên quan đến câu hỏi.',
    rows: [], columns: [], tool: 'none', params,
  }

  const answer = await geminiText(PHRASE_SYSTEM, `Câu hỏi: ${question}\n\nSố mục tìm được: ${result.rows.length}\n\nDữ liệu:\n${result.summary}`)
  return { answer: answer || result.summary, rows: result.rows, columns: result.columns, tool: c.tool, params }
}
