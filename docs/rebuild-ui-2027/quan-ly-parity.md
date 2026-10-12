# Parity checklist — Quản lý (5 mục → Khách hàng gộp còn 4 mục nav)

> v2: mỗi mục = 1 route. ✅ đã có · 🔸 hoãn · ⬜ chưa.

- [x] ✅ **Báo cáo KTV** (`quan-ly/bao-cao-ktv`) — port nguyên BaoCaoKtvTool: lọc KTV/khoảng ngày, TG xử lý TB (tổng + theo loại việc), nhật ký theo Ngày→KTV (phiếu sửa + việc ngoài luồng + trạng thái nộp), xuất Word .docx/ngày. technicians = users (SharedData).
- [x] ✅ **Khách hàng** (`quan-ly/khach-hang`) — GỘP Điểm máy (CustomerListTool + Excel) + Khách cụm (KhachCumTool + DoiChieuMinvoiceModal), 2 tab con sticky. (xem cũng ở phần cũ)
- [x] ✅ **Báo cáo tháng** (`quan-ly/bao-cao-thang`) — port nguyên BaoCaoThangTool: chọn tháng → preview Mục 1–5 (tự tính), KPI kế toán, nhập tay Mục 3/6/7/8, bảng doanh số theo tháng (CRUD /doanh-so), xuất .docx theo template.
- [x] ✅ **Nghỉ phép** (`quan-ly/nghi-phep`) — tái dùng nguyên `@/components/NghiPhepDuyet` (duyệt đơn nghỉ phép/ốm).

**→ Cụm Quản lý HOÀN TẤT.**
