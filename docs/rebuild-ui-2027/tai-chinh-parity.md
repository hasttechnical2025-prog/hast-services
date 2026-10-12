# Parity checklist — Tài chính (+ Kanban tách riêng)

> v2: mỗi tab con = 1 route. Kanban đã **tách thành menu cha "lá"** riêng (2026-10-12).
> ✅ đã có · 🔸 hoãn · ⬜ chưa.

- [x] ✅ **Công nợ** (`tai-chinh/cong-no`) — port nguyên CongNoTool (~505 dòng): gom phiếu theo khách/cụm (radio chọn 1 khách, tick phiếu đẩy), BaoGiaEditor (showSoPhieu/slDisabled), đánh dấu Đã báo giá, **Đẩy Kanban** (ghi line_edits giá/VAT/ĐVT), **Tách hóa đơn** (modal keep_qty từng dòng → phiếu con -N), Áp mẫu/Lưu mẫu khách (ten-hang-rieng), Xuất bảng kê lẻ .xlsx + Xuất/Nhập Excel sửa giá. Realtime CONGNO+JOBS. StatCards→StatRow.
- [x] ✅ **Thuê / CPC** (`tai-chinh/thue-cpc`) — tái dùng nguyên `@/components/ThueCpcModule` (tự quản 3 tab cháu: Danh sách máy · Nhập counter · Cảnh báo vật tư). `canSub` nối `subSubVisible('tai_chinh','thue_cpc', g)` (vừa thêm vào SessionProvider).
- [x] ✅ **Phí bảo trì** (`tai-chinh/phi-bao-tri`) — tái dùng nguyên `@/components/PhiBaoTriModule`.
- [x] ✅ **Kanban Hóa đơn** (`/v2/kanban`) — **TÁCH thành menu cha "lá"** (không con, bấm mở thẳng), nhãn **đỏ** (tone rose), gate quyền `tai_chinh.kanban`. Tái dùng `@/components/KanbanHdTool`. `defaultModuleFor(kthc)`→`/v2/kanban`.

### Hạ tầng thêm khi làm cụm này
- **SessionProvider.subSubVisible(parent, sub, subsub)** — gating cấp-3 (cho ThueCpc; trước đây còn thiếu ở v2).
- **V2Parent.leaf + permSub + tone** — hỗ trợ cha "lá" (Kanban), gate theo sub-key, tô màu nhãn.
- **AppShell**: render cha lá (mở `/v2/<slug>`, không list con) + **ẩn cha không còn con nào** (sửa lỗi Tài chính rỗng với role kthc).

**→ Cụm Tài chính HOÀN TẤT (Công nợ · Thuê/CPC · Phí bảo trì) + Kanban tách riêng ✅.**
