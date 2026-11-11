# Spec — Chặn sửa phiếu làm hủy hóa đơn âm thầm

**Trạng thái:** ĐÃ CODE (11/11/2026) — chờ user duyệt & push. tsc xanh.
- Lớp ① + ③ ở `src/app/api/admin/cong-viec/route.ts` (nhánh `edit` của PUT): nạp thêm `km/mien_phi/minvoice_luc` + vật tư hiện tại; guard `hdLocked && touchesHD` → 409; `nextTrangThaiHd` giữ nguyên khi khóa; audit ghi số phiếu + diff; thêm action "Chặn sửa phiếu đã khóa HĐ".
- Lớp ③ mục 5.3 ở `src/app/api/admin/kanban-hd/route.ts` (PUT): thêm `import logAudit` + log action "Thu hồi HĐ" (phiếu, trạng thái cũ→mới, số HĐ bị xóa).
- Không migration. (Thiết kế gốc bên dưới giữ nguyên để tham chiếu.)
**Phương án chốt:** B (cho sửa, nhưng không bao giờ tự hủy HĐ — muốn hủy phải Thu hồi có chủ đích) + **Lớp ①** (server chặn reset ngầm) + **Lớp ③** (audit ghi rõ ai/đổi gì). **Không** làm Lớp ② (khóa cứng ô vật tư trên form).

---

## 1. Bối cảnh & sự cố (ca 958300, 10/11/2026)

Phiếu 958300 (Giao mực, máy 36273) đã được đẩy Kanban → kthc đóng dấu M‑invoice lúc 15:54 (trạng thái `Đang xử lý HĐ`). Lúc 15:58:44 admin **sửa phiếu**; lần sửa đó làm mất cờ HĐ của vật tư (`hasHD=false`) → code tự kéo `trang_thai_hd` về `Chưa hóa đơn`, phiếu **văng khỏi Kanban, hiện lại ở Công nợ**, và (nếu đã có số HĐ) xóa luôn bản ghi thu tiền. Người sửa không hề biết mình vừa hủy hóa đơn → khi hỏi, ai cũng nói "em chả làm gì cả".

Hai lỗ hổng gốc:
1. **Reset âm thầm**: sửa phiếu có thể tự đẩy phiếu ra khỏi luồng hóa đơn, không hỏi, không cảnh báo.
2. **Audit không ghi diff**: log "Sửa công việc" chỉ ghi UUID + máy (`cong-viec/route.ts:775`), không ghi số phiếu, không ghi trước→sau.

---

## 2. Mục tiêu

- **Sửa phiếu KHÔNG BAO GIỜ tự hủy/đổi hóa đơn đã vào tay kế toán.** Mọi việc hủy HĐ chỉ xảy ra qua hành động **Thu hồi HĐ** có chủ đích (nút riêng, có xác nhận).
- Các field **không liên quan hóa đơn** (km, ghi chú, KTV, ngày, mã máy, số lượng) vẫn sửa được bình thường kể cả khi phiếu đã khóa HĐ.
- **Audit truy được**: ai sửa phiếu nào (số phiếu), đổi những gì (nhất là các thay đổi chạm hóa đơn).
- Không cần migration (dùng field sẵn có; audit chỉ làm giàu chuỗi mô tả).

---

## 3. Định nghĩa "Khóa HĐ" (phiếu đã vào tay kế toán)

Một phiếu được coi là **Khóa HĐ** khi:

```
trang_thai_hd ∈ { 'Đang xử lý HĐ', 'Đã lên hóa đơn', 'Đã thanh toán' }
   HOẶC  minvoice_luc IS NOT NULL
```

- `Chờ xuất HĐ` (cột 1) **KHÔNG** khóa — office có thể còn chỉnh trước khi kthc nhận; reset ở cột 1 vô hại (chưa có số HĐ / chưa đóng dấu). *(Nếu sau này muốn chặt hơn, có thể mở rộng khóa sang cột 1 — ghi chú để ngỏ, mặc định KHÔNG khóa.)*
- `minvoice_luc` đưa vào điều kiện để phủ ca "đã đóng dấu M‑invoice nhưng chưa kịp gán số HĐ" — chính xác ca 958300.

> ⚠️ **Khóa theo luồng HĐ, KHÔNG theo `ket_qua`.** Luồng hóa đơn tách rời luồng việc KTV: một phiếu có thể `trang_thai_hd='Đang xử lý HĐ'` trong khi `ket_qua` vẫn `Chờ nhận`. Vì vậy guard phải áp cho **mọi role** (kể cả staff/tech_admin đang sửa phiếu tiền‑xử‑lý), không được chỉ dựa vào nhánh "admin sửa phiếu đã vào việc".

---

## 4. Lớp ① — Server chặn reset ngầm (gốc rễ)

**Vị trí:** nhánh **sửa phiếu** trong `src/app/api/admin/cong-viec/route.ts` (PUT, hiện ~dòng 640–745). Đây là cửa chung phủ `/qlkt`, `/admin`, `/m`, import PDF → sửa 1 nơi, chặn mọi nơi ([[dong-nhat-toan-app]]).

### 4.1. Dữ liệu cần đọc thêm
Câu `select cur` hiện tại (dòng 643) **bổ sung** `mien_phi` và đọc kèm vật tư hiện tại của phiếu (ma_hang, so_luong, don_gia, vat, hoa_don) để so sánh. Chỉ chạy khi phiếu Khóa HĐ (hiếm) nên không ngại egress.

### 4.2. Phát hiện "thay đổi chạm hóa đơn"
So khớp payload gửi lên với dữ liệu hiện tại; coi là **chạm hóa đơn** nếu khác ở bất kỳ điểm nào:
- Tập dòng vật tư khác nhau (thêm/bớt mã, đổi `so_luong`, `don_gia`, `vat`), **hoặc**
- Cờ `hoa_don` của bất kỳ dòng nào đổi (tick ↔ bỏ tick), **hoặc**
- `mien_phi` đổi.

### 4.3. Luật xử lý khi phiếu Khóa HĐ
- **Nếu edit KHÔNG chạm hóa đơn** → lưu bình thường, nhưng **ép giữ nguyên** `trang_thai_hd`, `so_hoa_don`, `ngay_xuat_hd`, `nguoi_xuat_hd`, `minvoice_luc`, `minvoice_lan`, `ban_giao_kt_luc` (bỏ qua mọi tính `nextTrangThaiHd`/`resetHd`/xóa `hd_thu`). Vật tư giữ nguyên.
- **Nếu edit CHẠM hóa đơn** → **từ chối (HTTP 409)**, KHÔNG lưu gì, kèm thông báo:
  > "Phiếu đã vào luồng hóa đơn (đã đóng dấu M‑invoice / đã lên HĐ). Để sửa vật tư hoặc hủy hóa đơn, vui lòng **Thu hồi HĐ** trước rồi sửa lại."

→ Tức là trên phiếu Khóa HĐ, muốn đụng tới vật tư/HĐ thì **bắt buộc Thu hồi trước** (đường có chủ đích, bên dưới). Reset ngầm bị loại bỏ hoàn toàn.

### 4.4. Khi phiếu CHƯA khóa HĐ (`Chờ xuất HĐ`, `Chưa hóa đơn`, `Đã báo giá`, `Miễn phí`)
Giữ nguyên hành vi hiện tại (tính `nextTrangThaiHd`/`resetHd` như cũ). Không đổi.

### 4.5. Đường HỦY có chủ đích = Thu hồi HĐ (dùng lại cái có sẵn)
Việc đưa phiếu rời luồng hóa đơn **chỉ** còn qua nhánh **Thu hồi ở Kanban** (`kanban-hd/route.ts`, nhánh `isReset` ~dòng 262–270) — nhánh này vốn đã reset đúng và sạch (`so_hoa_don`, `ngay_xuat_hd`, `nguoi_xuat_hd`, `minvoice_luc`, `minvoice_lan`, `dntt_luc`, `so_dntt`, `ban_giao_kt_luc`) và xóa `hd_thu` tương ứng. Thu hồi đã có bước xác nhận của người thao tác → thỏa "bắt xác nhận" của phương án B.

*(Tùy chọn, không bắt buộc: thêm nút "Thu hồi HĐ" ngay trên dòng phiếu ở Giao việc cho tiện, gọi cùng API Kanban `isReset`. Nếu làm, phải có ConfirmDialog — [[no-window-confirm]].)*

### 4.6. Thông báo lỗi phía UI
Khi server trả 409, form sửa hiển thị đúng thông báo trên (toast/câu đỏ), không đóng form, không mất dữ liệu người dùng đang gõ. Không thêm phím tắt; chỉ nút ([[format-rules]] — không Enter submit).

---

## 5. Lớp ③ — Audit ghi rõ ai / đổi gì

**Vị trí:** `logAudit(session, 'Sửa công việc', …)` ở `cong-viec/route.ts:775`.

### 5.1. Ghi số phiếu thay cho UUID
Chuỗi chi tiết đổi từ `id <uuid> — máy <ma_may>` sang:
```
phiếu <report || 'chưa có số'> — máy <ma_may>
```
(Giữ `id` ở cuối trong ngoặc nếu cần tra cứu kỹ thuật, nhưng số phiếu đứng đầu để người đọc nhận ra ngay.)

### 5.2. Kèm diff các thay đổi NHẠY CẢM
So trước→sau và nối vào chi tiết **chỉ những mục có đổi** (bỏ qua nếu không đổi, tránh log rác):
- `trang_thai_hd`: `<cũ> → <mới>` (chỉ khi đổi).
- Cờ HĐ vật tư: "bỏ tick HĐ: <mã hàng>" / "tick HĐ: <mã hàng>".
- Vật tư: "xóa dòng <mã>", "thêm dòng <mã>", "đổi SL/đơn giá <mã>".
- `mien_phi`: "bật/tắt miễn phí".
- `km`: "<cũ> → <mới>" (tùy chọn — hữu ích vì km hay bị sửa).

Ví dụ log sau khi vá, nếu ca 958300 tái diễn thì nó sẽ hiện rõ:
> **Sửa công việc** — phiếu 958300 — máy 36273 — *bỏ tick HĐ: MUC‑XXX; trang_thai_hd: Đang xử lý HĐ → (bị chặn)*

→ "Em chả làm gì" hết đất sống: log chỉ thẳng ai, lúc nào, đổi gì. (Với Lớp ①, phần "→ Chưa hóa đơn" sẽ không còn xảy ra vì bị chặn; nhưng nếu người dùng bấm Thu hồi thật thì Thu hồi cũng cần log tương tự — xem 5.3.)

### 5.3. Log cho Thu hồi HĐ
Đảm bảo nhánh Thu hồi (`kanban-hd` `isReset`) cũng `logAudit` rõ: "Thu hồi HĐ — phiếu <report> — <trạng thái cũ> → Chờ xuất HĐ (xóa số HĐ <so_hoa_don cũ>)". Để mọi lần hóa đơn bị gỡ đều có dấu vết người bấm.

---

## 6. Phạm vi & kiểm thử

**Phủ (đồng nhất toàn app):** guard Lớp ① nằm ở server PUT chung → tự phủ Giao việc `/qlkt`, admin `/admin`, mobile `/m`, import PDF. Audit Lớp ③ ở cùng route.

**Ca kiểm thử bắt buộc:**
1. Phiếu `Đang xử lý HĐ` + đã đóng dấu M‑invoice → sửa **chỉ km/ghi chú** → **lưu OK**, trạng thái HĐ & dấu M‑invoice **giữ nguyên**.
2. Cùng phiếu → **bỏ tick HĐ / xóa vật tư** → **bị chặn 409**, không mất số HĐ, không mất `hd_thu`.
3. Phiếu `Chờ xuất HĐ` (cột 1) → sửa bỏ tick HĐ → vẫn về `Chưa hóa đơn` như cũ (không khóa).
4. Phiếu `Đã thanh toán` → sửa km → OK, vẫn `Đã thanh toán` (không tụt về `Chờ xuất HĐ` — đã khớp [[sua-phieu-cu-reset-trangthai]]).
5. Staff sửa phiếu `ket_qua='Chờ nhận'` NHƯNG `trang_thai_hd='Đang xử lý HĐ'` → chạm vật tư → **bị chặn** (guard theo luồng HĐ, không theo ket_qua).
6. Thu hồi HĐ ở Kanban → phiếu về cột 1 / Công nợ đúng, audit ghi rõ người + số HĐ cũ.
7. Audit: mỗi lần sửa phiếu hiện **số phiếu** + diff; sửa không đổi gì nhạy cảm thì không spam diff.

---

## 7. Không thuộc phạm vi (ghi để khỏi lan)
- Không làm Lớp ② (khóa cứng/disable ô vật tư trên form) — theo quyết định chọn B.
- Không đổi schema (không migration).
- Không đụng luồng tạo phiếu (POST) — chỉ nhánh sửa (PUT).
- Không đổi cơ chế Kanban kéo‑thả, chỉ bảo đảm Thu hồi có log (5.3).

---

## 8. Liên quan
[[sua-phieu-cu-reset-trangthai]] (vá nửa vời trước đó — spec này phủ nốt nhánh `hasHD=false`), [[khoa-phieu-kanban]], [[xem-truoc-hoa-don]], [[ke-toan-kanban]], [[dong-nhat-toan-app]], [[no-window-confirm]], [[format-rules]].
