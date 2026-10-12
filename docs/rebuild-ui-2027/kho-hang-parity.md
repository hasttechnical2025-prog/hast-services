# Parity checklist — Kho hàng (6 tab con)

> v2: mỗi tab con = 1 route riêng (mục con ở sidebar trái), KHÔNG thanh tab trong nội dung.
> ✅ đã có · 🔸 hoãn · ⬜ chưa.

- [x] ✅ **Kho máy thuê** (`may-thue`) — tái dùng nguyên `@/components/KhoMayThueTool`.
- [x] ✅ **Phiếu đề nghị** (`phieu-de-nghi`) — tái dùng nguyên `@/components/PhieuDeNghiModule` (BM38).
- [x] ✅ **Giá niêm yết** (`gia-niem-yet`) — port nguyên GiaNiemYetTool (3 mức giá role-aware, nhập giá hàng loạt, tìm/lọc).
- [x] ✅ **Tồn kho** (`ton-kho`) — port nguyên InventoryManagementTool: CRUD mã hàng + lọc (tất cả/đang dùng/ngưng) + tìm + sort bấm header + mã tương đương + Nhập/Xuất Excel (ExcelTool). `confirmDelete`→useConfirm nội bộ (DELETE `?ma_hang=`/`?all=1`); `lowStock`=`config.nguong_ton_thap`.
- [ ] ⬜ **Thống kê nhập** (`thong-ke`) — NhapHangThangTool (~715): thống kê nhập theo tháng + panel **Cảnh báo tồn** + Hàng về. Cần `canhBao`/refetch + cart.
- [ ] ⬜ **Đặt hàng** (`dat-hang`) — DatHangTool (~1078, LỚN NHẤT): đơn nháp/hàng về/tồn khả dụng/xuất Excel/lọc hãng. Cần **cart** (datHangLines localStorage) + `canhBao` + `confirmDelete(dat_hang_ct)`.

### Phụ thuộc chung cần giải khi port 3 tool còn lại
- **Cart đặt hàng**: admin lift `datHangLines` + localStorage, dùng chung Đặt hàng ↔ Thống kê (onAddToCart→go cart). v2 route riêng → cần hook `useDatHangCart` đọc/ghi localStorage + điều hướng.
- **Cảnh báo tồn** (`/api/admin/canh-bao-ton`): dùng ở Đặt hàng + Thống kê → fetch ở page hoặc thêm vào SharedData.
- **confirmDelete(id,type)**: thay bằng useConfirm + DELETE endpoint tương ứng.
