// Đo & hiển thị "thời gian xử lý phiếu" (lead time: bấm Đang làm -> Hoàn thành).
// CỐ Ý hiển thị THÔ: cộng dồn sai số (đi bộ 2 đầu, mất sóng, thói quen bấm) khiến độ
// chính xác dưới ~5-10 phút là vô nghĩa -> luôn làm tròn 5 phút, không hiện phút lẻ.

export const PHUT_TOI_DA = 24 * 60 // chặn trên: 1 ngày (quên bấm -> không cho vào số liệu)

// Làm tròn tới bội số `buoc` phút gần nhất
export function lamTronPhut(phut: number, buoc = 5): number {
  return Math.round((Number(phut) || 0) / buoc) * buoc
}

// Số phút giữa 2 mốc ISO (>=0, làm tròn xuống). null nếu thiếu mốc.
export function phutGiua(fromISO?: string | null, toISO?: string | null): number | null {
  if (!fromISO || !toISO) return null
  const a = Date.parse(fromISO), b = Date.parse(toISO)
  if (isNaN(a) || isNaN(b)) return null
  return Math.max(0, Math.floor((b - a) / 60000))
}

// Hiển thị thô: 47 -> "45p", 83 -> "1g25p", 120 -> "2g". null/0 -> "—".
export function fmtThoiLuong(phut: number | null | undefined): string {
  if (phut == null || phut <= 0) return '—'
  const r = lamTronPhut(phut, 5)
  if (r < 5) return '<5p'
  const g = Math.floor(r / 60), p = r % 60
  if (g === 0) return `${p}p`
  return p === 0 ? `${g}g` : `${g}g${p}p`
}

// Chặn số phút xác nhận vào khoảng hợp lệ [0, 1 ngày]
export function clampPhut(p: any): number {
  const n = Math.round(Number(p) || 0)
  return Math.min(PHUT_TOI_DA, Math.max(0, n))
}

// Server: giờ chạm (client gửi lên) phải nằm trong [lúc tạo phiếu, giờ server nhận].
// Ngoài khoảng -> coi là đồng hồ máy sai / gửi trễ -> dùng giờ server. Trả về ISO.
export function clampTapISO(tappedAt: any, createdAtISO: string | null | undefined, serverMs = Date.now()): string {
  const t = Date.parse(String(tappedAt || ''))
  const floor = createdAtISO ? Date.parse(createdAtISO) : NaN
  if (isNaN(t)) return new Date(serverMs).toISOString()
  if (t > serverMs) return new Date(serverMs).toISOString()          // không thể ở tương lai
  if (!isNaN(floor) && t < floor) return new Date(serverMs).toISOString() // trước cả lúc tạo phiếu -> vô lý
  return new Date(t).toISOString()
}
