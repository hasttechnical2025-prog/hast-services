// Làm thêm giờ (OT) — helper DÙNG CHUNG client + server (không import gì phía server).

export type OtRow = {
  id: string
  nhan_vien_id: string
  ngay: string                 // 'YYYY-MM-DD'
  tu_gio: string | null        // 'HH:MM'
  den_gio: string | null
  dia_diem: string | null
  dau_viec: string | null
  ket_qua: string | null
  ghi_chu: string | null
  soct_users?: { full_name?: string } | null
}

// Thứ kiểu VN từ 'YYYY-MM-DD': CN / 2..7. Dùng UTC để không lệch theo múi giờ server.
export function thuVN(ngay: string): string {
  if (!ngay) return ''
  const d = new Date(ngay + 'T00:00:00Z')
  if (isNaN(d.getTime())) return ''
  const g = d.getUTCDay() // 0=CN
  return g === 0 ? 'CN' : String(g + 1)
}

// 'YYYY-MM-DD' -> 'DD/MM/YYYY' (theo format-rules). Không phụ thuộc locale.
export function fmtNgayVN(ngay: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ngay || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (ngay || '')
}

// 'YYYY-MM' của 1 ngày.
export function thangCuaNgay(ngay: string): string {
  return (ngay || '').slice(0, 7)
}

// Gộp giờ hiển thị: "08:00 - 21:00" (bỏ phần trống).
export function khoangGio(tu: string | null | undefined, den: string | null | undefined): string {
  return [tu, den].map(s => (s || '').trim()).filter(Boolean).join(' - ')
}
