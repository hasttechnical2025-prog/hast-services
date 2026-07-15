// Dùng chung cho API + giao diện nghỉ phép/ốm.

export type LoaiNghi = 'phep' | 'om' | 'viec_rieng'
export type Buoi = 'ca_ngay' | 'sang' | 'chieu'
export type TrangThaiNghi = 'cho_duyet' | 'da_duyet' | 'tu_choi'

export const LOAI_LABEL: Record<LoaiNghi, string> = {
  phep: 'Nghỉ phép',
  om: 'Nghỉ ốm',
  viec_rieng: 'Việc riêng',
}
export const BUOI_LABEL: Record<Buoi, string> = {
  ca_ngay: 'Cả ngày',
  sang: 'Buổi sáng',
  chieu: 'Buổi chiều',
}
export const TRANG_THAI_LABEL: Record<TrangThaiNghi, string> = {
  cho_duyet: 'Chờ duyệt',
  da_duyet: 'Đã duyệt',
  tu_choi: 'Từ chối',
}

export const isLoai = (v: any): v is LoaiNghi => v === 'phep' || v === 'om' || v === 'viec_rieng'
export const isBuoi = (v: any): v is Buoi => v === 'ca_ngay' || v === 'sang' || v === 'chieu'

// Đếm số ngày (theo lịch, gồm cả cuối tuần). Nghỉ 1 ngày + nửa buổi = 0.5.
export function tinhSoNgay(tu_ngay: string, den_ngay: string, buoi: Buoi): number {
  const a = new Date(tu_ngay + 'T00:00:00')
  const b = new Date(den_ngay + 'T00:00:00')
  if (isNaN(a.getTime()) || isNaN(b.getTime()) || b < a) return 0
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000) + 1
  if (diff === 1 && buoi !== 'ca_ngay') return 0.5
  return diff
}

// Danh sách ngày (YYYY-MM-DD) mà đơn CẢ NGÀY bao phủ — dùng để loại nhắc báo cáo & đánh dấu ngày nghỉ.
// Đơn nửa buổi vẫn là ngày làm việc -> không tính.
export function expandNgayCaNgay(tu_ngay: string, den_ngay: string, buoi: Buoi): string[] {
  if (buoi !== 'ca_ngay') return []
  const out: string[] = []
  const a = new Date(tu_ngay + 'T00:00:00')
  const b = new Date(den_ngay + 'T00:00:00')
  if (isNaN(a.getTime()) || isNaN(b.getTime()) || b < a) return out
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  return out
}

// Mô tả khoảng nghỉ cho tin nhắn / hiển thị: "16/07 → 17/07 (2 ngày)" hoặc "16/07 (sáng)".
export function moTaKhoang(tu_ngay: string, den_ngay: string, buoi: Buoi): string {
  const dmy = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}` }
  const soNgay = tinhSoNgay(tu_ngay, den_ngay, buoi)
  if (tu_ngay === den_ngay) {
    return buoi === 'ca_ngay' ? `${dmy(tu_ngay)} (cả ngày)` : `${dmy(tu_ngay)} (${buoi === 'sang' ? 'sáng' : 'chiều'})`
  }
  return `${dmy(tu_ngay)} → ${dmy(den_ngay)} (${soNgay} ngày)`
}
