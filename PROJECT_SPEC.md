# YÊU CẦU THIẾT KẾ & PHÁT TRIỂN ỨNG DỤNG QUẢN LÝ GIAO VIỆC & KHO HÀNG (TECH-SERVICE APP)

## 1. Công nghệ sử dụng (Tech Stack)
- **Frontend**: Next.js (App Router), React, TailwindCSS, Lucide Icons, Shadcn/ui (hoặc thư viện component tương đương).
- **Backend/Database**: Supabase (PostgreSQL, Realtime, Database Triggers). Sử dụng schema `public` hiện có.
- **API Bản đồ**: OpenStreetMap (Nominatim API) để Geocoding địa chỉ khách hàng thành tọa độ lat/lng và OSRM API (Open Source Routing Machine) để định tuyến đường đi thực tế tính khoảng cách km từ công ty đến khách hàng (hoàn toàn miễn phí, không cần API key).
- **Hosting/Deployment**: Vercel (Frontend/Next.js).

## 2. Quy tắc Tích hợp & Quản lý trạng thái Git
- Ứng dụng phải được phát triển theo từng tính năng nhỏ (feature-by-feature).
- Sau mỗi tính năng hoạt động ổn định, cần chạy `npm run build` và check lint để đảm bảo code sạch, sau đó thực hiện Git Commit tự động để quản lý tiến độ.

## 3. Kiến trúc Cơ sở dữ liệu (Supabase PostgreSQL)
*LƯU Ý QUAN TRỌNG: Tất cả các bảng phải có tiền tố `soct_` (viết tắt của Sổ công tác) để tránh xung đột với các ứng dụng khác đang chạy chung trên cùng một database Supabase.*

### Bảng danh mục & Hệ thống
1. **`soct_users`** (Bảng thông tin nhân viên, liên kết với auth.users):
   - `id` (uuid, PK, references auth.users(id))
   - `full_name` (text)
   - `role` (text: 'admin', 'ktv')
   - `telegram_id` (text, optional)

2. **`soct_khach_hang`**:
   - `id` (uuid, PK)
   - `ten_khach_hang` (text)
   - `dia_chi` (text)
   - `lat` (float8, tọa độ vĩ độ)
   - `lng` (float8, tọa độ kinh độ)
   - `km_mac_dinh` (float8, khoảng cách lưu trữ sau lần tính đầu tiên)

3. **`soct_kho_hang`**:
   - `ma_hang` (text, PK - ví dụ: AC7A09A, CT200647)
   - `ten_hang` (text)
   - `model` (text)
   - `hang` (text)
   - `ton_kho` (int4, default 0)

4. **`soct_nhap_hang_thang`** (Dữ liệu lịch sử cho kế toán kiểm hóa đơn):
   - `id` (uuid, PK)
   - `ma_hang` (text, FK references soct_kho_hang)
   - `thang_nam` (text - định dạng: YYYY-MM, ví dụ: 2026-03)
   - `so_luong_nhap` (int4)

### Bảng Đặt hàng
5. **`soct_dat_hang`** (Quản lý đơn đặt nhà cung cấp):
   - `id` (uuid, PK)
   - `ngay_dat` (date)
   - `ma_hang` (text, FK references soct_kho_hang)
   - `sl_dat` (int4)
   - `nha_cung_cap` (text)
   - `so_don_hang` (text, optional)
   - `da_dat` (boolean, default false)
   - `hoan_thanh` (boolean, default false) - tự động cập nhật khi hàng về đủ
   - `ghi_chu` (text, optional)

6. **`soct_hang_ve_dot`** (Chi tiết các đợt hàng về thực tế):
   - `id` (uuid, PK)
   - `id_dat_hang` (uuid, FK references soct_dat_hang)
   - `ngay_nhan` (date)
   - `so_luong_nhan` (int4)

### Bảng Giao việc & Tiêu hao
7. **`soct_cong_viec`** (Sổ công tác chính):
   - `id` (uuid, PK)
   - `ngay` (date)
   - `ma_may` (text)
   - `id_khach_hang` (uuid, FK references soct_khach_hang)
   - `loai_cong_viec` (text)
   - `km` (float8, tự động tính bằng 0 nếu cột kem = true)
   - `kem` (boolean, default false) - Đánh dấu đi kèm ca khác cùng địa điểm
   - `ktv_id` (uuid, FK references soct_users, optional) - KTV được gán việc
   - `ket_qua` (text, default 'Chờ nhận' - các trạng thái: 'Chờ nhận', 'Đang làm', 'Hoàn thành', 'Lắp tiếp')
   - `ghi_chu` (text, optional)
   - `repeat_call` (boolean, default false) - Tự động đánh dấu nếu máy này đã được sửa gần đây (trong 15-30 ngày)

8. **`soct_chi_tiet_vat_tu`** (Danh sách các vật tư sử dụng cho ca sửa chữa):
   - `id` (uuid, PK)
   - `id_cong_viec` (uuid, FK references soct_cong_viec)
   - `ma_hang` (text, FK references soct_kho_hang)
   - `so_luong` (int4)

## 4. Logic Nghiệp vụ & Database Triggers (SQL Script)

### Trigger 1: Xử lý nhập hàng và tồn kho
Khi INSERT/UPDATE/DELETE một đợt hàng về (`soct_hang_ve_dot`):
1. **Tồn kho thực tế (`soct_kho_hang`)**: Cộng/Trừ số lượng thay đổi của `so_luong_nhan` tương ứng với `ma_hang`.
2. **Trạng thái đơn hàng (`soct_dat_hang`)**: Tính tổng số lượng hàng đã nhận của `id_dat_hang`. Nếu >= `sl_dat` thì cập nhật `hoan_thanh = true`.
3. **Thống kê kế toán (`soct_nhap_hang_thang`)**: Tự động cập nhật hoặc thêm mới số lượng nhập của `ma_hang` theo `ngay_nhan` (YYYY-MM).

### Trigger 2: Xử lý KTV hoàn thành công việc và tiêu hao kho
Khi bảng `soct_cong_viec` cập nhật `ket_qua` thành `'Hoàn thành'`:
1. Duyệt qua tất cả các bản ghi trong `soct_chi_tiet_vat_tu` có `id_cong_viec` tương ứng.
2. Với mỗi mã hàng, tự động trừ số lượng tồn kho `ton_kho` trong `soct_kho_hang` tương ứng với `so_luong` tiêu hao.

## 5. Quy trình Tính Khoảng cách KM & Tọa độ Địa lý (Nominatim + OSRM)
- **Tọa độ văn phòng công ty (Điểm gốc)**: `lat: 21.011681`, `lng: 105.809180` (5 Nguyễn Ngọc Vũ, Hà Nội).
- **Cách tính**: Frontend dùng Nominatim API lấy tọa độ khách -> Gọi OSRM Route API tính khoảng cách đi xe (quy đổi ra km) -> Lưu vào `soct_khach_hang`.
- **Nếu `kem` = true**: Khoảng cách `km` tự động bằng `0`.

## 6. Yêu cầu Giao diện & Trải nghiệm Người dùng (UI/UX)
- Thiết kế cho **Admin Dashboard (Văn phòng)** và **Mobile Web (KTV)** với các tính năng realtime đồng bộ qua Supabase.