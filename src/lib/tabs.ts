// Cây tab + mặc định phân quyền hiển thị — DÙNG CHUNG cho client (giao diện)
// và server (kiểm quyền API). Không import gì phía server để client dùng được.

// `alwaysOn`: tab cha luôn hiển thị (Sổ công tác) — chỉ dùng để bảng phân quyền khóa ô cha,
// nhưng tab con vẫn bật/tắt được.
// `subs` của tab con có thể chứa tab CHÁU (cấp 3) — chỉ để ẩn/hiện GIAO DIỆN (server vẫn
// chỉ kiểm quyền tới cấp con). Cháu mặc định HIỆN; key phân quyền dạng "cha.con.cháu".
export type TabSub = { key: string, label: string, subs?: [string, string][] }
export const TAB_TREE: { key: string, label: string, subs: TabSub[], alwaysOn?: boolean }[] = [
  { key: 'cong_viec', label: 'Sổ công tác', subs: [{ key: 'hoan_phieu', label: 'Hoàn phiếu' }], alwaysOn: true },
  {
    key: 'theo_doi_may', label: 'Theo dõi máy', subs: [
      { key: 'bao_tri', label: 'Bảo trì', subs: [['da_bao_tri', 'Đã bảo trì'], ['chua_bao_tri', 'Chưa bảo trì'], ['tam_dung', 'Tạm dừng'], ['doi_chieu', 'Đối chiếu năm']] },
      { key: 'giam_dinh', label: 'Giám định' },
    ]
  },
  { key: 'kho_hang', label: 'Kho hàng', subs: [{ key: 'ton_kho', label: 'Tồn kho' }, { key: 'dat_hang', label: 'Đặt hàng' }, { key: 'thong_ke', label: 'Thống kê nhập' }] },
  {
    key: 'tai_chinh', label: 'Tài chính', subs: [
      { key: 'cong_no', label: 'Công nợ' },
      { key: 'thue_cpc', label: 'Thuê / CPC', subs: [['don_gia', 'Đơn giá HĐ'], ['counter', 'Nhập counter'], ['khung', 'Hợp đồng khung'], ['bang_ke', 'Bảng kê']] },
    ]
  },
  { key: 'quan_ly', label: 'Quản lý', subs: [{ key: 'nhat_ky', label: 'Báo cáo KTV' }, { key: 'khach_hang', label: 'Danh sách khách hàng' }, { key: 'khach_cum', label: 'Khách hàng cụm' }, { key: 'bao_cao', label: 'Báo cáo tháng' }, { key: 'nghi_phep', label: 'Nghỉ phép' }] },
  // Không phải tab điều hướng — chỉ để bật/tắt nút Trợ lý AI (nổi góc dưới phải) theo role.
  // Trợ lý vẫn kiểm quyền từng module theo tab tương ứng (không lộ dữ liệu ngoài quyền).
  { key: 'tro_ly', label: 'Trợ lý AI', subs: [] },
]

export const TAB_ROLES: [string, string][] = [['tech_admin', 'Tech Admin'], ['staff', 'Staff']]

// Mặc định hiển thị theo role; key tab con dạng "cha.con". Giao việc (cong_viec.giao_viec)
// luôn hiện nên không cần khai báo (undefined -> true).
export const DEFAULT_TAB_VIS: Record<string, Record<string, boolean>> = {
  tech_admin: {
    cong_viec: true, 'cong_viec.hoan_phieu': true,
    theo_doi_may: true, 'theo_doi_may.bao_tri': true, 'theo_doi_may.giam_dinh': true,
    kho_hang: true, 'kho_hang.ton_kho': false, 'kho_hang.dat_hang': true, 'kho_hang.thong_ke': true,
    tai_chinh: true, 'tai_chinh.cong_no': true, 'tai_chinh.thue_cpc': false,
    quan_ly: true, 'quan_ly.nhat_ky': true, 'quan_ly.khach_hang': false, 'quan_ly.khach_cum': false, 'quan_ly.bao_cao': false, 'quan_ly.nghi_phep': true,
    tro_ly: false
  },
  staff: {
    cong_viec: true, 'cong_viec.hoan_phieu': true,
    theo_doi_may: true, 'theo_doi_may.bao_tri': true, 'theo_doi_may.giam_dinh': true,
    kho_hang: false, 'kho_hang.ton_kho': false, 'kho_hang.dat_hang': false, 'kho_hang.thong_ke': false,
    tai_chinh: false, 'tai_chinh.cong_no': false, 'tai_chinh.thue_cpc': false,
    quan_ly: false, 'quan_ly.nhat_ky': false, 'quan_ly.khach_hang': false, 'quan_ly.khach_cum': false, 'quan_ly.bao_cao': false, 'quan_ly.nghi_phep': false,
    tro_ly: false
  },
}

// Một role có được xem tab (và tab con) không, theo cấu hình đã lưu (tab_visibility) + mặc định.
// admin luôn true. `savedJson` là chuỗi JSON của cấu hình tab_visibility (có thể rỗng).
export function roleCanTab(role: string, tabKey: string, savedJson: string | undefined, subKey?: string): boolean {
  if (role === 'admin') return true
  let saved: any = {}
  try { saved = (JSON.parse(savedJson || '{}') || {})[role] || {} } catch { /* dùng mặc định */ }
  const vis = { ...(DEFAULT_TAB_VIS[role] || {}), ...saved }
  if (!vis[tabKey]) return false
  if (subKey) { const v = vis[subKey]; if (v !== undefined && !v) return false }
  return true
}
