# Parity checklist — Hoàn phiếu (kiểm soát nộp phiếu cứng)

> v2 = đổi giao diện + tách route, GIỮ NGUYÊN tính năng. Nguồn: `admin/page.tsx` → `PhieuCungTool` + `/api/admin/phieu-cung`.
> ✅ đã có · 🔸 hoãn · ⬜ chưa.

## KPI
- [x] ✅ Chưa nộp (phiếu cần thu) · Quá hạn (tồn ≥ ngưỡng `phieu_cung_canh_bao_ngay`, mặc định 3) · KTV còn nợ

## Bộ lọc & toolbar
- [x] ✅ Tìm **số phiếu**
- [x] ✅ Lọc **KTV** (derive từ danh sách) + "Chưa giao"
- [x] ✅ Checkbox **"Chỉ chưa nộp"** (mặc định bật)
- [x] ✅ Đếm "N phiếu"
- [x] ✅ **Nhắc KTV qua Telegram** (POST) — hiện mọi role office
- [x] ✅ **Nộp toàn bộ** (admin) — PUT {all:true} + ConfirmDialog
- [ ] 🔸 Ẩn/hiện cột (admin ColumnMenu) — nhỏ

## Bảng (7 cột) + hành vi
- [x] ✅ Ngày · Số phiếu · Khách hàng · Loại việc · KTV · Tồn (ngày, đỏ + ⚠️ khi quá hạn) · Đã nộp
- [x] ✅ **Toggle Đã nộp / Đánh dấu nộp** per dòng (PUT {id, da_nop_phieu}); tooltip ngày nộp
- [x] ✅ Sort mọi cột (DataTable)
- [x] ✅ Realtime JOBS_TOPIC
- [ ] 🔸 Phân trang (admin usePaged) — hiện render hết; thêm khi danh sách dài

Trạng thái: **đạt parity** (chỉ còn ẩn/hiện cột + phân trang — việc nhỏ, chung với Giao việc).
