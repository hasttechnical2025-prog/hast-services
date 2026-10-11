// Cây điều hướng cho UI 2027 (route-based). Dùng CHUNG client + server.
// Không import gì phía server để client dùng được. Nguồn nghiệp vụ: src/lib/tabs.ts.
//
// Mỗi mục con mang:
//  - slug: segment URL (kebab) dưới /v2/<parentSlug>/<slug>
//  - label: nhãn hiển thị
//  - permParent / permSub: KEY quyền trong tabs.ts (DEFAULT_TAB_VIS) để guard ẩn/hiện.
//    (slug ≠ key quyền có chủ đích — URL theo UI thực tế; xem docs/rebuild-ui-2027/02.)

export type V2Child = {
  slug: string
  label: string
  permParent: string      // key tab cha trong tabs.ts
  permSub?: string         // key tab con "cha.con"; bỏ trống = luôn hiện (vd Giao việc)
  icon?: string            // tên icon lucide (dấu chấm nhỏ nếu bỏ trống)
}

export type V2Parent = {
  slug: string
  label: string
  icon: string             // tên icon lucide
  permKey: string          // key tab cha trong tabs.ts (để tabVisible)
  children: V2Child[]
}

export const V2_NAV: V2Parent[] = [
  {
    slug: 'so-cong-tac', label: 'Sổ công tác', icon: 'clipboard-list', permKey: 'cong_viec',
    children: [
      { slug: 'giao-viec', label: 'Giao việc', permParent: 'cong_viec' },
      { slug: 'hoan-phieu', label: 'Hoàn phiếu', permParent: 'cong_viec', permSub: 'hoan_phieu' },
      { slug: 'bao-cao-sua-chua', label: 'Báo cáo sửa chữa', permParent: 'cong_viec', permSub: 'bao_cao_khach' },
      { slug: 'cham-soc-kh', label: 'Chăm sóc KH', permParent: 'cong_viec', permSub: 'cham_soc_kh' },
    ],
  },
  {
    slug: 'theo-doi-may', label: 'Theo dõi máy', icon: 'printer', permKey: 'theo_doi_may',
    children: [
      { slug: 'bao-tri', label: 'Bảo trì', permParent: 'theo_doi_may', permSub: 'bao_tri' },
      { slug: 'giam-dinh', label: 'Giám định', permParent: 'theo_doi_may', permSub: 'giam_dinh' },
    ],
  },
  {
    slug: 'kho-hang', label: 'Kho hàng', icon: 'boxes', permKey: 'kho_hang',
    children: [
      { slug: 'ton-kho', label: 'Tồn kho', permParent: 'kho_hang', permSub: 'ton_kho' },
      { slug: 'dat-hang', label: 'Đặt hàng', permParent: 'kho_hang', permSub: 'dat_hang' },
      { slug: 'thong-ke', label: 'Thống kê nhập', permParent: 'kho_hang', permSub: 'thong_ke' },
      { slug: 'gia-niem-yet', label: 'Giá niêm yết', permParent: 'kho_hang', permSub: 'gia_niem_yet' },
      { slug: 'may-thue', label: 'Kho máy thuê', permParent: 'kho_hang', permSub: 'may_thue' },
      { slug: 'phieu-de-nghi', label: 'Phiếu đề nghị', permParent: 'kho_hang', permSub: 'phieu_de_nghi' },
    ],
  },
  {
    slug: 'tai-chinh', label: 'Tài chính', icon: 'wallet', permKey: 'tai_chinh',
    children: [
      { slug: 'cong-no', label: 'Công nợ', permParent: 'tai_chinh', permSub: 'cong_no' },
      { slug: 'thue-cpc', label: 'Thuê / CPC', permParent: 'tai_chinh', permSub: 'thue_cpc' },
      { slug: 'phi-bao-tri', label: 'Phí bảo trì', permParent: 'tai_chinh', permSub: 'phi_bao_tri' },
      { slug: 'kanban', label: 'Kanban Hóa đơn', permParent: 'tai_chinh', permSub: 'kanban' },
    ],
  },
  {
    slug: 'quan-ly', label: 'Quản lý', icon: 'users', permKey: 'quan_ly',
    children: [
      { slug: 'bao-cao-ktv', label: 'Báo cáo KTV', permParent: 'quan_ly', permSub: 'nhat_ky' },
      { slug: 'khach-hang', label: 'Danh sách khách hàng', permParent: 'quan_ly', permSub: 'khach_hang' },
      { slug: 'khach-cum', label: 'Khách hàng cụm', permParent: 'quan_ly', permSub: 'khach_cum' },
      { slug: 'bao-cao-thang', label: 'Báo cáo tháng', permParent: 'quan_ly', permSub: 'bao_cao' },
      { slug: 'nghi-phep', label: 'Nghỉ phép', permParent: 'quan_ly', permSub: 'nghi_phep' },
    ],
  },
  {
    // Hệ thống: tab con KHÔNG khai trong tabs.ts — gate theo role ở trang (đa phần admin-only;
    // Đổi mật khẩu mở cho mọi role). Ở đây để permKey he_thong cho tabVisible luôn true.
    slug: 'he-thong', label: 'Hệ thống', icon: 'settings', permKey: 'he_thong',
    children: [
      { slug: 'tai-khoan', label: 'Tài khoản', permParent: 'he_thong' },
      { slug: 'cai-dat', label: 'Cài đặt', permParent: 'he_thong' },
      { slug: 'danh-muc', label: 'Danh mục', permParent: 'he_thong' },
      { slug: 'audit', label: 'Audit', permParent: 'he_thong' },
      { slug: 'tro-ly-log', label: 'Nhật ký Trợ lý', permParent: 'he_thong' },
      { slug: 'doi-mat-khau', label: 'Đổi mật khẩu', permParent: 'he_thong' },
    ],
  },
]

// Tab cháu (cấp 3) nội bộ — dùng cho SegTabs (URL: .../<slug>/<childTab>).
// Mã hoá theo UI THỰC TẾ (ThueCpc 3 tab gộp từ 5 key quyền; xem docs 02 §1).
export const V2_SUBTABS: Record<string, { slug: string; label: string }[]> = {
  'theo-doi-may/bao-tri': [
    { slug: 'da-bao-tri', label: 'Đã bảo trì' },
    { slug: 'chua-bao-tri', label: 'Chưa bảo trì' },
    { slug: 'tam-dung', label: 'Tạm dừng' },
    { slug: 'doi-chieu', label: 'Đối chiếu năm' },
    { slug: 'thong-ke', label: 'Thống kê' },
  ],
  'tai-chinh/thue-cpc': [
    { slug: 'danh-sach', label: 'Danh sách máy' },
    { slug: 'counter', label: 'Nhập counter' },
    { slug: 'canh-bao-vat-tu', label: 'Cảnh báo vật tư' },
  ],
  'so-cong-tac/cham-soc-kh': [
    { slug: 'can', label: 'Cần chăm sóc' },
    { slug: 'ds', label: 'Danh sách' },
    { slug: 'pipeline', label: 'Pipeline' },
    { slug: 'kpi', label: 'KPI' },
  ],
  'so-cong-tac/bao-cao-sua-chua': [
    { slug: 'cho-gui', label: 'Chờ gửi' },
    { slug: 'da-gui', label: 'Đã gửi' },
  ],
}

// Module mặc định khi vào /v2 (redirect theo role).
export function defaultModuleFor(role: string): string {
  if (role === 'kthc') return '/v2/tai-chinh/kanban'
  return '/v2/so-cong-tac/giao-viec'
}

export function findParent(slug: string): V2Parent | undefined {
  return V2_NAV.find(p => p.slug === slug)
}
