// Định dạng hiển thị — ĐÓNG KHUNG luật bắt buộc (xem AGENTS.md / memory format-rules).
// Dùng xuyên suốt ui/* để không thể làm sai ở từng màn.

// Tiền tệ: phân tách hàng nghìn bằng dấu chấm (#.###), làm tròn số thực trước khi format.
// KHÔNG áp cho số phiếu / mã (đó là chuỗi, hiển thị nguyên văn).
export function fmtMoney(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return ''
  const n = typeof v === 'string' ? Number(v) : v
  if (!Number.isFinite(n)) return ''
  return Math.round(n).toLocaleString('vi-VN')
}

// Ngày: luôn DD/MM/YYYY (không theo locale trình duyệt). Nhận ISO/Date/chuỗi.
export function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return ''
  const d = v instanceof Date ? v : new Date(v)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// Chuẩn hoá tiếng Việt để tìm kiếm không dấu (bỏ dấu + đ→d, lowercase).
export function normVi(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().trim()
}

// So sánh để SORT cột: tiếng Việt, số trong chuỗi so theo giá trị (957075 < 958026).
export function compareVi(a: unknown, b: unknown): number {
  return String(a ?? '').localeCompare(String(b ?? ''), 'vi', { numeric: true, sensitivity: 'base' })
}
