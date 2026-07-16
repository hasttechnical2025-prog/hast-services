// Tình trạng hợp đồng của máy (dùng cho phù hiệu ở form giao việc & danh sách khách hàng).

// Trạng thái hạn theo ngày hết hạn. Trả null nếu chưa có ngày.
export function hdbtStatus(dateStr: string | null) {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp = new Date(dateStr); exp.setHours(0, 0, 0, 0)
  const days = Math.round((exp.getTime() - today.getTime()) / 86400000)
  const label = `${String(exp.getDate()).padStart(2, '0')}/${String(exp.getMonth() + 1).padStart(2, '0')}/${exp.getFullYear()}`
  if (days < 0) return { label, cls: 'bg-red-50 text-red-700 border-red-200', note: 'Đã hết hạn' }
  if (days <= 30) return { label, cls: 'bg-amber-50 text-amber-700 border-amber-200', note: `Còn ${days} ngày` }
  return { label, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', note: 'Còn hạn' }
}

// Phù hiệu tình trạng hợp đồng — BÁM THEO "Loại HĐ" trong danh sách khách hàng,
// KHÔNG suy ra từ ngày hết hạn. Loại HĐ trống -> "Không HĐ".
// VD: "HĐBT: Còn hạn (31/12/2026)", "Máy thuê: Còn hạn (31/10/2026)", "Máy CPC: Đã hết hạn (…)".
const NEUTRAL_PILL = 'bg-slate-100 text-slate-600 border-slate-200'
export function loaiHdBadge(loai_hd: string | null | undefined, ngay_het_han: string | null) {
  const loai = (loai_hd || '').trim()
  if (!loai) return { text: 'Không HĐ', cls: NEUTRAL_PILL }
  const st = hdbtStatus(ngay_het_han)
  if (!st) return { text: `${loai}: chưa có hạn`, cls: NEUTRAL_PILL }
  return { text: `${loai}: ${st.note} (${st.label})`, cls: st.cls }
}
