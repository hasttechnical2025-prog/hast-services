// Thư viện tính toán billing Máy thuê / CPC (thuần, không I/O).
// Nghiệp vụ chốt tại dac_ta_module_thue_cpc.md mục 4. Độc lập hoàn toàn với Sổ công tác.

// Các field billing trên soct_khach_hang (migration 22). Dùng để coerce input ở API.
export const KH_NUMERIC_FIELDS = [
  'phi_thue_thang', 'don_gia_bw', 'don_gia_mau',
  'dinh_muc_mien_phi_bw', 'dinh_muc_mien_phi_mau',
  'cam_ket_toi_thieu_bw', 'cam_ket_toi_thieu_mau', 'vat_thue_cpc',
] as const

export const KH_TEXT_FIELDS = [
  'trach_nhiem_ky_thuat', 'ten_doi_tac_ky_thuat', 'ngay_chot_so',
  'vi_tri_dat_may', 'nguoi_lien_he', 'email', 'serial',
] as const

// Kiểu máy billing (1 dòng soct_khach_hang có loai_hd IN ('Máy thuê','Máy CPC'))
export type MayBilling = {
  id: string
  don_gia_bw?: number | null
  don_gia_mau?: number | null
  dinh_muc_mien_phi_bw?: number | null
  dinh_muc_mien_phi_mau?: number | null
  cam_ket_toi_thieu_bw?: number | null
  cam_ket_toi_thieu_mau?: number | null
  phi_thue_thang?: number | null
  vat_thue_cpc?: number | null
}

// Chỉ số công-tơ 1 kỳ (cuối kỳ). Đầu kỳ lấy từ kỳ liền trước.
export type CounterKy = { so_bw: number | null; so_mau: number | null } | null

export type DongBangKe = {
  so_bw_dau_ky: number
  so_bw_cuoi_ky: number
  so_mau_dau_ky: number
  so_mau_cuoi_ky: number
  so_bw_su_dung: number
  so_mau_su_dung: number
  so_bw_tinh_phi: number
  so_mau_tinh_phi: number
  tien_ban_in: number
  phi_thue_co_dinh: number
  thanh_tien: number
}

const n = (v: any): number => {
  const x = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(x) ? x : 0
}

// Số bản tính phí theo mục 2/mục 4: cam kết tối thiểu và định mức miễn phí LOẠI TRỪ nhau.
// Nếu cam kết tối thiểu > 0 -> MAX(sử dụng, cam kết); ngược lại -> MAX(sử dụng - miễn phí, 0).
export function soBanTinhPhi(suDung: number, mienPhi: number, camKet: number): number {
  if (camKet > 0) return Math.max(suDung, camKet)
  return Math.max(suDung - mienPhi, 0)
}

// Tính 1 dòng bảng kê cho 1 máy tại 1 kỳ. counterThis = kỳ này, counterPrev = kỳ liền trước.
export function tinhDongMay(may: MayBilling, counterThis: CounterKy, counterPrev: CounterKy): DongBangKe {
  const so_bw_dau_ky = n(counterPrev?.so_bw)
  const so_bw_cuoi_ky = n(counterThis?.so_bw)
  const so_mau_dau_ky = n(counterPrev?.so_mau)
  const so_mau_cuoi_ky = n(counterThis?.so_mau)

  const so_bw_su_dung = Math.max(so_bw_cuoi_ky - so_bw_dau_ky, 0)
  const so_mau_su_dung = Math.max(so_mau_cuoi_ky - so_mau_dau_ky, 0)

  const so_bw_tinh_phi = soBanTinhPhi(so_bw_su_dung, n(may.dinh_muc_mien_phi_bw), n(may.cam_ket_toi_thieu_bw))
  const so_mau_tinh_phi = soBanTinhPhi(so_mau_su_dung, n(may.dinh_muc_mien_phi_mau), n(may.cam_ket_toi_thieu_mau))

  const tien_ban_in = so_bw_tinh_phi * n(may.don_gia_bw) + so_mau_tinh_phi * n(may.don_gia_mau)
  const phi_thue_co_dinh = n(may.phi_thue_thang) // 0 nếu CPC thuần / máy nằm trong gói cơ bản HĐ khung
  const thanh_tien = tien_ban_in + phi_thue_co_dinh

  return {
    so_bw_dau_ky, so_bw_cuoi_ky, so_mau_dau_ky, so_mau_cuoi_ky,
    so_bw_su_dung, so_mau_su_dung, so_bw_tinh_phi, so_mau_tinh_phi,
    tien_ban_in, phi_thue_co_dinh, thanh_tien,
  }
}

// Tổng bảng kê. loai='rieng': 1 dòng. loai='gop': phi_co_ban + SUM(thành tiền các dòng).
export function tinhTongBangKe(dong: DongBangKe[], vatRate: number, phiCoBan = 0) {
  const tong_truoc_vat = Math.round(phiCoBan + dong.reduce((s, d) => s + d.thanh_tien, 0))
  const tong_sau_vat = Math.round(tong_truoc_vat * (1 + n(vatRate) / 100))
  return { tong_truoc_vat, tong_sau_vat }
}

// Kỳ liền trước của 'YYYY-MM'
export function kyTruoc(thang_nam: string): string {
  const [y, m] = thang_nam.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1, 1))
  d.setUTCMonth(d.getUTCMonth() - 1)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
