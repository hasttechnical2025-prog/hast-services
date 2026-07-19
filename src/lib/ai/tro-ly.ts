// Trợ lý AI nội bộ — Phase 1: tra theo MÃ HÀNG chính xác (Tồn kho + Đặt hàng).
// Kiến trúc 2 bước: (1) LLM phân loại câu hỏi -> chọn tool + rút mã hàng; (2) chạy
// query THẬT (không để AI tự tính); (3) LLM diễn đạt NGẮN dựa trên dữ liệu thật.
// => Con số luôn từ DB, AI chỉ diễn đạt. Mở rộng thêm tool ở các phase sau.

import { supabaseAdmin } from '@/lib/supabase-admin'
import { geminiJSON, geminiText } from './gemini'

export type ToolResult = { summary: string; rows: any[]; columns: { key: string; label: string }[] }

// ===== Tool: Tồn kho theo mã hàng =====
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
  const summary = rows.length === 0
    ? `Không tìm thấy mã hàng "${q}".`
    : rows.map((d: any) => `${d.ma_hang} (${d.ten_hang || ''}): tồn kho ${d.ton_kho}`).join('; ')
  return { summary, rows, columns }
}

// ===== Tool: Đặt hàng theo mã hàng (đã về chưa / mấy hộp) =====
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
      so_don_hang: c.soct_dat_hang?.so_don_hang || '—',
      ngay_dat: c.soct_dat_hang?.ngay_dat || '',
      nha_cung_cap: c.soct_dat_hang?.nha_cung_cap || '',
      sl_dat: dat, da_nhan: nhan, con_lai: Math.max(0, dat - nhan),
      trang_thai: c.hoan_thanh ? 'Đã về đủ' : (nhan > 0 ? 'Về một phần' : (c.soct_dat_hang?.da_dat ? 'Chưa về' : 'Đơn nháp')),
    }
  }).sort((a: any, b: any) => String(b.ngay_dat).localeCompare(String(a.ngay_dat)))

  const summary = rows.length === 0
    ? `Không thấy đơn đặt hàng nào cho mã "${q}".`
    : rows.map((r: any) => `Đơn ${r.so_don_hang} (đặt ${r.ngay_dat}): đặt ${r.sl_dat}, đã về ${r.da_nhan}, còn ${r.con_lai} — ${r.trang_thai}`).join('; ')
  return { summary, rows, columns }
}

// ===== Orchestration =====
const CLASSIFY_SYSTEM = `Bạn là bộ phân loại câu hỏi cho phần mềm quản lý dịch vụ máy photocopy (tiếng Việt).
Nhiệm vụ: chọn 1 công cụ phù hợp và rút MÃ HÀNG (chuỗi chữ-số như 1T02NK0AX0, S6704G, AC7A09A) từ câu hỏi.
- tonKho: hỏi TỒN KHO / còn bao nhiêu / còn mấy cái của một mã hàng.
- datHang: hỏi ĐẶT HÀNG đã về chưa / về mấy hộp / mấy cái của một mã hàng.
- none: không thuộc 2 loại trên (VD hỏi công nợ, giám định, bảo trì, khách hàng...).
Chỉ trả JSON đúng schema. ma_hang để chuỗi rỗng nếu không rút được.`

const CLASSIFY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    tool: { type: 'STRING', enum: ['tonKho', 'datHang', 'none'] },
    ma_hang: { type: 'STRING' },
  },
  required: ['tool', 'ma_hang'],
}

const PHRASE_SYSTEM = `Bạn là trợ lý nội bộ của công ty dịch vụ máy photocopy. Trả lời NGẮN GỌN bằng tiếng Việt,
CHỈ dựa trên "Dữ liệu" được cung cấp — TUYỆT ĐỐI không bịa thêm số liệu. Nếu dữ liệu rỗng thì nói không tìm thấy.
Giữ nguyên con số (số lượng, tồn kho) không thêm đơn vị tiền tệ.`

export async function runAssistant(question: string): Promise<{ answer: string; rows: any[]; columns: { key: string; label: string }[] }> {
  const cls = await geminiJSON<{ tool: string; ma_hang: string }>(CLASSIFY_SYSTEM, question, CLASSIFY_SCHEMA)

  let result: ToolResult
  if (cls.tool === 'tonKho') result = await tonKho(cls.ma_hang)
  else if (cls.tool === 'datHang') result = await datHang(cls.ma_hang)
  else return {
    answer: 'Bản thử nghiệm hiện chỉ trả lời câu hỏi về TỒN KHO và ĐẶT HÀNG theo mã hàng (VD: "mã 1T02NK0AX0 còn bao nhiêu?", "mã S6704G về mấy hộp?"). Các loại câu hỏi khác (công nợ, giám định, bảo trì...) sẽ được bổ sung dần.',
    rows: [], columns: [],
  }

  const answer = await geminiText(PHRASE_SYSTEM, `Câu hỏi: ${question}\n\nDữ liệu:\n${result.summary}`)
  return { answer: answer || result.summary, rows: result.rows, columns: result.columns }
}
