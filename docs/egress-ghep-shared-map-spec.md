# Spec — Bỏ embed tên tham chiếu, ghép từ shared map (giảm egress + realtime đồng nhất)

**Trạng thái:** SPEC (12/11/2026). Chưa code. Pha 1 = **Giao việc**. Không migration. Nối tiếp [[egress-kanban-payload]], [[egress-kanban-lazy-load]].

## 1. Vấn đề
Các list nóng NHÚNG (embed) dữ liệu tham chiếu TĨNH vào **mỗi dòng, mỗi lần refetch**: tên khách/điểm máy (`soct_khach_hang`), tên KTV (4 join `soct_users`), tên hàng (`soct_kho_hang.ten_hang`). Mà toàn bộ dữ liệu này **đã nằm sẵn trong shared map** (`SharedDataProvider`: `customers / users / inventory`, tải 1 lần). → egress trùng lặp khổng lồ (log thực: Giao việc **76 call/22ph**, mỗi dòng ~5–6 object tên).

**ĐÍNH CHÍNH (12/11):** KHÔNG có "lỗ hổng" realtime. Giao việc đọc tên từ embed nhưng có **poll dự phòng 60s** (`useRealtimeRefetch(..., 60000)`) → sửa tên khách/model/địa chỉ **vẫn cập nhật đúng ở máy khác trong ≤60s** (poll refetch lại embed). Hệ thống đang chạy ĐÚNG. Refactor này là **tối ưu egress + làm tên cập nhật nhanh hơn (≤1s qua KHACH/KHO thay vì ≤60s)**, KHÔNG phải vá lỗi. Chính cái poll 60s (× mỗi tab) là nguồn egress chính của Giao việc — nó refetch toàn bộ phiếu+embed mỗi phút kể cả khi không có gì đổi.

**Đường nhẹ thay thế (rủi ro thấp, cân nhắc trước khi đụng xương sống):** (1) nới poll 60s→120–180s (cắt ~50% call poll, broadcast vẫn tức thì); (2) chỉ bỏ embed `soct_kho_hang(ten_hang)` (resolve từ `inventory`), giữ embed khách/KTV. Lấy phần lớn lợi ích, ít rủi ro.

## 2. Nguyên tắc
**Server trả FK id + trường của CHÍNH phiếu (gồm đủ TIỀN); client GHÉP tên tham chiếu LÚC RENDER từ shared map.**
- Tiền (`don_gia, vat, thanh_tien, hoa_don, so_luong, ma_hang…`) **giữ nguyên trong payload phiếu** (xương sống, bắt buộc).
- Tên khách/máy/KTV/hàng **không kéo lại** — ghép từ `customers/users/inventory` theo id.

### Realtime: TỐT HƠN hiện tại (đã kiểm dây nối)
| Yếu tố hay đổi | Bảng | Broadcast khi sửa | Shared refetch |
|---|---|---|---|
| Máy (ma_may/model/serial) + Khách | `soct_khach_hang` | **KHACH** ✅ | `customers` ✅ |
| Vật tư kho | `soct_kho_hang` | **KHO** ✅ | `inventory` ✅ |

A sửa → broadcast KHACH/KHO → shared map của B refetch → list **ghép-lúc-render** đổi ngay → **B thấy ≤1s**. (Nay cũng cập nhật đúng nhưng qua **poll ≤60s** — refactor rút ngắn còn ≤1s, đồng thời làm poll nhẹ đi.)

## 3. ⚠️ Điều kiện SỐNG-CÒN
1. **GHÉP LÚC RENDER** (derive từ `jobs + maps` mỗi render, `useMemo`). **TUYỆT ĐỐI KHÔNG** bake tên vào state lúc tải — bake = đứng im như embed, mất live.
2. **Shared map đủ cột** list cần. Giao việc: `customers` ĐÃ đủ (`ten_khach_hang, dia_chi, vi_tri_dat_may, model`); `users` có `full_name`; `inventory` có `ten_hang`. → **Pha 1 không phải thêm cột.**
3. **Fallback** khi id không có trong map (khách/KTV/hàng vừa tạo chưa kịp refetch, hoặc đã xóa): hiện mã/`—`, tự đầy khi map cập nhật (nhờ render-time).

## 4. Thực thi — PHA 1: Giao việc

### 4.1 Server `GET /api/admin/cong-viec` (`baseSelect`)
BỎ khỏi select:
- `soct_khach_hang ( ten_khach_hang, dia_chi, model, vi_tri_dat_may )`
- `soct_users!ktv_id ( full_name )`, `ktv2:soct_users!ktv2_id`, `moi_ktv:soct_users!moi_ktv_id`, `moi_boi_user:soct_users!moi_boi`
- Trong `vtEmbed`: `soct_kho_hang ( ten_hang )`

GIỮ: mọi trường phiếu + FK id (`id_khach_hang, ktv_id, ktv2_id, moi_ktv_id, moi_boi, ma_may…`) + **đủ trường tiền** của vật tư (`id, ma_hang, so_luong, don_gia, vat, thanh_tien, hoa_don, da_tra, ten_hang_hd`).

**KHÔNG đụng tìm kiếm/lọc** — `q` (khách) và `vat_tu` đã khớp bằng **query RIÊNG** rồi lọc theo id (route dòng ~368–389), độc lập với embed → vẫn chạy. `?light=1` giữ nguyên cho /ktv.

### 4.2 Client `GiaoViecModule` (đã có `useShared()`)
Thêm tầng derive (ghép-lúc-render) dựng map 1 lần từ shared:
- `customersById = Map(customers, c=>c.id)`; `usersById = Map(users, u=>u.id)`; `khoByMa = Map(inventory, k=>k.ma_hang)`.
- Với mỗi job khi RENDER (useMemo phụ thuộc `jobs, customers, users, inventory`): gắn lại object để **code render cũ không đổi**:
  - `job.soct_khach_hang = customersById.get(job.id_khach_hang) ?? null`
  - `job.soct_users = usersById.get(job.ktv_id)` (full_name); tương tự `ktv2/moi_ktv/moi_boi_user`.
  - mỗi dòng vật tư: `v.ten_hd = v.ten_hang_hd || khoByMa.get(v.ma_hang)?.ten_hang || v.ma_hang`.
- Giữ nguyên bảng/cột/sort/export (vẫn đọc `j.soct_khach_hang?.ten_khach_hang`…). **Xuất CSV** cũng đọc từ object đã ghép → không đổi.

### 4.3 Realtime Giao việc
- JOBS → refetch phiếu (như cũ, mang tiền/trạng thái mới).
- KHACH/KHO → shared map đổi → **re-render tự ghép tên mới** (không cần refetch phiếu). **Thêm live cho sửa tên khách/máy/hàng mà nay đang thiếu.**
- Cân nhắc cho GiaoViecModule lắng thêm KHACH/KHO để **chủ động re-render** nếu cần (thực ra `useShared` đổi đã kéo re-render — xác nhận khi code).

## 5. Nghiệm thu (BẮT BUỘC — đây là xương sống app)
- **Trước–sau GIỐNG HỆT**: tên khách/địa chỉ/model/KTV/tên hàng + **mọi số tiền/thành tiền** trên bảng và CSV khớp 100% (so trên tập mẫu).
- **Test realtime**: máy A đổi tên 1 khách → **máy B thấy đổi trên Giao việc trong <1s, không F5**. Thử cả sửa model máy, sửa tên vật tư.
- Tìm kiếm `q`/số phiếu/vật tư vẫn ra đúng.
- Phiếu mới cho khách vừa tạo: tên hiện đúng sau khi `customers` refetch (không kẹt rỗng).

## 6. Pha sau (không làm pha 1)
- **Pha 2**: áp cùng mẫu cho **Công nợ** (bảng sửa giá cấp dòng — thêm `useShared`, bỏ embed kho, ghép tên) + **Kanban cột 1/2**.
- **Pha 3 (tối ưu refetch-fanout)**: broadcast KHACH/KHO **mang theo dòng vừa đổi** → client **vá 1 dòng** trong shared map thay vì refetch cả bảng khách/kho. Cắt nốt egress của chính realtime reference.

## 7. Ngoài phạm vi
Không migration; không đụng tiền/tìm kiếm/luồng nghiệp vụ; không nâng Pro. Liên quan [[egress-free-plan]], [[dong-nhat-toan-app]], [[showNotification-stable]] (giữ `useCallback` ổn định tránh refetch loop).
