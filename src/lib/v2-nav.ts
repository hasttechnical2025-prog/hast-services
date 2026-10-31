// Cây điều hướng cho UI 2027 (route-based). Dùng CHUNG client + server.
// Không import gì phía server để client dùng được. Nguồn nghiệp vụ: src/lib/tabs.ts.
//
// Mỗi mục con mang:
//  - slug: segment URL (kebab) dưới /v2/<parentSlug>/<slug>
//  - label: nhãn hiển thị
//  - permParent / permSub: KEY quyền trong tabs.ts (DEFAULT_TAB_VIS) để guard ẩn/hiện.
//    (slug ≠ key quyền có chủ đích — URL theo UI thực tế; xem docs/rebuild-ui-2027/02.)

// Segment URL gốc của UI 2027 (đổi 1 chỗ này = đổi toàn bộ link; thư mục app phải trùng tên).
// Link cũ /v2/* được next.config redirect sang base này để bookmark không gãy.
export const V2_BASE = '/qlkt'

export type V2Child = {
  slug: string
  label: string
  permParent: string      // key tab cha trong tabs.ts
  permSub?: string         // key tab con "cha.con"; bỏ trống = luôn hiện (vd Giao việc)
  icon?: string            // tên icon lucide (dấu chấm nhỏ nếu bỏ trống)
  adminOnly?: boolean      // chỉ admin thấy (vd các tab quản trị trong Hệ thống)
  // Mục GỘP nhiều tab con (vd Khách hàng = Điểm máy + Khách cụm): hiện/cho vào nếu BẤT KỲ
  // key con nào trong danh sách được phép (mỗi key dạng tên con dưới permParent).
  permAnyOf?: string[]
}

export type V2Parent = {
  slug: string
  label: string
  icon: string             // tên icon lucide
  permKey: string          // key tab cha trong tabs.ts (để tabVisible)
  children: V2Child[]
  // Cha "lá": không có mục con, bấm vào mở thẳng trang /v2/<slug> (vd Kanban Hóa đơn).
  leaf?: boolean
  // Với cha lá, gate hiển thị theo key tab con "cha.con" (vd 'tai_chinh.kanban') để admin
  // vẫn bật/tắt per-role như cũ. Bỏ trống = gate theo permKey.
  permSub?: string
  // Tô màu nhãn nổi bật (vd Kanban = đỏ cho kế toán dễ thấy). Bỏ trống = màu mặc định.
  tone?: 'rose'
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
    ],
  },
  {
    // Kanban Hóa đơn: menu cha "lá" (tách khỏi Tài chính, 2026-10-12). Gate theo quyền
    // 'tai_chinh.kanban' sẵn có (mọi role vào /v2 đều bật) → admin vẫn chỉnh per-role được.
    slug: 'kanban', label: 'Kanban Hóa đơn', icon: 'kanban-square', permKey: 'tai_chinh', permSub: 'kanban', leaf: true, tone: 'rose',
    children: [],
  },
  {
    slug: 'quan-ly', label: 'Quản lý', icon: 'users', permKey: 'quan_ly',
    children: [
      // Gộp "Danh sách khách hàng" + "Khách hàng cụm" thành 1 mục, 2 tab con nội bộ (Điểm máy · Khách cụm).
      // Hiện/cho vào nếu CÓ 1 trong 2 quyền khach_hang / khach_cum; bên trong mỗi tab tự gate.
      { slug: 'khach-hang', label: 'Khách hàng', permParent: 'quan_ly', permAnyOf: ['khach_hang', 'khach_cum'] },
      { slug: 'bao-cao-ktv', label: 'Báo cáo KTV', permParent: 'quan_ly', permSub: 'nhat_ky' },
      { slug: 'bao-cao-thang', label: 'Báo cáo tháng', permParent: 'quan_ly', permSub: 'bao_cao' },
      { slug: 'nghi-phep', label: 'Nghỉ phép', permParent: 'quan_ly', permSub: 'nghi_phep' },
    ],
  },
  {
    // Hệ thống: tab con KHÔNG khai trong tabs.ts — gate theo role ở trang (đa phần admin-only;
    // Đổi mật khẩu mở cho mọi role). Ở đây để permKey he_thong cho tabVisible luôn true.
    slug: 'he-thong', label: 'Hệ thống', icon: 'settings', permKey: 'he_thong',
    children: [
      // Thứ tự & nhãn y hệt admin. 5 tab đầu CHỈ admin; Đổi mật khẩu mọi role.
      { slug: 'cai-dat', label: 'Cài đặt', permParent: 'he_thong', adminOnly: true },
      { slug: 'tai-khoan', label: 'Tài khoản', permParent: 'he_thong', adminOnly: true },
      { slug: 'danh-muc', label: 'Danh mục', permParent: 'he_thong', adminOnly: true },
      { slug: 'audit', label: 'Audit Logs', permParent: 'he_thong', adminOnly: true },
      { slug: 'tro-ly-log', label: 'Trợ lý AI', permParent: 'he_thong', adminOnly: true },
      { slug: 'backup', label: 'Backup / Restore', permParent: 'he_thong', adminOnly: true },
      { slug: 'doi-mat-khau', label: 'Đổi mật khẩu', permParent: 'he_thong' },
    ],
  },
]

// Tab cháu (cấp 3) ROUTE-BASED cho placeholder `[...slug]` của module CHƯA port (SegTabs theo URL).
// HIỆN RỖNG: toàn bộ 6 cụm đã port, mỗi module tự quản tab nội bộ (state/`?tab=`), KHÔNG dùng
// route cấp 3. Các entry cũ (bao-tri/thue-cpc/cham-soc-kh/bao-cao-sua-chua) đã CŨ/lệch UI thật
// (vd CSKH rebuild thành danh sách phẳng; Bảo trì lồng 5 view dưới "Danh sách") -> đã xoá để
// tránh placeholder hiện sai. Thêm lại CHỈ khi có module port dở dùng SegTabs theo path.
export const V2_SUBTABS: Record<string, { slug: string; label: string }[]> = {}

// Module mặc định khi vào /v2 (redirect theo role).
export function defaultModuleFor(role: string): string {
  if (role === 'kthc') return `${V2_BASE}/kanban`
  return `${V2_BASE}/so-cong-tac/giao-viec`
}

export function findParent(slug: string): V2Parent | undefined {
  return V2_NAV.find(p => p.slug === slug)
}

// ───────────────────────────────────────────────────────────────────────────
// MA TRẬN PHÂN QUYỀN v2 — mô tả ĐÚNG cây hiển thị trong /v2 (cha/con/cháu), mỗi dòng gắn
// KEY quyền trong tabs.ts (tab_visibility). Dùng cho bảng Phân quyền (Cài đặt hệ thống) VÀ
// route guard (chặn truy cập theo quyền). Giữ key gốc để không migrate DB.
//  - level 1 = tab cha · 2 = tab con · 3 = tab cháu
//  - key: key tab_visibility (bỏ trống = dòng gộp/hiển thị, không có ô tick; vd nhóm "Khách hàng")
//  - deps: các key tổ tiên phải BẬT thì dòng này mới hiệu lực (ô tick enabled)
//  - alwaysOn: luôn bật (khóa ô tick) — Sổ công tác + Giao việc
export type V2PermRow = { label: string; key?: string; level: 1 | 2 | 3; deps?: string[]; alwaysOn?: boolean }

export const V2_PERM_ROWS: V2PermRow[] = [
  { label: 'Sổ công tác', key: 'cong_viec', level: 1, alwaysOn: true },
  { label: 'Giao việc', level: 2, alwaysOn: true },
  { label: 'Hoàn phiếu', key: 'cong_viec.hoan_phieu', level: 2, deps: ['cong_viec'] },
  { label: 'Báo cáo sửa chữa', key: 'cong_viec.bao_cao_khach', level: 2, deps: ['cong_viec'] },
  { label: 'Chăm sóc KH', key: 'cong_viec.cham_soc_kh', level: 2, deps: ['cong_viec'] },

  { label: 'Theo dõi máy', key: 'theo_doi_may', level: 1 },
  { label: 'Bảo trì', key: 'theo_doi_may.bao_tri', level: 2, deps: ['theo_doi_may'] },
  { label: 'Đã bảo trì', key: 'theo_doi_may.bao_tri.da_bao_tri', level: 3, deps: ['theo_doi_may', 'theo_doi_may.bao_tri'] },
  { label: 'Chưa bảo trì', key: 'theo_doi_may.bao_tri.chua_bao_tri', level: 3, deps: ['theo_doi_may', 'theo_doi_may.bao_tri'] },
  { label: 'Tạm dừng', key: 'theo_doi_may.bao_tri.tam_dung', level: 3, deps: ['theo_doi_may', 'theo_doi_may.bao_tri'] },
  { label: 'Đối chiếu năm', key: 'theo_doi_may.bao_tri.doi_chieu', level: 3, deps: ['theo_doi_may', 'theo_doi_may.bao_tri'] },
  { label: 'HĐBT cụm', key: 'theo_doi_may.bao_tri.thong_ke', level: 3, deps: ['theo_doi_may', 'theo_doi_may.bao_tri'] },
  { label: 'Giám định', key: 'theo_doi_may.giam_dinh', level: 2, deps: ['theo_doi_may'] },

  { label: 'Kho hàng', key: 'kho_hang', level: 1 },
  { label: 'Tồn kho', key: 'kho_hang.ton_kho', level: 2, deps: ['kho_hang'] },
  { label: 'Đặt hàng', key: 'kho_hang.dat_hang', level: 2, deps: ['kho_hang'] },
  { label: 'Thống kê nhập', key: 'kho_hang.thong_ke', level: 2, deps: ['kho_hang'] },
  { label: 'Giá niêm yết', key: 'kho_hang.gia_niem_yet', level: 2, deps: ['kho_hang'] },
  { label: 'Kho máy thuê', key: 'kho_hang.may_thue', level: 2, deps: ['kho_hang'] },
  { label: 'Phiếu đề nghị', key: 'kho_hang.phieu_de_nghi', level: 2, deps: ['kho_hang'] },

  { label: 'Tài chính', key: 'tai_chinh', level: 1 },
  { label: 'Công nợ', key: 'tai_chinh.cong_no', level: 2, deps: ['tai_chinh'] },
  { label: 'Thuê / CPC', key: 'tai_chinh.thue_cpc', level: 2, deps: ['tai_chinh'] },
  // 4 tab cháu khớp UI: mỗi tab 1 key. don_gia = tab "Danh sách máy" (gồm Đơn giá HĐ + Hợp đồng khung).
  { label: 'Nhập counter', key: 'tai_chinh.thue_cpc.counter', level: 3, deps: ['tai_chinh', 'tai_chinh.thue_cpc'] },
  { label: 'Bảng kê', key: 'tai_chinh.thue_cpc.bang_ke', level: 3, deps: ['tai_chinh', 'tai_chinh.thue_cpc'] },
  { label: 'Cảnh báo vật tư', key: 'tai_chinh.thue_cpc.canh_bao_muc', level: 3, deps: ['tai_chinh', 'tai_chinh.thue_cpc'] },
  { label: 'Danh sách máy', key: 'tai_chinh.thue_cpc.don_gia', level: 3, deps: ['tai_chinh', 'tai_chinh.thue_cpc'] },
  { label: 'Phí bảo trì', key: 'tai_chinh.phi_bao_tri', level: 2, deps: ['tai_chinh'] },

  // Kanban đã tách MENU CẤP 1 ở v2 → dòng cấp 1 riêng, ĐỘC LẬP với Tài chính (vẫn key tai_chinh.kanban).
  { label: 'Kanban Hóa đơn', key: 'tai_chinh.kanban', level: 1 },

  { label: 'Quản lý', key: 'quan_ly', level: 1 },
  { label: 'Báo cáo KTV', key: 'quan_ly.nhat_ky', level: 2, deps: ['quan_ly'] },
  // "Khách hàng" = nhóm GỘP (không có ô tick), 2 cháu gắn trực tiếp key con khach_hang / khach_cum.
  { label: 'Khách hàng', level: 2 },
  { label: 'Điểm máy', key: 'quan_ly.khach_hang', level: 3, deps: ['quan_ly'] },
  { label: 'Khách cụm', key: 'quan_ly.khach_cum', level: 3, deps: ['quan_ly'] },
  { label: 'Báo cáo tháng', key: 'quan_ly.bao_cao', level: 2, deps: ['quan_ly'] },
  { label: 'Nghỉ phép', key: 'quan_ly.nghi_phep', level: 2, deps: ['quan_ly'] },

  { label: 'Trợ lý AI', key: 'tro_ly', level: 1 },
]
