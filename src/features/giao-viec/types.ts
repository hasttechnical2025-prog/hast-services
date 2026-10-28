// Kiểu dữ liệu Giao việc (port từ admin/page.tsx). Giữ đúng field API cũ.

export type VatTuRow = { ma_hang: string; so_luong: string; don_gia: string; vat: string; hoa_don: boolean }

export type JobForm = {
  ngay: string
  ma_may: string
  id_khach_hang: string      // id khách; "NEW" = khai khách mới
  loai_cong_viec: string
  km: number
  so_luong: number
  ktv_id: string
  ktv2_id: string
  report: string
  ghi_chu: string
  mien_phi: boolean
  vat_tu: VatTuRow[]
  // Khai khách mới (khi id_khach_hang === 'NEW')
  ten_khach_hang_moi: string
  dia_chi_moi: string
  model_moi: string
  vi_tri_dat_may_moi: string
}

export type Job = {
  id: string
  ngay: string
  ma_may: string | null
  id_khach_hang: string
  loai_cong_viec: string
  km: number | null
  so_luong: number | null
  ket_qua: string
  report: string | null
  ghi_chu: string | null
  mien_phi: boolean
  trang_thai_hd: string | null
  ktv_id: string | null
  ktv2_id: string | null
  nguon_nhan: string | null
  bat_dau_luc: string | null
  hoan_thanh_luc: string | null
  so_phut_xu_ly: number | null
  created_at?: string | null
  so_lan_cuon?: number | null
  bbbg_luc?: string | null
  soct_khach_hang?: { ten_khach_hang?: string; dia_chi?: string; model?: string; vi_tri_dat_may?: string } | null
  soct_users?: { full_name?: string } | null
  ktv2?: { full_name?: string } | null
  soct_chi_tiet_vat_tu?: { id: string; ma_hang: string; so_luong: number; don_gia: number; vat: number; thanh_tien?: number; hoa_don: boolean; da_tra: boolean; ten_hang_hd?: string | null; soct_kho_hang?: { ten_hang?: string } | null }[]
}

// Tiền phát sinh của 1 phiếu (bỏ vật tư đã trả kho; cộng VAT khi có HĐ). Khớp jobTien ở admin.
export function jobTien(job: Job): { tong: number; coHD: boolean } {
  const vt = (job.soct_chi_tiet_vat_tu || []).filter(v => !v.da_tra)
  const tong = vt.reduce((s, v) => s + (Number(v.thanh_tien) || 0) + (v.hoa_don ? (Number(v.thanh_tien) || 0) * (Number(v.vat) || 0) / 100 : 0), 0)
  return { tong: Math.round(tong), coHD: vt.some(v => v.hoa_don) }
}

// KM = 0 khi: ghi chú có "CPN" (gửi chuyển phát, KTV không đi) HOẶC loại việc "Hỗ trợ online".
// Dùng chung cho form (khóa ô KM) và server (ép km=0 lúc lưu). Áp từ lúc tạo/sửa trở đi.
export function kmZeroRule(loaiCongViec?: string | null, ghiChu?: string | null): boolean {
  if (String(loaiCongViec || '').trim().toLowerCase() === 'hỗ trợ online') return true
  return /cpn/i.test(String(ghiChu || ''))
}

export const LOAI_CV_CAN_VAT_TU = ['Giao mực', 'Thay vật tư']
export const LOAI_CV_FALLBACK = ['Sửa chữa', 'Bảo trì', 'Lắp đặt', 'Giao mực', 'Thay vật tư', 'Kiểm tra', 'Khác']
export const RENTAL_LOAI_HD = ['Máy thuê', 'Máy CPC']

export function emptyForm(todayISO: string): JobForm {
  return {
    ngay: todayISO, ma_may: '', id_khach_hang: '', loai_cong_viec: '', km: 0, so_luong: 1,
    ktv_id: '', ktv2_id: '', report: '', ghi_chu: '', mien_phi: false, vat_tu: [],
    ten_khach_hang_moi: '', dia_chi_moi: '', model_moi: '', vi_tri_dat_may_moi: '',
  }
}

export function emptyVatTu(): VatTuRow {
  return { ma_hang: '', so_luong: '1', don_gia: '', vat: '8', hoa_don: false }
}

// Ngày hôm nay theo giờ VN (YYYY-MM-DD) — khớp todayVN() của admin.
export function todayVN(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
}
