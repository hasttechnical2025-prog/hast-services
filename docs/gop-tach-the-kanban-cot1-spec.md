# Spec — Gộp/Tách thẻ thủ công ở Kanban cột 1 (Chờ xuất HĐ)

**Trạng thái:** ĐANG CODE (11/11/2026). KHÔNG schema mới, KHÔNG migration (dùng lại cột `hd_lo` — migration 85).

## 1. Vấn đề
Checkbox **"Tự động gom nhóm theo khách hàng"** (`grouped`) là công tắc-xem kiểu **tất-cả-hoặc-không**: bật → gom MỌI phiếu cùng cụm/khách vào 1 thẻ (`groupKeyLo` nhánh `grouped`), office không chọn lọc được. Nó còn là **trạng thái tạm per-viewer** (không lưu DB) → mỗi người xem một kiểu; ý định gom chỉ chốt lúc bàn giao cột 1→2 qua `tach_rieng`. Hệ quả:
- Phiếu tick HĐ nhảy thẳng cột 1 **không có `hd_lo`** → mỗi phiếu 1 thẻ lẻ; muốn gộp chỉ còn cách bật checkbox cả-cụm → mất kiểm soát.
- Không gộp **chủ quan** được (VD 3 thẻ cùng khách, chỉ gộp 2, để 1 lên HĐ riêng).

## 2. Nguyên tắc
**Đơn vị gộp = `hd_lo` (lô đẩy)** đã có sẵn: 1 lô = 1 thẻ = 1 hóa đơn. Bỏ công tắc-xem, chuyển **gộp/tách thành THAO TÁC lưu xuống DB** → bền + chung cho mọi người + giữ nguyên qua bàn giao cột 1→2 (cột 2 vốn gom theo lô).

- **Gộp** các thẻ đã chọn ở cột 1 → gán **chung 1 `hd_lo` mới** (`lo_<uuid>`, khớp định dạng đẩy từ Công nợ).
- **Tách** 1 phiếu khỏi lô → `hd_lo = null` (về thẻ lẻ). Nếu lô chỉ còn ≤1 phiếu → tự xóa luôn `hd_lo` phiếu còn lại (khỏi lô 1-phiếu thừa).
- Thay checkbox bằng nút một-lần **"Gộp hết theo khách"** (gán lô cho các phiếu cùng khách ở cột 1), bấm xong vẫn **Tách** lẻ lại được.

## 3. Lan can (BẮT BUỘC)
1. **Chỉ cột 1 "Chờ xuất HĐ".** Phiếu đã rời cột 1 (Đang xử lý HĐ / Đã lên HĐ / Đã thanh toán) **hoặc đã đóng dấu `minvoice_luc`** → **chặn 409** "Thẻ đã vào luồng hóa đơn — Thu hồi HĐ trước rồi mới gộp/tách." (Khớp feature [chặn-reset](chan-reset-hoa-don-sua-phieu-spec.md).)
2. **Cùng khách mới gộp** — cùng `ma_khach_cum` (hoặc cùng `id_khach_hang` nếu không thuộc cụm). Khác khách → chặn 409 "Các phiếu khác khách hàng — không gộp chung hóa đơn."
3. **Thuê/CPC & Phí bảo trì** (`nguon ∈ {thue_cpc, phi_bao_tri}`) **luôn 1 thẻ/phiếu** → không cho gộp (chặn 409).
4. **Khóa phiếu**: phiếu đang bị **người KHÁC** khóa (`khoa_boi`) → non-admin không gộp/tách được (403, khớp chốt chặn khóa Kanban).
5. Quyền: `admin / tech_admin / staff` (chủ cột 1). `kthc` không thấy cột 1.

## 4. Thực thi

### 4.1 API mới — `POST /api/admin/kanban-hd/gop`
Body: `{ action: 'gop' | 'tach', ids: string[] }`.
- Nạp các phiếu đích (`id, trang_thai_hd, minvoice_luc, nguon, id_khach_hang, khoa_boi, report, soct_khach_hang(ma_khach_cum)`).
- Áp lan can 1–4. `gop` cần ≥2 phiếu.
- **gop**: `hd_lo = lo_<randomUUID()>` cho mọi id (chung 1 chuỗi).
- **tach**: `hd_lo = null` cho các id; sau đó, với mỗi lô bị ảnh hưởng, nếu còn ≤1 phiếu → xóa `hd_lo` nốt phiếu còn lại.
- `broadcastJobsChanged()` + `logAudit(session, 'Gộp lô HĐ' | 'Tách lô HĐ', 'phiếu … — khách …')`.

### 4.2 UI `src/features/kanban/KanbanHdTool.tsx`
- **Bỏ** state `grouped`, checkbox "Tự động gom nhóm theo khách hàng" và các nhánh dùng `grouped`:
  - `groupKeyLo`: bỏ nhánh `if (grouped) …` → chỉ còn `tc → lo → (cột1 solo / cột2 theo cụm+tach_rieng)`.
  - Lúc bàn giao cột1→2: `tach_rieng = true` (phiếu không lô → thẻ riêng; phiếu có lô → gom theo lô). Không đổi hành vi mặc định hiện tại.
- **Chọn thẻ** ở cột 1: checkbox nhỏ trên mỗi thẻ (solo/lô, **không** hiện với Thuê/CPC·Phí BT). Bấm = stopPropagation (không mở modal/kéo). State `selCot1: Record<cardId, boolean>`.
- **Thanh thao tác** phía trên danh sách cột 1 khi chọn ≥1 thẻ: "Đã chọn N thẻ" + **Gộp thẻ đã chọn** + **Bỏ chọn**. Gộp: gom ids của các thẻ chọn → kiểm cùng khách (client báo lỗi sớm) → gọi API → reload.
- **Tách**: thẻ lô ở cột 1 liệt kê từng số phiếu kèm nút **Tách** mỗi phiếu (chỉ cột 1). Badge **"Gộp N phiếu"** như cột 2.
- **Nút "Gộp hết theo khách"** thay checkbox: gom cột 1 theo khách, mỗi nhóm ≥2 thẻ → gọi gop. Có `ConfirmDialog` trước.
- Không Enter/phím tắt; xác nhận bằng `ConfirmDialog` (không `window.confirm`). Tiền `toLocaleString('vi-VN')`, ngày `DD/MM/YYYY` (đã dùng sẵn).

## 5. Ngoài phạm vi
Không đụng cột 2–4, không đổi luồng M-invoice/thu tiền, không migration. Liên quan [[bao-cao-thang]], [[ke-toan-kanban]], [[xem-truoc-hoa-don]].
