// Helper dùng chung module Bảo hành hãng (server + client). Không import gì phía server.

// On-air (hạn bảo hành) = NGÀY CUỐI THÁNG, FOB + 12 tháng. Chu kỳ luôn 12 tháng.
// Vd FOB 2025-03-28 -> 2026-03-31 ; 2025-09-27 -> 2026-09-30 ; 2025-12-15 -> 2026-12-31.
// Nhận chuỗi 'YYYY-MM-DD' (hoặc Date) -> trả 'YYYY-MM-DD' hoặc '' nếu không hợp lệ.
export function onAirFromFob(fob: string | Date | null | undefined): string {
  if (!fob) return ''
  const s = typeof fob === 'string' ? fob : fob.toISOString()
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return ''
  const y = parseInt(m[1], 10), mon = parseInt(m[2], 10) // mon: 1..12
  // Ngày cuối tháng (mon) của năm y+1 = ngày 0 của tháng kế (mon+1) -> dùng new Date(y+1, mon, 0) (mon 1-based = index tháng kế).
  const d = new Date(Date.UTC(y + 1, mon, 0))
  return d.toISOString().slice(0, 10)
}

// Hôm nay (giờ VN) dạng 'YYYY-MM-DD'.
export function vnTodayISO(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
}

// Máy đã hết hạn bảo hành? (hôm nay > on-air). onAir = 'YYYY-MM-DD'.
export function isExpired(onAir: string | null | undefined, today = vnTodayISO()): boolean {
  if (!onAir) return false
  return today > onAir.slice(0, 10)
}

export type BhStatus = 'nhap' | 'da_gui' | 'hang_ve' | 'hoan_tat'
export type BhRow = { claim_sent?: boolean; goods_received?: boolean; back_to_customer?: boolean }

// Suy trạng thái tiến trình (để tô màu dòng).
export function bhStatus(r: BhRow): BhStatus {
  if (r.back_to_customer) return 'hoan_tat'
  if (r.goods_received) return 'hang_ve'
  if (r.claim_sent) return 'da_gui'
  return 'nhap'
}

export const BH_STATUS_META: Record<BhStatus, { label: string; dot: string; bg: string; fg: string; done?: boolean }> = {
  nhap:     { label: 'Nháp / chưa gửi',  dot: '#888780', bg: '#F1EFE8', fg: '#444441' },
  da_gui:   { label: 'Đã gửi, chờ hàng', dot: '#EF9F27', bg: '#FAEEDA', fg: '#633806' },
  hang_ve:  { label: 'Hàng về, chưa trả', dot: '#D85A30', bg: '#FAECE7', fg: '#712B13' },
  hoan_tat: { label: 'Hoàn tất',          dot: '#639922', bg: '#EAF3DE', fg: '#27500A', done: true },
}
