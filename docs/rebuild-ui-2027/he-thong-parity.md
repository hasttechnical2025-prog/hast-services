# Parity checklist — Hệ thống (6 tab con) + PHÂN QUYỀN ROLE

> v2: mỗi tab = 1 route. ✅ đã có.

## Phân quyền (y hệt admin)
- **Chỉ admin** thấy & vào được: Cài đặt hệ thống · Tài khoản · Danh mục · Audit Logs · Nhật ký AI.
- **Mọi role khác** (tech_admin / staff / kthc) chỉ thấy **Đổi mật khẩu**.
- **kinh_doanh + ktv**: SessionProvider redirect khỏi /v2 (kinh_doanh→/kho-thue, ktv→/ktv) → không vào Hệ thống v2.
- Cơ chế: `V2Child.adminOnly` (nav ẩn với non-admin) + `AdminGuard` (chặn truy cập URL trực tiếp) + `tabVisible('he_thong')=true` cho mọi role (để Đổi mật khẩu luôn vào được).

## Tab con
- [x] ✅ **Cài đặt hệ thống** (`he-thong/cai-dat`, admin) — port nguyên CaiDatHeThongTool: chế độ bảo trì, Chung, Google Sheet, Người bán HĐ, Danh mục khách KD, Nghiệp vụ, Ngày nghỉ lễ, Phiên đăng nhập, + **MA TRẬN PHÂN QUYỀN tab** (role × tab/tab con/tab cháu, TAB_TREE×TAB_ROLES, lưu `tab_visibility`). Lưu xong → `refetchConfig` (SessionProvider mới expose).
- [x] ✅ **Tài khoản** (`he-thong/tai-khoan`, admin) — port nguyên UserManagementTool: CRUD tài khoản + **chọn role** (ktv/kthc/kinh_doanh/staff/tech_admin/admin) + cờ kd_quan_ly, QR đăng nhập KTV, bật/tắt hoạt động. confirmDelete→useConfirm.
- [x] ✅ **Danh mục** (`he-thong/danh-muc`, admin) — port nguyên DanhMucTool (9 nhóm, thêm/sửa/ẩn/sắp xếp) + AliasTool (biệt danh AI). danhMuc local-copy cho reorder lạc quan.
- [x] ✅ **Audit Logs** (`he-thong/audit`, admin) — port nguyên AuditLogsTool (limit, ẩn cột, xuất .txt BOM).
- [x] ✅ **Nhật ký AI** (`he-thong/tro-ly-log`, admin) — port nguyên TroLyLogTool (lọc câu trượt).
- [x] ✅ **Đổi mật khẩu** (`he-thong/doi-mat-khau`, MỌI role) — port nguyên DoiMatKhauTool; sau đổi redirect '/' (thay '/admin').

**→ Cụm Hệ thống HOÀN TẤT. TOÀN BỘ 6 cụm v2 đã port xong.**

## Hạ tầng phân quyền thêm khi làm cụm này
- `SessionProvider.refetchConfig()` — tải lại cấu hình + tab_visibility sau khi lưu Cài đặt.
- `V2Child.adminOnly` + AppShell ẩn child adminOnly khi role≠admin.
- `AdminGuard` component chặn URL trực tiếp.
