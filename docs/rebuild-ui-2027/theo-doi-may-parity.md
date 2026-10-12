# Parity checklist — Theo dõi máy (Bảo trì · Giám định)

> v2 = đổi giao diện + tách route, GIỮ NGUYÊN tính năng. Nguồn: `admin/page.tsx` → `BaoTriTool` (~1060 dòng) + `GiamDinhTool` + `/api/admin/bao-tri`, `/api/admin/giam-dinh`.
> ✅ đã có · 🔸 hoãn · ⬜ chưa. Giữ cỡ chữ text-xs; form max-w-6xl nếu có.

## A. Bảo trì (`theo_doi_may.bao_tri`) — 5 tab cháu
### A0. Dán counter + lưu bảo trì (đầu tab)
- [ ] ⬜ Chọn THÁNG (`MonthField`, giữ MM/YYYY) + ô dán "mã máy TAB counter" / "mã - counter" (nhiều mã; khoảng trắng/phẩy = tách)
- [ ] ⬜ Preview đối chiếu (mã khớp khách, loại trừ, counter trước, cảnh báo lùi/nhảy số) → **Lưu** (POST /api/admin/bao-tri)

### A1. Đã bảo trì (`da_bao_tri`, mặc định)
- [ ] ⬜ Danh sách bản ghi tháng đã chọn + sort cột + counter + chênh lệch
- [ ] ⬜ Xuất Excel · Xóa 1 bản ghi · Xóa tất cả tháng (?all=1) · nút **In Sổ theo dõi máy** per máy (`SoTheoDoiPrintButton`)

### A2. Chưa bảo trì (`chua_bao_tri`)
- [ ] ⬜ Máy HĐBT/MF có lịch tháng này mà chưa bảo trì (loại máy tạm dừng / ngoài lịch / chưa tới kỳ)

### A3. Tạm dừng (`tam_dung`)
- [ ] ⬜ Máy đã `tam_dung_tu_thang` (còn HĐ, đã bỏ máy)

### A4. Đối chiếu năm (`doi_chieu`)
- [ ] ⬜ Bảng mỗi máy × 12 cột tháng (✓/x/·/N/trống) + Số lần theo HĐ / Đã làm / Thiếu / Còn lại (`doiChieuNam`)
- [ ] ⬜ Chọn năm · lọc khách · Xuất Excel đúng phần hiển thị · **In sổ (N)** hàng loạt (batch SoTheoDoi)

### A5. Thống kê (`thong_ke`)
- [ ] ⬜ Thống kê + tra cứu lịch sử bảo trì theo mã máy (counter + chênh lệch)

### Gating
- [ ] ⬜ Ẩn/hiện tab cháu theo quyền (`canSub` → `subVisible` v2); tab bị ẩn tự nhảy về tab hiện đầu tiên

## B. Giám định (`theo_doi_may.giam_dinh`) — chưa khảo sát chi tiết
- [ ] ⬜ Danh sách BBGĐ + lọc (Chờ thay / Đã/Chưa báo giá) + KPI
- [ ] ⬜ "Làm báo giá" (1 BBGĐ = 1 báo giá) qua `BaoGiaEditor` (dùng chung) · tick "đã báo giá"
- [ ] ⬜ Xuất .docx BBGĐ

> Thứ tự port: A0+A1 (lõi dán counter + Đã bảo trì) → A2/A3 → A4 (đối chiếu + in sổ) → A5 → B (Giám định).
