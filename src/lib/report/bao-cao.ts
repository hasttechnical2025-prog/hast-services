import { supabaseAdmin } from '@/lib/supabase-admin'

// Phân loại một loại công việc về nhóm dùng cho Mục 1 báo cáo.
// KHIEU_NAI / BAO_HANH tách riêng (Mục 4 / Mục 5), không đếm ở Mục 1.
export function catOf(loai: string): string {
  const s = (loai || '').toLowerCase()
  if (s.includes('lắp')) return 'LAP_MAY'
  if (s.includes('sửa')) return 'SUA_MAY'
  if (s.includes('mực')) return 'GIAO_MUC'
  if (s.includes('vật tư')) return 'THAY_VAT_TU'
  if (s.includes('bảo trì')) return 'BAO_TRI'
  if (s.includes('cskh') || s.includes('chăm sóc') || s.includes('kiểm tra')) return 'CSKH'
  if (s.includes('thầu')) return 'HO_TRO_THAU'
  if (s.includes('đại lý')) return 'HO_TRO_DAI_LY'
  if (s.includes('khiếu nại')) return 'KHIEU_NAI'
  if (s.includes('bảo hành')) return 'BAO_HANH'
  return 'KHAC'
}

const CAT1 = ['LAP_MAY', 'SUA_MAY', 'GIAO_MUC', 'THAY_VAT_TU', 'BAO_TRI', 'CSKH', 'HO_TRO_THAU', 'HO_TRO_DAI_LY', 'KHAC']

function brandKey(hang: string | null): 'KONICA' | 'FUJI' | 'KHAC' {
  if (hang === 'Konica') return 'KONICA'
  if (hang === 'Fuji') return 'FUJI'
  return 'KHAC'
}

// Tiền một công việc = tổng thành tiền vật tư (+ VAT nếu có hóa đơn)
function jobMoney(vt: any[]): number {
  return (vt || []).reduce((s, v) =>
    s + (Number(v.thanh_tien) || 0) + (v.hoa_don ? (Number(v.thanh_tien) || 0) * (Number(v.vat) || 0) / 100 : 0), 0)
}

const fmt = (x: number) => Math.round(x || 0).toLocaleString('vi-VN')
const pad2 = (n: number) => String(n).padStart(2, '0')

export type ManualFields = {
  DSO_MAY_THUE_CPC?: string
  DSO_LUY_KE?: string
  TY_LE?: string
  TN6_1?: string; TN6_2?: string; TN6_3?: string
  TN7_1?: string; TN7_2?: string; TN7_3?: string; TN7_4?: string
  KIEN_NGHI?: string
}

// Tính toàn bộ dữ liệu điền template cho tháng `thang` (YYYY-MM).
// `manual` là các phần app không có dữ liệu (nhập tay); có thể bỏ trống để lấy mặc định.
export async function buildReportData(thang: string, manual: ManualFields = {}) {
  const [yStr, mStr] = thang.split('-')
  const year = parseInt(yStr), month = parseInt(mStr)
  const start = `${yStr}-${pad2(month)}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${yStr}-${pad2(month)}-${pad2(lastDay)}`
  const ytdStart = `${yStr}-01-01`

  // Công việc từ đầu năm tới hết tháng (để tính cả lũy kế), kèm khách hàng + vật tư
  const { data: jobsYtd } = await supabaseAdmin
    .from('soct_cong_viec')
    .select(`ngay, ma_may, loai_cong_viec, so_luong, ket_qua, ghi_chu, report,
      soct_khach_hang ( ten_khach_hang, dia_chi, hang, loai_hd ),
      soct_chi_tiet_vat_tu ( thanh_tien, vat, hoa_don )`)
    .gte('ngay', ytdStart)
    .lte('ngay', end)

  const jobs = (jobsYtd || []).filter((j: any) => j.ngay >= start) // chỉ trong tháng

  // Toàn bộ máy khách hàng (Mục 2) + chỉ mục theo mã máy để tra hãng
  const { data: custs } = await supabaseAdmin
    .from('soct_khach_hang')
    .select('ma_may, hang, loai_hd')
  const brandByMaMay = new Map<string, 'KONICA' | 'FUJI' | 'KHAC'>()
  for (const c of custs || []) if (c.ma_may) brandByMaMay.set(c.ma_may, brandKey(c.hang))

  const data: Record<string, any> = {}

  // ===== MỤC 1: Dịch vụ kỹ thuật =====
  const cnt: Record<string, number> = {}, sum: Record<string, number> = {}
  for (const c of CAT1) { cnt[c] = 0; sum[c] = 0 }
  for (const j of jobs) {
    const c = catOf(j.loai_cong_viec)
    if (!CAT1.includes(c)) continue
    cnt[c] += 1
    sum[c] += Number(j.so_luong) || 1
  }
  let vuViec = 0, soLuong = 0
  for (const c of CAT1) {
    data[`${c}_CNT`] = cnt[c]
    data[`${c}_SUM`] = sum[c]
    vuViec += cnt[c]; soLuong += sum[c]
  }
  data.VU_VIEC_SUM = vuViec
  data.SO_LUONG_SUM = soLuong

  // ===== MỤC 2: Dịch vụ (theo hãng) =====
  const brands = ['KONICA', 'FUJI', 'KHAC'] as const
  const hdbt: any = { KONICA: 0, FUJI: 0, KHAC: 0 }
  const cpc: any = { KONICA: 0, FUJI: 0, KHAC: 0 }
  const tongMay: any = { KONICA: 0, FUJI: 0, KHAC: 0 }
  for (const c of custs || []) {
    const b = brandKey(c.hang)
    tongMay[b] += 1
    if (c.loai_hd === 'HĐBT') hdbt[b] += 1
    if (c.loai_hd === 'MF' || c.loai_hd === 'Máy thuê' || c.loai_hd === 'Máy CPC') cpc[b] += 1
  }
  // Máy phát sinh dịch vụ trong tháng / máy lắp trong tháng (đếm mã máy duy nhất theo hãng)
  const allRp: any = { KONICA: new Set(), FUJI: new Set(), KHAC: new Set() }
  const lapMay: any = { KONICA: new Set(), FUJI: new Set(), KHAC: new Set() }
  for (const j of jobs) {
    if (!j.ma_may) continue
    const b = brandByMaMay.get(j.ma_may) || 'KHAC'
    allRp[b].add(j.ma_may)
    if (catOf(j.loai_cong_viec) === 'LAP_MAY') lapMay[b].add(j.ma_may)
  }
  for (const b of brands) {
    data[`${b}_HDBT_SUM`] = hdbt[b]
    data[`${b}_ALL_RP_SUM`] = allRp[b].size
    data[`${b}_LAP_MAY_SUM`] = lapMay[b].size
    data[`${b}_MAY_THUE_CPC_SUM`] = cpc[b]
    data[`${b}_TONG_MAY`] = tongMay[b]
  }

  // ===== MỤC 3: Doanh số =====
  const dsoThang = jobs.reduce((s: number, j: any) => s + jobMoney(j.soct_chi_tiet_vat_tu), 0)
  const dsoYtd = (jobsYtd || []).reduce((s: number, j: any) => s + jobMoney(j.soct_chi_tiet_vat_tu), 0)
  data.DSO_MUC_VAT_TU = fmt(dsoThang)
  data.DSO_MAY_THUE_CPC = manual.DSO_MAY_THUE_CPC ?? '0'
  data.DSO_LUY_KE = manual.DSO_LUY_KE ?? fmt(dsoYtd)
  data.TY_LE = manual.TY_LE ?? '0'
  data.dso_luy_ke_goi_y = fmt(dsoYtd) // gợi ý cho màn hình

  // ===== MỤC 4 & 5: Khiếu nại / Bảo hành =====
  const toRow = (j: any) => ({
    khach: j.soct_khach_hang?.ten_khach_hang || '',
    dia_chi: j.soct_khach_hang?.dia_chi || '',
    noi_dung: j.ghi_chu || j.report || '',
    ket_qua: j.ket_qua || '',
  })
  data.khieu_nai = jobs.filter((j: any) => catOf(j.loai_cong_viec) === 'KHIEU_NAI').map(toRow)
  data.bao_hanh = jobs.filter((j: any) => catOf(j.loai_cong_viec) === 'BAO_HANH').map(toRow)

  // ===== MỤC 6 & 7: nhập tay (mặc định "Hoạt động ổn định") =====
  const dfl = (v: string | undefined) => (v && v.trim()) ? v : 'Hoạt động ổn định'
  data.TN6_1 = dfl(manual.TN6_1); data.TN6_2 = dfl(manual.TN6_2); data.TN6_3 = dfl(manual.TN6_3)
  data.TN7_1 = dfl(manual.TN7_1); data.TN7_2 = dfl(manual.TN7_2); data.TN7_3 = dfl(manual.TN7_3); data.TN7_4 = dfl(manual.TN7_4)

  // ===== MỤC 8: Kiến nghị =====
  data.KIEN_NGHI = manual.KIEN_NGHI ?? ''

  // ===== Ngày tháng =====
  data.MM = pad2(month)
  data.YYYY = String(year)
  data.NAM = String(year)
  data.HET_THANG = `${pad2(lastDay)}/${pad2(month)}/${year}`
  data.NGAY_KY = String(lastDay)
  data.THANG_KY = String(month)
  data.NAM_KY = String(year)

  return data
}
