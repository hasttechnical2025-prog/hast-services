# Parity checklist — Giao việc (Sổ công tác)

> **Mục đích:** liệt kê MỌI tính năng của Giao việc ở bản hiện tại (`/admin`) để port sang `/v2` không sót.
> v2 = **đổi giao diện + tách route, GIỮ NGUYÊN tính năng**. Mỗi lần port xong 1 mục → tick vào đây.
> Trạng thái: ✅ đã có ở v2 · 🔸 hoãn (increment kế) · ⬜ chưa làm.
> Nguồn đối chiếu: `src/app/admin/page.tsx` (tab `cong_viec`/`giao_viec`) + `/api/admin/cong-viec`.

## A. Danh sách (bảng) — 10 cột
- [x] ✅ Ngày (+ chip tạo phiếu: Soạn/Nhập/Sáng-Chiều/Cuốn — lib `phieu-tao`)
- [x] ✅ Khách hàng (tên + vị trí đặt máy/địa chỉ, icon MapPin; ghì rộng 260px)
- [x] ✅ Mã máy (+ model)
- [x] ✅ Loại việc (hover popover vật tư / ghi chú cho "Khác")
- [x] ✅ KTV (chính + kèm "(kèm)" / "Chưa giao")
- [x] ✅ KM
- [x] ✅ TG xử lý (`fmtThoiLuong`)
- [x] ✅ Báo cáo HĐ (Phiếu: số phiếu + Có/Chưa HĐ: tổng tiền + "↩ Đã trả kho n/m")
- [x] ✅ Trạng thái (badge màu + chip buổi/giờ hoàn thành + icon nguồn nhận ✈️/✋)
- [x] ✅ Thao tác (xem B)
- [x] ✅ Sort mọi cột (bấm tiêu đề)
- [ ] 🔸 Phân trang (admin `usePaged`; v2 hiện render hết — thêm khi danh sách dài)
- [ ] 🔸 Ẩn/hiện cột (admin `ColumnMenu`/`useColView`)

## B. Cột Thao tác (mỗi dòng) — điều kiện hiện
- [x] ✅ **Xuất chứng từ** (BBBG theo mẫu + BBGĐ BM26 + lịch sử) — khi phiếu có vật tư
- [x] ✅ **Sửa phiếu** — khi Chờ nhận/Đã nhận (mọi office) hoặc admin (mọi trạng thái)
- [x] ✅ **Đưa về "Đã nhận"** — admin + phiếu "Đang làm"
- [x] ✅ **Vật tư / Trả về kho** — non-staff + "Hoàn thành" + có vật tư
- [x] ✅ **Xóa phiếu** — non-staff (ConfirmDialog)

## C. Thẻ KPI (tính trên danh sách đã lọc)
- [x] ✅ Tổng việc (trên N tất cả) · Hoàn thành · Đang làm/Chờ (N chưa giao) · Phát sinh tiền (có HĐ)

## D. Bộ lọc & toolbar
- [x] ✅ Dòng 1 — Ngày (từ–đến, SERVER) · Tìm mã máy/tên khách (SERVER toàn cục `q`) · Số phiếu (SERVER toàn cục, bỏ qua ngày)
- [x] ✅ Phễu lọc tại cột (CLIENT): Loại việc · KTV (gồm "Chưa giao") · HĐ (Có/Chưa/Có phát sinh tiền) · Trạng thái
- [x] ✅ Bỏ lọc (về hôm nay + xóa tất cả)
- [x] ✅ Đếm "N / N việc"
- [x] ✅ Dòng 2 — Giao việc mới (trái) · Xuất Excel (đang lọc) · Cuốn ngày · Xóa phiếu trùng · Tải lại (phải)
- [x] ✅ Realtime tự cập nhật (JOBS_TOPIC + poll)
- [ ] 🔸 Nhập phiếu từ PDF (admin, nút ở toolbar — nằm trong form, xem F)

## E. Banner & nhắc việc (phía trên bảng)
- [x] ✅ **LamTiepBanner** — phiếu "Chưa hoàn thành" đến hẹn → "Tạo phiếu tiếp" / "Không làm tiếp" (tái dùng component `@/components/LamTiepBanner`)
- [x] ✅ Banner **phiếu đặt trước** (tương lai) — "Xem →" / "← Về hôm nay"
- [ ] 🔸 **Phiếu quá hạn chưa hoàn** (unfinished past) — ở bản cũ là mục CHUÔNG (không phải banner) → gộp vào nhóm Chuông
- [ ] 🔸 **Ai nghỉ hôm nay** (leaveToday) — ở bản cũ là mục CHUÔNG → gộp vào nhóm Chuông
- [ ] 🔸 Chuông cảnh báo tổng hợp — khung `NotificationCenter` v2 mới có cảnh báo tồn kho; còn: phiếu quá hạn, nghỉ hôm nay, mực máy thuê, counter đến hạn, HĐBT sắp hết

## F. Form Giao việc mới / Sửa
- [x] ✅ Mã-máy-first (gõ mã khớp → khóa khách; không khớp → chọn/khai khách mới)
- [x] ✅ Khai khách mới (Tên/Địa chỉ/Model/Nơi đặt máy) → tạo khách trước khi tạo phiếu
- [x] ✅ Ngày · KTV chính · KTV kèm · Loại việc · SL · Số phiếu · KM
- [x] ✅ Hình thức xuất (Có phí / Miễn phí; máy Thuê/CPC auto MF)
- [x] ✅ Editor vật tư (**MaterialCombobox** tìm mã/tên/model + gợi ý mã thay thế, SL, Đơn giá #.###, VAT%, Thành tiền tự tính, HĐ, xóa) + dòng **Tồn / Đang giữ / Khả dụng / Model** + cảnh báo thiếu + cảnh báo mã lạ
- [x] ✅ Ghi chú (bắt buộc với "Khác")
- [x] ✅ Validation mirror server; autofill km
- [x] ✅ **Panel giám định** — máy có BBGĐ chờ thay: badge bảo trì tháng/HĐ + "Đưa vào ca" (modal chọn vật tư) + checkbox "Đóng giám định khi lưu" + hỏi xác nhận khi lưu (`may-status` + `giam-dinh` PUT)
- [x] ✅ **Nhập phiếu từ PDF** — nút đầu form, bóc tách điền sẵn + cảnh báo (trùng số phiếu/mã lạ) (`phieu-pdf`)
- [x] ✅ **Modal admin thêm mã hàng lạ vào kho** khi lưu (tên prefill từ PDF; thêm xong nạp lại kho)
- [ ] ⬜ KM auto-tính khi lưu = 0 (hint "Hệ thống sẽ tự tính KM" — server tự tính; hint phụ)

## G. Hành vi nền (đã có hoặc cần giữ)
- [x] ✅ Gọi lại ĐÚNG API cũ (`/api/admin/cong-viec` POST/PUT edit/DELETE, `tra-vat-tu`, `bbbg`/`bbgd`, `dedupe`, cron `cuon-ngay-phieu`)
- [x] ✅ Telegram gửi khi tạo/sửa (server tự lo — không đụng)
- [x] ✅ MF → `trang_thai_hd='Miễn phí'` (server)
- [x] ✅ Chống double-submit (lock)
- [ ] ⬜ Auto cuốn ngày khi mở trang (admin `autoCuonNgay` ngầm) — v2 có nút tay; cân nhắc tự chạy

---
### Còn thiếu gộp lại (thứ tự đề xuất làm tiếp)
1. ~~Form: giám định + nhập PDF + thêm mã lạ~~ ✅ XONG.
2. **Banner**: LamTiepBanner (quan trọng — nhắc làm tiếp), đặt trước/quá hạn/nghỉ hôm nay.
3. **Chuông**: bổ sung các nhóm cảnh báo còn lại.
4. **Bảng**: phân trang + ẩn/hiện cột (khi cần).
