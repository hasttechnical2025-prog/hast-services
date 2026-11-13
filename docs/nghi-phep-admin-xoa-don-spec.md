# Spec — Admin xóa đơn nghỉ phép lỗi (dọn rác)

**Trạng thái:** ĐANG CODE (13/11/2026). Không migration.

## 1. Bối cảnh
KTV/office đăng ký nghỉ nhưng chọn **nhầm ngày**; khi đơn đã bị duyệt (hoặc KTV không tự hủy) thì danh sách đọng **đơn rác**. Cần cho **admin** xóa đơn lỗi. (Chốt với user: chỉ admin xóa; xóa **mọi trạng thái**; đơn đã duyệt thì **gỡ luôn chấm công**; **Telegram báo người đăng ký**.)

Không làm thêm: hủy-duyệt, KTV sửa đơn, office-register riêng, chặn tự-duyệt (ngoài phạm vi theo chốt).

## 2. Backend — `DELETE /api/admin/nghi-phep?id=`
- Quyền: **`requireRole('admin')`** (tech_admin KHÔNG xóa — thao tác hủy diệt).
- Nạp đơn (`id, user_id, loai, tu_ngay, den_ngay, buoi, trang_thai, soct_users(full_name, telegram_id)`); không có → 404.
- Nếu `trang_thai === 'da_duyet'` và chấm công đã cấu hình → **`unsyncNghiPhep(id)`** gỡ dòng P bên app Chấm công (best-effort, **không chặn** xóa). *(Dịp này "sống hóa" hàm E2.)*
- Xóa cứng dòng `soct_nghi_phep`.
- **Telegram** báo người đăng ký (nếu có `telegram_id`): "Đơn nghỉ đã bị XÓA — đăng ký lại cho đúng nếu cần".
- `logAudit('Xóa đơn nghỉ phép', <ai – loại – khoảng – trạng thái – có/không gỡ chấm công>)`.
- `broadcastLeaveChanged()`.
- Lưu ý: giữ nguyên `DELETE /api/ktv/nghi-phep` (KTV tự hủy đơn Chờ duyệt) — đây là đường riêng của admin.

## 3. Frontend — nút Xóa (chỉ admin)
2 component **giống hệt**: `src/features/quan-ly/NghiPhepDuyet.tsx` (/qlkt) + `src/components/NghiPhepDuyet.tsx` (/m). Sửa **cả hai**:
- Thêm prop `isAdmin?: boolean`.
- Thêm nút **"Xóa đơn"** (icon `Trash2`, viền đỏ) trên mỗi `DonCard` **chỉ khi `isAdmin`** — cả thẻ Chờ duyệt lẫn thẻ danh sách toàn bộ.
- **Modal xác nhận** (inline, kiểu modal Từ chối — KHÔNG `window.confirm`): nêu người/loại/khoảng; nếu đơn **đã duyệt** thì cảnh báo *"Đã duyệt — xóa sẽ gỡ luôn ngày P bên Chấm công, không hoàn tác"*; ghi chú "Hệ thống sẽ báo Telegram cho người đăng ký".
- `doDelete` → `DELETE ...?id=` → `fetchData()` (realtime cũng tự cập nhật máy khác).

### Truyền `isAdmin`
- `/qlkt`: `src/app/qlkt/quan-ly/nghi-phep/page.tsx` dùng `useSession()` → `isAdmin={user?.role === 'admin'}`.
- `/m`: `src/app/m/page.tsx` đã có `user` → `isAdmin={user?.role === 'admin'}`.

## 4. Nghiệm thu
- tech_admin **không thấy** nút Xóa; admin thấy ở cả /qlkt và /m.
- Xóa đơn **Chờ duyệt/Từ chối** → mất khỏi list, không đụng chấm công.
- Xóa đơn **Đã duyệt** → mất khỏi list + **dòng P tương ứng biến mất bên app Chấm công** + **Telegram** tới người đăng ký + **audit log**.
- Realtime: máy khác đang mở màn Duyệt tự cập nhật.

## 5. Ngoài phạm vi
Không migration; không đụng đăng ký/duyệt/đồng bộ hiện có. Liên quan [[nghi-phep]], [[nghi-phep-sync-chamcong]], [[no-window-confirm]], [[ui-button-he-3-cap]].
