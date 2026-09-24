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
  'vi_tri_dat_may', 'nguoi_lien_he', 'email', 'serial', 'nv_kinh_doanh',
  'ten_may_hd', // tên máy in trên dòng "Dịch vụ thuê máy …" (rỗng -> dùng model)
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

// Ngày ĐỌC counter đóng kỳ 'YYYY-MM' (= cuối kỳ). Trả về Date (UTC) hoặc null nếu chưa cấu hình.
// - Cuối tháng: đọc vào ngày cuối của CHÍNH tháng M (kỳ trùng tháng dương lịch).
// - Giữa tháng (ngày D): kỳ chạy D/M -> D/(M+1), nên đọc vào ngày D của tháng M+1.
export function chotSoDate(thang_nam: string, chot_so_ngay: number | null | undefined, cuoi_thang: boolean): Date | null {
  const [y, m] = thang_nam.split('-').map(Number)
  if (!y || !m) return null
  if (cuoi_thang) {
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return new Date(Date.UTC(y, m - 1, lastDay))
  }
  if (chot_so_ngay && chot_so_ngay >= 1) {
    // Tháng M+1 (m là 1-based -> chỉ số tháng = m ứng với tháng kế tiếp)
    const next = new Date(Date.UTC(y, m, 1))
    const ny = next.getUTCFullYear()
    const nIdx = next.getUTCMonth() // 0-based của tháng M+1
    const lastDayNext = new Date(Date.UTC(ny, nIdx + 1, 0)).getUTCDate()
    return new Date(Date.UTC(ny, nIdx, Math.min(chot_so_ngay, lastDayNext)))
  }
  return null
}

const fmtDMY_UTC = (d: Date): string =>
  `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`

// Ngày ĐẦU/CUỐI kỳ IN TRÊN HÓA ĐƠN của tháng M (KHÁC chotSoDate dùng để nhắc lấy counter):
//  - Cuối tháng: 1/M  ->  ngày-cuối/M.
//  - Giữa tháng (ngày D): D/(M-1)  ->  D/M  (kỳ kết thúc bằng lần chốt trong CHÍNH tháng M).
// D kẹp theo số ngày thực của mỗi tháng (VD chốt 31 ở tháng 30 ngày -> lấy 30).
export function kyNgayHoaDon(thang_nam: string, chot_so_ngay: number | null | undefined, cuoi_thang: boolean): { dau: string, cuoi: string } {
  const [y, m] = String(thang_nam).split('-').map(Number) // m: 1-based
  if (!y || !m) return { dau: '', cuoi: '' }
  if (cuoi_thang) {
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return { dau: fmtDMY_UTC(new Date(Date.UTC(y, m - 1, 1))), cuoi: fmtDMY_UTC(new Date(Date.UTC(y, m - 1, lastDay))) }
  }
  const D = Number(chot_so_ngay) || 1
  const dayIn = (yy: number, mIdx0: number) => Math.min(D, new Date(Date.UTC(yy, mIdx0 + 1, 0)).getUTCDate())
  const prev = new Date(Date.UTC(y, m - 2, 1)) // tháng M-1 (0-based m-2), tự lùi năm nếu m=1
  const cur = new Date(Date.UTC(y, m - 1, 1))  // tháng M
  const dau = new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth(), dayIn(prev.getUTCFullYear(), prev.getUTCMonth())))
  const cuoi = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), dayIn(cur.getUTCFullYear(), cur.getUTCMonth())))
  return { dau: fmtDMY_UTC(dau), cuoi: fmtDMY_UTC(cuoi) }
}

// Nhãn KỲ ghi vào TÊN DÒNG thuê máy (DVTM) trên hóa đơn:
//  - kieu_ky='tu_den' -> "từ DD/MM/YYYY đến DD/MM/YYYY" (tự tính theo chốt số -> sang kỳ tự nhảy).
//  - còn lại ('thang'/rỗng) -> "tháng M/YYYY".
export function kyLabel(thang_nam: string, kieu_ky: string | null | undefined, chot_so_ngay: number | null | undefined, cuoi_thang: boolean): string {
  const [nam, thang] = String(thang_nam).split('-')
  if (kieu_ky === 'tu_den') {
    const { dau, cuoi } = kyNgayHoaDon(thang_nam, chot_so_ngay, cuoi_thang)
    if (dau && cuoi) return `từ ngày ${dau} đến ${cuoi}`
  }
  return `tháng ${Number(thang)}/${nam}`
}

// Chuỗi ngày chốt để in bảng kê (VD "Ngày 25 hàng tháng", "Cuối tháng").
export function chotSoLabel(chot_so_ngay: number | null | undefined, cuoi_thang: boolean): string {
  if (cuoi_thang) return 'Cuối tháng'
  if (chot_so_ngay && chot_so_ngay >= 1) return `Ngày ${chot_so_ngay} hàng tháng`
  return ''
}

export type CounterStatus = 'done' | 'overdue' | 'due_soon' | 'not_yet' | 'no_date'
// Trạng thái lấy counter của 1 máy trong kỳ. `todayStr`/dùng ISO 'YYYY-MM-DD'. leadDays = ngưỡng cảnh báo vàng.
export function counterStatus(chot: Date | null, daNhap: boolean, todayStr: string, leadDays = 3): { status: CounterStatus, days: number } {
  if (daNhap) return { status: 'done', days: 0 }
  if (!chot) return { status: 'no_date', days: 0 }
  const today = Date.parse(todayStr + 'T00:00:00Z')
  const diff = Math.round((chot.getTime() - today) / 86400000) // >0: còn N ngày; <0: quá hạn
  if (diff < 0) return { status: 'overdue', days: -diff }
  if (diff <= leadDays) return { status: 'due_soon', days: diff }
  return { status: 'not_yet', days: diff }
}
