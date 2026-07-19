// Trợ lý AI nội bộ.
// Kiến trúc 2 bước: (1) LLM phân loại câu hỏi -> chọn tool + rút tham số; (2) chạy
// query THẬT (không để AI tự tính); (3) LLM diễn đạt NGẮN dựa trên dữ liệu thật.
// => Con số luôn từ DB, AI chỉ diễn đạt.
//
// Loại A (tra theo mã hàng chính xác): tonKho, datHang.
// Loại B (khớp tên khách/địa chỉ qua resolver + alias): congNo, giamDinh, baoTri, thueCpc.

import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { canBaoTriThang, LOAI_HD_BAO_TRI } from '@/lib/bao-tri'
import { geminiJSON, geminiText } from './gemini'

export type ToolResult = { summary: string; rows: any[]; columns: { key: string; label: string }[] }

// Bỏ dấu + chữ thường để so khớp tiếng Việt không phân biệt hoa/thường/dấu.
const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim()
const fmtVnd = (x: any) => (Math.round(Number(x) || 0)).toLocaleString('vi-VN')

// ===== Tool A1: Tồn kho theo mã hàng =====
async function tonKho(maHang: string): Promise<ToolResult> {
  const q = (maHang || '').trim()
  const columns = [{ key: 'ma_hang', label: 'Mã hàng' }, { key: 'ten_hang', label: 'Tên hàng' }, { key: 'model', label: 'Model' }, { key: 'ton_kho', label: 'Tồn kho' }]
  if (!q) return { summary: 'Thiếu mã hàng.', rows: [], columns }
  const sel = 'ma_hang, ten_hang, model, hang, ton_kho'
  let { data } = await supabaseAdmin.from('soct_kho_hang').select(sel).eq('ma_hang', q)
  if (!data || data.length === 0) {
    const r = await supabaseAdmin.from('soct_kho_hang').select(sel).or(`ma_hang.ilike.%${q}%,ten_hang.ilike.%${q}%`).limit(20)
    data = r.data || []
  }
  const rows = data || []
  const summary = rows.length === 0 ? `Không tìm thấy mã hàng "${q}".`
    : rows.map((d: any) => `${d.ma_hang} (${d.ten_hang || ''}): tồn kho ${d.ton_kho}`).join('; ')
  return { summary, rows, columns }
}

// ===== Tool A2: Đặt hàng theo mã hàng =====
async function datHang(maHang: string): Promise<ToolResult> {
  const q = (maHang || '').trim()
  const columns = [
    { key: 'so_don_hang', label: 'Số đơn' }, { key: 'ngay_dat', label: 'Ngày đặt' },
    { key: 'sl_dat', label: 'SL đặt' }, { key: 'da_nhan', label: 'Đã về' },
    { key: 'con_lai', label: 'Còn lại' }, { key: 'trang_thai', label: 'Trạng thái' },
  ]
  if (!q) return { summary: 'Thiếu mã hàng.', rows: [], columns }
  const sel = 'id, ma_hang, sl_dat, hoan_thanh, soct_dat_hang ( so_don_hang, ngay_dat, nha_cung_cap, da_dat ), soct_hang_ve_dot ( so_luong_nhan )'
  let { data: cts } = await supabaseAdmin.from('soct_dat_hang_ct').select(sel).eq('ma_hang', q)
  if (!cts || cts.length === 0) {
    const r = await supabaseAdmin.from('soct_dat_hang_ct').select(sel).ilike('ma_hang', `%${q}%`).limit(30)
    cts = r.data || []
  }
  const rows = (cts || []).map((c: any) => {
    const nhan = (c.soct_hang_ve_dot || []).reduce((s: number, v: any) => s + (Number(v.so_luong_nhan) || 0), 0)
    const dat = Number(c.sl_dat) || 0
    return {
      so_don_hang: c.soct_dat_hang?.so_don_hang || '—', ngay_dat: c.soct_dat_hang?.ngay_dat || '',
      sl_dat: dat, da_nhan: nhan, con_lai: Math.max(0, dat - nhan),
      trang_thai: c.hoan_thanh ? 'Đã về đủ' : (nhan > 0 ? 'Về một phần' : (c.soct_dat_hang?.da_dat ? 'Chưa về' : 'Đơn nháp')),
    }
  }).sort((a: any, b: any) => String(b.ngay_dat).localeCompare(String(a.ngay_dat)))
  const summary = rows.length === 0 ? `Không thấy đơn đặt hàng nào cho mã "${q}".`
    : rows.map((r: any) => `Đơn ${r.so_don_hang} (đặt ${r.ngay_dat}): đặt ${r.sl_dat}, đã về ${r.da_nhan}, còn ${r.con_lai} — ${r.trang_thai}`).join('; ')
  return { summary, rows, columns }
}

// ===== Resolver: dựng danh sách "từ khóa" tìm khách (kèm mở rộng alias) =====
async function buildTerms(khach: string, khachMoRong: string, diaChi: string): Promise<string[]> {
  const base = [khach, khachMoRong, diaChi].map(norm).filter(Boolean)
  const terms = new Set<string>(base)
  if (base.length) {
    const { data: aliases } = await supabaseAdmin.from('soct_alias').select('tu_khoa, mo_rong')
    for (const a of (aliases || []) as any[]) {
      const tk = norm(a.tu_khoa)
      if (tk && base.some(b => b.includes(tk) || tk.includes(b))) { const m = norm(a.mo_rong); if (m) terms.add(m) }
    }
  }
  return [...terms].filter(Boolean)
}
const hitAny = (hay: string, terms: string[]) => terms.some(t => hay.includes(t))

// ===== Tool B1: Công nợ theo khách/cụm =====
async function congNo(terms: string[]): Promise<ToolResult> {
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
async function giamDinh(terms: string[]): Promise<ToolResult> {
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

// ===== Tool B3: Máy chưa bảo trì tháng hiện tại theo khách =====
async function chuaBaoTri(terms: string[]): Promise<ToolResult> {
  const columns = [{ key: 'khach', label: 'Khách hàng' }, { key: 'ma_may', label: 'Mã máy' }, { key: 'model', label: 'Model' }]
  if (terms.length === 0) return { summary: 'Chưa xác định được khách hàng cần tra.', rows: [], columns }
  const thang = new Date().toISOString().slice(0, 7)

  const customers = await selectAll((from, to) => supabaseAdmin
    .from('soct_khach_hang')
    .select('ma_may, ten_khach_hang, dia_chi, model, loai_hd, thang_bao_tri, bat_dau_tu_thang, tam_dung_tu_thang')
    .range(from, to))
  const { data: btRecords } = await supabaseAdmin.from('soct_bao_tri').select('ma_may').eq('thang_nam', thang)
  const done = new Set((btRecords || []).map((r: any) => String(r.ma_may).toLowerCase()))

  const rows = (customers as any[])
    .filter(c => hitAny(norm(c.ten_khach_hang) + ' ' + norm(c.dia_chi), terms))
    .filter(c => canBaoTriThang(c, thang) && !done.has(String(c.ma_may).toLowerCase()))
    .map(c => ({ khach: c.ten_khach_hang || '—', ma_may: c.ma_may || '—', model: c.model || '—' }))
  const summary = rows.length === 0 ? `Không có máy nào chưa bảo trì tháng ${thang} khớp khách này (hoặc khách không thuộc diện bảo trì).`
    : `Tháng ${thang}: còn ${rows.length} máy chưa bảo trì — ${rows.map(r => `${r.ma_may} (${r.khach})`).join('; ')}.`
  return { summary, rows, columns }
}

// ===== Tool B4: Máy thuê / CPC theo địa chỉ hoặc khách =====
async function thueCpc(terms: string[], loai: string): Promise<ToolResult> {
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
    : `Có ${rows.length} máy: ${rows.map(r => `${r.ma_may} - ${r.model} (${r.loai_hd}, ${r.khach})`).join('; ')}.`
  return { summary, rows, columns }
}

// ===== Orchestration =====
const CLASSIFY_SYSTEM = `Bạn là bộ phân loại câu hỏi cho phần mềm quản lý dịch vụ máy photocopy (tiếng Việt).
Chọn 1 công cụ và rút tham số:
- tonKho: hỏi TỒN KHO / còn bao nhiêu của một MÃ HÀNG -> điền ma_hang.
- datHang: hỏi ĐẶT HÀNG đã về chưa / về mấy hộp của một MÃ HÀNG -> điền ma_hang.
- congNo: hỏi CÔNG NỢ / còn nợ bao nhiêu của một KHÁCH -> điền khach.
- giamDinh: hỏi GIÁM ĐỊNH chưa thay / còn giám định nào của một KHÁCH -> điền khach.
- baoTri: hỏi máy CHƯA BẢO TRÌ của một KHÁCH -> điền khach.
- thueCpc: hỏi MÁY THUÊ / MÁY CPC ở đâu / của ai -> điền dia_chi (nơi chốn) hoặc khach, và loai nếu rõ.
- none: không thuộc các loại trên.
Mã hàng là chuỗi chữ-số (VD 1T02NK0AX0, S6704G, AC7A09A). "khach" là mảnh tên khách/phòng/đơn vị người dùng nói.
Quan trọng: nếu "khach" có VIẾT TẮT hoặc tên rút gọn, điền dạng đầy đủ vào "khach_mo_rong" (VD "tccb" -> "tổ chức cán bộ", "pv06" -> "cục hồ sơ nghiệp vụ"). Không rút được thì để rỗng.
Chỉ trả JSON đúng schema.`

const CLASSIFY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    tool: { type: 'STRING', enum: ['tonKho', 'datHang', 'congNo', 'giamDinh', 'baoTri', 'thueCpc', 'none'] },
    ma_hang: { type: 'STRING' }, khach: { type: 'STRING' }, khach_mo_rong: { type: 'STRING' },
    dia_chi: { type: 'STRING' }, loai: { type: 'STRING' },
  },
  required: ['tool', 'ma_hang', 'khach', 'khach_mo_rong', 'dia_chi', 'loai'],
}

const PHRASE_SYSTEM = `Bạn là trợ lý nội bộ công ty dịch vụ máy photocopy. Trả lời NGẮN GỌN bằng tiếng Việt,
CHỈ dựa trên "Dữ liệu" được cung cấp — TUYỆT ĐỐI không bịa thêm số liệu. Nếu dữ liệu rỗng thì nói không tìm thấy.
Tiền hiển thị dạng phân tách nghìn kèm "đ"; số lượng/tồn kho để nguyên.`

type Cls = { tool: string; ma_hang: string; khach: string; khach_mo_rong: string; dia_chi: string; loai: string }

export async function runAssistant(question: string): Promise<{ answer: string; rows: any[]; columns: { key: string; label: string }[] }> {
  const c = await geminiJSON<Cls>(CLASSIFY_SYSTEM, question, CLASSIFY_SCHEMA)

  let result: ToolResult
  if (c.tool === 'tonKho') result = await tonKho(c.ma_hang)
  else if (c.tool === 'datHang') result = await datHang(c.ma_hang)
  else if (c.tool === 'congNo' || c.tool === 'giamDinh' || c.tool === 'baoTri' || c.tool === 'thueCpc') {
    const terms = await buildTerms(c.khach, c.khach_mo_rong, c.dia_chi)
    if (c.tool === 'congNo') result = await congNo(terms)
    else if (c.tool === 'giamDinh') result = await giamDinh(terms)
    else if (c.tool === 'baoTri') result = await chuaBaoTri(terms)
    else result = await thueCpc(terms, c.loai)
  } else return {
    answer: 'Mình chưa hiểu câu hỏi thuộc loại nào. Hiện trợ lý trả lời về: tồn kho / đặt hàng (theo mã hàng), công nợ / giám định / bảo trì (theo khách), và máy thuê-CPC (theo nơi/khách).',
    rows: [], columns: [],
  }

  const answer = await geminiText(PHRASE_SYSTEM, `Câu hỏi: ${question}\n\nDữ liệu:\n${result.summary}`)
  return { answer: answer || result.summary, rows: result.rows, columns: result.columns }
}
