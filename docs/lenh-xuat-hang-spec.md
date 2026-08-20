# Lệnh xuất hàng (phòng kinh doanh) — SPEC (PENDING, chờ bàn với kinh doanh)

> Mở rộng luồng Kanban Hóa đơn sang phòng kinh doanh. Sales tạo "lệnh xuất hàng" (chứng từ
> KHÁC phiếu giao việc), dữ liệu đổ chung vào Kanban để kế toán lên hóa đơn / thu tiền.
> Trạng thái: **CHƯA code** — chờ bạn chốt nội bộ vài điểm (mục "Còn mở"). Khi tiếp tục ở
> chat mới: chỉ cần bảo "code lệnh xuất hàng", đọc file này + memory `lenh-xuat-hang-pending`.

## Đã CHỐT

1. **Bảng RIÊNG `soct_lenh_xuat`** (không nhét vào `soct_cong_viec`).
   - Lệnh xuất khác bản chất công việc kỹ thuật (không KTV/máy/loại việc; có gán NV, đặt cọc…).
   - **Lớp hóa đơn/công nợ dùng CHUNG qua `so_hoa_don`**: `soct_hd_thu` khóa theo số HĐ nên chia sẻ được ngay.
   - `soct_lenh_xuat` mang cột hóa đơn riêng: `so_hoa_don, trang_thai_hd, ngay_xuat_hd, so_dntt, dntt_luc` + bảng dòng hàng riêng (`soct_lenh_xuat_ct`?).
   - **Kanban GET UNION 2 nguồn** (soct_cong_viec + soct_lenh_xuat) → "ticket" chung; **PUT trạng thái dispatch đúng bảng**.

2. **Gán cho NV (assignment, KHÔNG phải "phòng")** — giống `ktv_id`.
   - `soct_lenh_xuat.nguoi_kinh_doanh_id` (NV được giao) + `created_by` (người lập).
   - Vai trò: **sale_admin** (lập + gán + xem tất cả + doanh thu), **nv_kinh_doanh** (chỉ thấy lệnh của mình + thu tiền).
   - **Doanh thu cuối tháng theo NV** = tổng lệnh (đã lên HĐ/đã thu) group theo `nguoi_kinh_doanh_id`.

3. **Thu tiền + XÁC THỰC (chống biển thủ) — sub-feature quan trọng nhất, làm CÙNG lúc**.
   - Đổi mô hình thu tiền: từ "1 dòng cộng dồn/số HĐ" (`soct_hd_thu` hiện tại) → **bảng ghi từng khoản** `soct_thu_tien`:
     `so_hoa_don, so_tien, loai (dat_coc|thanh_toan), nguoi_ghi, trang_thai (cho_duyet|da_duyet), nguoi_duyet, ghi_chu, thoi_diem`.
   - Luồng: NV kinh doanh nhập khoản thu → **"chờ kế toán xác thực"** (CHƯA khấu trừ công nợ). Kế toán **duyệt** → mới tính.
   - "Đã thu" (khấu trừ) = **SUM khoản đã duyệt**; badge Kanban tách *"đã duyệt X · chờ duyệt Y"*.
   - Nâng cấp luôn luồng thu tiền hiện tại (nhật ký + người duyệt thay vì 1 số cộng dồn).
   - **NV kinh doanh KHÔNG thao tác hóa đơn** (kế toán làm cột 2).

4. **Số hóa đơn 100% khác nhau** (cùng phần mềm xuất HĐ) → 1 thẻ Kanban = 1 số HĐ = **1 nguồn duy nhất**, không lẫn. Gom thẻ an toàn, không xử lý đặc biệt.

5. **Route riêng `/lenh-xuat-hang`** cho kinh doanh: form tạo lệnh (khách + danh sách hàng chọn từ kho + gán NV; KHÔNG KTV/máy/loại việc) + view Kanban đã lọc.

6. **Phân quyền**: server gate MỌI hành động theo role + assignment (nv thấy lệnh của mình). kthc thấy cột 2–4 full + lọc theo NV. UI ẩn chỉ là phụ.

## CÒN MỞ (chốt với kinh doanh trước khi code)

1. `sale_admin` là role MỚI hay `kinh_doanh` + cờ "quản lý"? (đề xuất: 2 role `sale_admin` + `kinh_doanh`).
2. Ai kéo lệnh **cột 1 → 2** (bàn giao kế toán): sale_admin hay NV?
3. Lệnh xuất có cần **mẫu in .docx** (chứng từ giao hàng) như BBBG?
4. NV sửa/hủy lệnh của mình bị **khóa ở trạng thái nào** (giống khóa sửa sau khi sang kế toán)?
5. Đặt cọc thu **trước khi có số HĐ** (lệnh còn cột 1) hay chỉ sau khi lên HĐ? → chỗ nhập tiền.

## Bám các luật/hạ tầng sẵn có (đã thiết lập)

- **Phân quyền tab/role**: `src/lib/tabs.ts` (`DEFAULT_TAB_VIS`, `TAB_ROLES`, `roleCanTab`) + `requireTab`/`requireRole` (`src/lib/session.ts`). Server enforce, UI hide.
- **Kanban**: `src/components/KanbanHdTool.tsx` (cột theo `trang_thai_hd`: Chờ xuất HĐ|Đang xử lý HĐ|Đã lên hóa đơn|Đã thanh toán; gom cột 3/4 theo `so_hoa_don`). Route `/api/admin/kanban-hd`. Khóa sửa sau bàn giao: `canEditItems` + `lockedTickets` (route `ten-hang-rieng`).
- **Thu tiền hiện tại**: `/api/admin/hd-thu` (cộng dồn theo số HĐ) — sẽ được thay bằng `soct_thu_tien`.
- **Assignment mẫu**: `ktv_id` + luồng mời/nhận (`cong-viec` route `invite/acceptInvite`).
- **Word (nếu cần mẫu in)**: docxtemplater — xem memory `bbbg-dntt`.
- **kinh_doanh hiện tại**: role chỉ-xem trang `/kho-thue`, bị chặn khỏi `/admin` (login đẩy sang /kho-thue).
- **Migration-first**: chạy SQL trước khi push (GET select cột mới sẽ 500 nếu chưa có). File ở `migrations/` + append `supabase_migrations_ALL.sql`. **Migration mới nhất hiện tại = 51.**
