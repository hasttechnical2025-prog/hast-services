# Spec — Lazy-load cột 3/4 Kanban theo tầng (giảm egress, giữ nguyên nghiệp vụ)

**Trạng thái:** ĐÃ CODE 11/11/2026 (chờ push). Nối tiếp [[kanban-lam-nhe-payload-cot34-spec]] (đòn B cột 4 — 7e6fa86). Không schema/migration. Header dùng **head-count rẻ** (số đếm); **tổng tiền công nợ** hiện qua banner nợ đọng **khi bấm "Xem toàn bộ công nợ"** (không tính trên đường nóng) — khác chút với §3.4 (bỏ RPC sum, dùng count + tính tổng lúc nạp full).

## 1. Gốc vấn đề (đã xác nhận với nghiệp vụ)
GET `/api/admin/kanban-hd` là **đường nóng**: gọi mỗi lần đẩy phiếu + **mọi client refetch** qua `broadcastJobsChanged` (realtime). Hiện mỗi lần nạp **kéo cả 4 cột**, trong đó **cột 3 lũy kế công nợ** + **cột 4 lịch sử thu** là phần **to, tăng theo tháng, nhưng ít ai nhìn**.

Ai nhìn gì trong ngày (theo user 11/11/2026):
- **Office** → **cột 1** (Chờ lên HĐ) + **xuất ĐNTT** trên **thẻ cột 3 mới lên HĐ ≤ 7 ngày** (dùng nhiều).
- **kthc** → **cột 2** (Đang xử lý); cột 3 chỉ khi **Import Thanh toán / Đối chiếu ngân hàng** (vài lần/tuần).
- **Cột 3 nợ cũ (aging) + cột 4** → họa hoằn mới ngó.

→ Đang trả egress liên tục cho dữ liệu gần như không nhìn. Giải: **nạp theo tầng/ theo yêu cầu**, KHÔNG để phần lũy kế trên đường nóng.

## 2. Ràng buộc BẮT BUỘC giữ (vì sao không lazy thô bạo)
Rà code, cột 3 đang được **dùng client-side** ở các chỗ sau — không được làm vỡ:
1. **Xuất ĐNTT** (`exportDntt(so_hd)` — **server-side theo số HĐ**, nhưng **nút nằm trên thẻ cột 3**): cần **thẻ hiện ra để bấm**. Office dùng cho HĐ ≤ 7 ngày.
2. **Import Thanh toán FAST** (`importThanhToanFast`, dùng `cardsCol3` dòng ~1461/1501): khớp khoản thu với **mọi HĐ chưa thu** (kể cả **nợ cũ**).
3. **Đối chiếu ngân hàng** (`doiChieuNH`, dùng `cardsCol3` dòng ~1627–1670): khớp giao dịch với HĐ + tiền + ngày trên **toàn bộ** HĐ chưa thu.
4. **Header cột 3**: số đếm + **tổng công nợ phải thu** (loop `cardsCol3` dòng ~1800, ~2409).

→ (2)(3) cần **toàn bộ** cột 3 khi chạy; (1) cần **nửa gần đây**; (4) cần **con số tổng** (không cần rows).

## 3. Thiết kế: cột 3 chia 2 tầng, cột 4 on-demand
### 3.1 Scope của GET
- `?scope=active` (**mặc định**, dùng cho board mount + **mọi realtime refetch**):
  - Cột 1 (`Chờ xuất HĐ`) + Cột 2 (`Đang xử lý HĐ`): đủ như hiện tại.
  - **Cột 3 "gần đây"**: `trang_thai_hd='Đã lên hóa đơn'` AND `ngay_xuat_hd >= hôm nay(VN) − 7 ngày`. (Nửa NÓNG cho ĐNTT của office.)
  - **KHÔNG** kéo cột 3 nợ cũ, **KHÔNG** kéo cột 4.
- `?scope=cot3_full`: toàn bộ `Đã lên hóa đơn` (lũy kế, `ngay_xuat_hd != null`) — nạp **khi cần** (xem §3.3).
- `?scope=cot4&thang=YYYY-MM`: `Đã thanh toán` lọc tháng ở server (đã có logic đòn B) — nạp **khi mở cột 4**.
- `?summary=1` (hoặc gộp vào `?count=1` sẵn có): trả **rẻ** `col1/col2` (như chuông) **+ col3_count + col3_tong_con** (tổng còn phải thu). Không embed, không dòng vật tư chi tiết — xem §3.4.

### 3.2 Nạp mặc định & realtime
- Board mount: 1 lần `?scope=active` + `?summary=1`.
- `broadcastJobsChanged` → client **chỉ refetch `?scope=active`** (+ summary). Phần lũy kế/cột 4 đã nạp (nếu có) **không tự refetch** — có nút **"Tải lại"** để làm mới thủ công (nợ cũ thay đổi chậm, chấp nhận hơi cũ).

### 3.3 Nạp on-demand cột 3 toàn bộ — chèn ở 3 điểm vào, giữ nguyên code khớp
Thêm 1 hàm `ensureCol3Full()`: nếu chưa nạp lũy kế thì fetch `?scope=cot3_full`, merge vào state, đánh dấu đã nạp. Gọi **trước** khi:
- Bấm **"Xem toàn bộ công nợ"** (nút mới ở header/khu cột 3) → hiện nợ cũ.
- Bấm **Import Thanh toán** → `await ensureCol3Full()` rồi chạy `importThanhToanFast` **y như cũ** (khớp đủ cả nợ cũ).
- Bấm **Đối chiếu ngân hàng** → `await ensureCol3Full()` rồi chạy `doiChieuNH` **y như cũ**.

→ Logic khớp (`cardsCol3`, `cardTong`, pass 1/2/3…) **KHÔNG đổi một dòng**; chỉ đảm bảo dữ liệu đã có trước khi khớp. Nút 2 nghiệp vụ đổi chữ "Đang nạp công nợ…" trong lúc chờ (theo [[ux-nut-async-feedback]]).

### 3.4 Header cột 3: số đếm + tổng công nợ rẻ
- Nguồn hiển thị **số đếm + tổng còn phải thu** = `?summary=1`, **không** từ `cardsCol3` đã nạp (vì mặc định chỉ có 7 ngày).
- Cách tính rẻ: RPC/truy vấn gọn — lấy các `Đã lên hóa đơn` với `so_hoa_don`, cộng `thanh_tien` (hoặc sl×đg×(1+vat/100)) trừ `soct_hd_thu.so_tien_da_thu` theo HĐ → `col3_tong_con`. **Không** embed khách/cụm/kho, **không** trả rows. (Khuyến nghị RPC `kanban_cong_no_summary()` để cộng trong DB; nếu chưa làm RPC thì query lean field vẫn nhẹ hơn nhiều so với payload thẻ.)
- Khi đã `ensureCol3Full()`, số đếm/tổng có thể lấy từ rows thật (đồng bộ). Khi chưa, lấy từ summary.

## 4. Thay đổi UI (tóm tắt)
- Cột 3 mặc định chỉ hiện thẻ ≤ 7 ngày + dòng nhắc **"Đang hiện HĐ 7 ngày gần nhất · [Xem toàn bộ công nợ (N phiếu · còn X đ)]"**.
- Nút **Import Thanh toán / Đối chiếu ngân hàng** (đang ở khu cột 3) giữ nguyên vị trí; thêm bước `ensureCol3Full()` + trạng thái "Đang nạp…".
- Cột 4 mặc định **thu gọn**: tiêu đề + số đếm (từ summary nếu rẻ, hoặc để trống số) + nút **"Tải danh sách"** → `?scope=cot4&thang=`. (Cột 4 họa hoằn; không nạp sẵn.)
- Giữ bộ lọc kỳ/tuổi nợ cột 3 (`col3Pay/col3Age`) — áp trên tập đã nạp.
- Badge "đã xuất ĐNTT" (`dntt_luc`) nằm sẵn trong thẻ cột 3 gần đây → ĐNTT không đổi.

## 5. Ước lượng egress
- **Bỏ khỏi đường nóng:** cột 3 lũy kế (nợ cũ, tăng theo tháng) + cột 4. Đây là phần **to + nhân tần suất cao nhất** (mỗi đẩy × mỗi client).
- Phần còn nạp thường xuyên: cột 1 + cột 2 + **7 ngày cột 3** — nhỏ, có giới hạn, **không phình**.
- Nạp lũy kế/cột 4 chỉ còn **vài lần/tuần** (khi xem toàn bộ / đối chiếu / mở cột 4) thay vì **hàng trăm lần/ngày**.
- Kỳ vọng: cắt **phần lớn** egress của Kanban GET trên đường nóng; đồng thời **đòn (A)** (trimming payload cột 3/4) **gần như hết cần** vì cột 3 lũy kế/cột 4 chỉ nạp khi chủ động → hạ (A) xuống không-ưu-tiên.

## 6. Lan can / nghiệm thu (BẮT BUỘC)
- **Import Thanh toán + Đối chiếu ngân hàng phải khớp đúng NỢ CŨ** → test: HĐ xuất > 7 ngày vẫn được khớp (nhờ `ensureCol3Full`). Đây là rủi ro số 1 — sót nợ cũ = sai tiền.
- **Tổng công nợ header = đúng toàn bộ** (từ summary), không chỉ 7 ngày.
- **Xuất ĐNTT** bấm được trên thẻ ≤ 7 ngày; HĐ cũ cần ĐNTT → mở "Xem toàn bộ công nợ" rồi bấm.
- Mốc 7 ngày theo **ngày VN** (`+7h`), so sánh chuỗi `YYYY-MM-DD` an toàn timezone (khớp cách đòn B).
- Không đụng cột 1/2, luồng M-invoice, thu tiền, export.

## 7. Ngoài phạm vi / để sau
- Không chuyển matching Import/Đối chiếu sang server (giữ client-side + ensureCol3Full). Có thể làm sau nếu muốn bỏ hẳn phụ thuộc rows.
- Không nâng Pro. Không đụng tab khác (Giao việc/Công nợ/Kho — có thể spec egress riêng sau).
- Liên quan [[egress-kanban-payload]], [[egress-free-plan]], [[ke-toan-kanban]], [[cong-no-bao-gia]], [[bao-cao-thang]], [[ux-nut-async-feedback]].
