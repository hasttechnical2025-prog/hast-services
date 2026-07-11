// Cây tab + mặc định phân quyền hiển thị — DÙNG CHUNG cho client (giao diện)
// và server (kiểm quyền API). Không import gì phía server để client dùng được.

// `alwaysOn`: tab cha luôn hiển thị (Sổ công tác) — chỉ dùng để bảng phân quyền khóa ô cha,
// nhưng tab con vẫn bật/tắt được.
export const TAB_TREE: { key: string, label: string, subs: [string, string][], alwaysOn?: boolean }[] = [
  { key: 'cong_viec', label: 'Sổ công tác', subs: [['hoan_phieu', 'Hoàn phiếu']], alwaysOn: true },
  { key: 'theo_doi_may', label: 'Theo dõi máy', subs: [['bao_tri', 'Bảo trì'], ['giam_dinh', 'Giám định']] },
  { key: 'kho_hang', label: 'Kho hàng', subs: [['ton_kho', 'Tồn kho'], ['dat_hang', 'Đặt hàng'], ['thong_ke', 'Thống kê nhập']] },
  { key: 'tai_chinh', label: 'Tài chính', subs: [['cong_no', 'Công nợ'], ['thue_cpc', 'Thuê / CPC']] },
  { key: 'quan_ly', label: 'Quản lý', subs: [['nhat_ky', 'Báo cáo KTV'], ['khach_hang', 'Danh sách khách hàng'], ['bao_cao', 'Báo cáo tháng']] },
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
    quan_ly: true, 'quan_ly.nhat_ky': true, 'quan_ly.khach_hang': false, 'quan_ly.bao_cao': false
  },
  staff: {
    cong_viec: true, 'cong_viec.hoan_phieu': true,
    theo_doi_may: true, 'theo_doi_may.bao_tri': true, 'theo_doi_may.giam_dinh': true,
    kho_hang: false, 'kho_hang.ton_kho': false, 'kho_hang.dat_hang': false, 'kho_hang.thong_ke': false,
    tai_chinh: false, 'tai_chinh.cong_no': false, 'tai_chinh.thue_cpc': false,
    quan_ly: false, 'quan_ly.nhat_ky': false, 'quan_ly.khach_hang': false, 'quan_ly.bao_cao': false
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
