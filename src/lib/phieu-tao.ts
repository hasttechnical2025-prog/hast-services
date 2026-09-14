// Chip "thời điểm tạo phiếu" cho list Giao việc (admin) + app /m — giúp office/KTV nắm khi nào phiếu
// được tạo: buổi sáng/chiều trong ngày, soạn trước từ hôm trước, hay bị cuốn (chưa hoàn thành, đẩy ngày).
// Dùng CHUNG để hành vi đồng nhất giữa 2 nơi.

export type PhieuTaoTone = 'amber' | 'blue' | 'violet' | 'slate' | 'orange' | 'red'
export type PhieuTaoChip = { label: string; tone: PhieuTaoTone; title: string }

// Lớp CSS Tailwind theo tone (nền + chữ + viền).
export const PHIEU_TAO_TONE: Record<PhieuTaoTone, string> = {
  amber: 'text-amber-700 bg-amber-50 border-amber-200',
  blue: 'text-blue-700 bg-blue-50 border-blue-200',
  violet: 'text-violet-700 bg-violet-50 border-violet-200',
  slate: 'text-slate-500 bg-slate-100 border-slate-200',
  orange: 'text-orange-700 bg-orange-50 border-orange-200',
  red: 'text-rose-700 bg-rose-50 border-rose-200',
}

// `created_at`: ISO (UTC). `ngay`: 'YYYY-MM-DD' (ngày THỰC HIỆN). `so_lan_cuon`: số lần cron cuốn.
// Trả null nếu không đủ dữ liệu. Thứ tự ưu tiên (mỗi phiếu 1 chip): Cuốn > khác ngày (soạn/nhập) > buổi.
export function phieuTaoChip(created_at?: string | null, ngay?: string | null, so_lan_cuon?: number | null): PhieuTaoChip | null {
  const cuon = Number(so_lan_cuon) || 0
  // 1) Phiếu bị cuốn (chưa hoàn thành, cron đẩy sang ngày kế) — quan trọng nhất, ẩn buổi.
  if (cuon > 0) {
    return { label: `Cuốn ${cuon} ngày`, tone: cuon >= 5 ? 'red' : 'orange', title: `Phiếu tự cuốn ${cuon} lần do chưa hoàn thành — có thể bị bỏ quên` }
  }
  if (!created_at) return null
  const d = new Date(created_at)
  if (isNaN(d.getTime())) return null
  // Quy về giờ VN (+7) để xác định buổi + ngày tạo.
  const vn = new Date(d.getTime() + 7 * 3600 * 1000)
  const cd = `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, '0')}-${String(vn.getUTCDate()).padStart(2, '0')}`
  const hh = vn.getUTCHours()
  const gio = `${String(hh).padStart(2, '0')}:${String(vn.getUTCMinutes()).padStart(2, '0')}`
  const ddmm = `${String(vn.getUTCDate()).padStart(2, '0')}/${String(vn.getUTCMonth() + 1).padStart(2, '0')}`
  const titleTao = `Tạo lúc ${gio} ${ddmm}/${vn.getUTCFullYear()}`
  const nd = ngay ? String(ngay).slice(0, 10) : ''

  // 2) Tạo khác ngày thực hiện.
  if (nd && cd < nd) return { label: `Soạn ${ddmm}`, tone: 'slate', title: `${titleTao} — soạn trước cho ngày thực hiện` }
  if (nd && cd > nd) return { label: `Nhập ${ddmm}`, tone: 'slate', title: `${titleTao} — nhập sau ngày thực hiện` }

  // 3) Cùng ngày thực hiện -> theo buổi tạo (giờ VN).
  if (hh < 12) return { label: `Sáng · ${gio}`, tone: 'amber', title: titleTao }
  if (hh < 17) return { label: `Chiều · ${gio}`, tone: 'blue', title: titleTao }
  // >= 17h: nhiều khả năng là việc của NGÀY HÔM SAU (office có thể quên chuyển ngày phiếu).
  return { label: 'Sáng hôm sau', tone: 'violet', title: `${titleTao} — tạo sau 17h, nhiều khả năng là việc ngày hôm sau (kiểm tra ngày phiếu)` }
}
