# "Chưa hoàn thành" — việc làm nhiều buổi (Mô hình B) — SPEC

> Thay cơ chế "Lắp tiếp" cũ (giữ 1 phiếu treo mở) bằng **phiếu tiếp nối có liên kết**:
> làm dở hôm nay → đóng phiếu buổi này + hẹn ngày → đến hẹn office tạo phiếu tiếp (link phiếu gốc).
> Chốt qua trao đổi 2026-08-24. Khi code: đọc file này.

## Đổi tên trạng thái
- `ket_qua`: **'Lắp tiếp' → 'Chưa hoàn thành'**. Migration DROP+ADD `soct_cong_viec_ket_qua_check` + UPDATE dữ liệu cũ. Rà ~15 chỗ code tham chiếu 'Lắp tiếp'.

## Trường DB mới (`soct_cong_viec`)
- `ngay_hen` DATE — ngày hẹn làm tiếp.
- `phieu_goc_id` UUID → soct_cong_viec(id) ON DELETE SET NULL — phiếu TIẾP trỏ về phiếu GỐC (chuỗi).

## Luồng KTV
1. 'Đang làm' → nút **"Chưa hoàn thành"** (thay "Lắp tiếp").
2. Bấm → hộp **chọn ngày hẹn làm tiếp** (DateField, mặc định **hôm nay**, cho chọn hôm nay hoặc sau).
3. Lưu: `ket_qua='Chưa hoàn thành'`, `ngay_hen`. **CÓ đóng dấu giờ buổi** như 'Hoàn thành' (tính công + lead time buổi này). **Vật tư KHÔNG trừ kho** (dồn hết sang phiếu tiếp — kho trừ 1 lần ở phiếu cuối).
   - Đi qua hàng đợi offline `status-queue.ts` như các đổi trạng thái khác; kèm `ngay_hen`.

## Banner office (admin dashboard + /m)
- Nhắc: các phiếu `ket_qua='Chưa hoàn thành'` có `ngay_hen <= hôm nay` **VÀ chưa có phiếu con** (chưa ai `phieu_goc_id` trỏ tới) — gồm cả **quá hạn**.
- Mỗi phiếu 2 hành động:
  - **"Tạo phiếu tiếp"** (1 chạm): sinh phiếu mới cùng **khách/máy/loại_cong_viec**, **sao chép TOÀN BỘ vật tư** phiếu gốc, `ghi_chu` = "Làm tiếp phiếu ngày DD/MM" (+ giữ ghi chú gốc nếu có), `phieu_goc_id` = gốc, `ngay` = hôm nay (hoặc ngay_hen), office chọn giao KTV (hoặc để pool 'Chờ nhận'). Tạo xong → phiếu gốc rời banner (đã có con).
  - **"Không làm tiếp"** (đóng): dismiss khỏi banner (đặt `ngay_hen=null` — coi như đã xử lý, không nhắc nữa).
- Quyền tạo phiếu tiếp: **office** (admin/tech_admin/staff). KTV chỉ đánh dấu + chọn ngày (có thể thêm KTV tự tạo sau).

## Chuỗi & báo cáo & kho
- Chuỗi: phiếu gốc ('Chưa hoàn thành') → phiếu tiếp → … → phiếu cuối 'Hoàn thành'.
- Mỗi phiếu = 1 buổi/lần đi (đếm công KTV theo buổi); đánh dấu 'tiếp nối' qua `phieu_goc_id` để không nhầm trùng.
- **Kho**: vật tư dồn hết sang phiếu tiếp → **chỉ trừ 1 lần** ở phiếu 'Hoàn thành' cuối. Phiếu 'Chưa hoàn thành' KHÔNG trừ (trigger vẫn chỉ chạy khi → 'Hoàn thành').

## Rà code 'Lắp tiếp' → 'Chưa hoàn thành' (các file)
`m/page.tsx` (STATUS_ORDER, badge), `ktv/page.tsx` (nút + badge + luồng), `admin/page.tsx` (filter, badge, help, query hôm-qua), `api/admin/bao-cao-ktv`, `api/ktv/bao-cao`, `api/admin/cong-viec` (+ bulk KET_QUA), `lib/report/bao-cao.ts`, `lib/status-queue.ts`, `api/admin/kho-hang/dang-giu`, `webhook/supabase`. (Nhiều chỗ là comment.)

## Quyết định đã chốt
- Mô hình **B** (phiếu tiếp nối có liên kết). Đổi tên **hẳn** 'Lắp tiếp'→'Chưa hoàn thành'.
- Đến hẹn: **banner nhắc + 1 chạm tạo** (không tự động). Vật tư **dồn hết sang phiếu tiếp**.
- 'Chưa hoàn thành' **có** hỏi giờ buổi; ngày hẹn mặc định **hôm nay**; office tạo phiếu tiếp.
