# Spec — Làm nhẹ payload Kanban Hóa đơn (cột 3/4) để giảm egress

**Trạng thái:** Phase 1 (đòn B) ĐÃ CODE 11/11/2026. Đòn A/C HOÃN (xem §7). Không schema mới.

## 0. Đã làm / còn lại
- ✅ **Đòn (B) — lọc kỳ CỘT 4 ở server** (commit sắp push): `/api/admin/kanban-hd` GET tách 2 truy vấn — cột 1-3 lũy kế như cũ; **cột 4 (Đã thanh toán) lọc `thanh_toan_luc` trong tháng đang chọn NGAY Ở SERVER** (`.gte(YYYY-MM-01).lt(tháng kế)`) thay vì kéo toàn bộ lịch sử thu rồi lọc client. **Hiển thị y hệt** (client vốn chỉ hiện tháng đó). Đã verify parity chuỗi so khớp `slice(0,7)` + biên tháng 12 cuộn năm.
- ⏸ **Đòn (A) bỏ dòng vật tư cột 3/4 + (C) RPC aggregate — HOÃN** (xem §7).

## 1. Bối cảnh
Supabase Free 5 GB egress/chu kỳ đã vượt (111%, grace hết 16/11). Egress phình **tích lũy từ 7/2026**: GET `/api/admin/kanban-hd` là đường nóng (gọi mỗi lần đẩy phiếu + **mọi client refetch** qua `broadcastJobsChanged`), payload lại **phình theo thời gian**.

### Gốc rễ đo được trong code hiện tại
- GET kéo **1 cục cả 4 cột** (`.in('trang_thai_hd', [Chờ xuất, Đang xử lý, Đã lên HĐ, Đã thanh toán])`), mỗi phiếu kèm **toàn bộ** `soct_chi_tiet_vat_tu` (id, ma_hang, so_luong, don_gia, vat, thanh_tien, hoa_don, da_tra, ten_hang_hd, thu_tu, don_vi_tinh, embed `soct_kho_hang.ten_hang`).
- **Cột 3** ('Đã lên hóa đơn') lấy **lũy kế toàn bộ** nợ chưa thu (chỉ lọc `ngay_xuat_hd != null`) → số dòng **tăng vô hạn** theo công nợ tồn.
- **Cột 4** ('Đã thanh toán') **kéo HẾT lịch sử đã thu** rồi mới lọc tháng **ở client** (`filtered`) → byte của **mọi tháng kể từ 7/2026** rời DB mỗi lần nạp board, dù chỉ xem 1 tháng.

→ Mỗi lần nạp Kanban ≈ kéo gần như **toàn bộ lịch sử hóa đơn + thu tiền của app** kèm chi tiết vật tư. Đây là term phình đúng vào chu kỳ 10/2026 vượt mốc 5 GB.

## 2. Nguyên tắc
Thẻ **cột 3/4 chỉ hiển thị**: tên khách, MST, **tổng tiền** (Thành tiền / Trước VAT), số HĐ, ngày xuất, người lập, ngày thu, đã thu, ĐNTT, timeline. **KHÔNG hiển thị từng dòng vật tư** (dòng chỉ xem khi *mở thẻ*). Vậy:
1. **Bỏ mảng vật tư khỏi payload cột 3/4**, server **cộng sẵn** `tong_truoc_vat` + `tong_sau_vat` (công thức khớp `getVatTuStats`: `truocVat = Σ sl×đg` (dòng `da_tra=false`); `sauVat = Σ sl×đg×(1+vat/100)`).
2. **Lọc kỳ ngay ở SERVER** cho cột 3/4 thay vì kéo hết rồi lọc client.
3. **Giữ nguyên cột 1/2** (cần đủ chi tiết để sửa tên hàng + đóng dấu M-invoice).
4. **Mở thẻ cột 3/4 → lazy-load** dòng vật tư của riêng thẻ (1 query nhỏ).

## 3. Thực thi (đề xuất)
- **Tách truy vấn theo nhóm cột** trong GET:
  - **Cột 1+2** (`Chờ xuất HĐ`, `Đang xử lý HĐ`): giữ nguyên embed vật tư đầy đủ. Tập nhỏ (đang thao tác).
  - **Cột 3+4** (`Đã lên hóa đơn`, `Đã thanh toán`): select **KHÔNG embed** `soct_chi_tiet_vat_tu` chi tiết; thay bằng **tổng cộng sẵn**.
    - Phương án nhẹ nhất (A): kéo riêng vật tư các phiếu cột 3/4 chỉ với `id_cong_viec, so_luong, don_gia, vat, da_tra` (không tên/kho/đvt/thứ tự), cộng ở server, gắn `tong_truoc_vat/tong_sau_vat` vào phiếu rồi **bỏ mảng**.
    - Phương án triệt để (C, tùy chọn): RPC/view aggregate trả thẳng `sum` theo phiếu → không kéo dòng nào.
- **Lọc kỳ ở server (B):**
  - **Cột 4**: `.gte('thanh_toan_luc', <đầu tháng kỳ>)` `.lt(<đầu tháng kế>)` ngay trong truy vấn (bỏ lọc client `filtered`).
  - **Cột 3**: mặc định lọc **kỳ đang chọn / N ngày gần nhất**; nút **"Xem lũy kế"** mới kéo thêm (và kéo thêm vẫn **chỉ tổng**, không dòng). Tận dụng state `col3ChiKyNay` sẵn có — chuyển lọc từ client sang server.
- **Frontend**: thẻ cột 3/4 render tổng từ `tong_sau_vat/tong_truoc_vat` thay vì `getVatTuStats(allVt)`. Modal mở thẻ cột 3/4 → fetch `soct_chi_tiet_vat_tu` theo `id_cong_viec` (lazy). Export (ĐNTT/M-invoice từ cột 3) nếu cần dòng thì cũng lazy theo thao tác, không nằm đường nóng board.
- **Bổ trợ (giảm fanout):** `broadcastJobsChanged` sau khi đẩy chỉ nên khiến client refetch **cột 1/2**; cột 3/4 không cần refetch mỗi lần đẩy (đẩy không đụng chúng). (Có thể làm cùng hoặc tách phase.)

## 4. Ước lượng % egress tiết kiệm
**Cấu thành 1 phiếu (JSON minified, ước lượng):**
| Phần | Bytes/phiếu |
|---|---|
| Field phiếu + embed khách/cụm/user | ~0,8–1,2 KB |
| Mảng vật tư (TB ~3 dòng × ~0,2 KB) | ~0,6–0,8 KB; phiếu lắp máy (8–15 dòng) 2–4 KB |

→ Vật tư ≈ **40–55% payload** mỗi phiếu (cao hơn ở phiếu nhiều dòng).

**Theo SỐ DÒNG mỗi cột:** cột 1/2 là tập nhỏ (đang thao tác); **cột 3 (lũy kế nợ chưa thu) + cột 4 (toàn bộ lịch sử thu)** áp đảo và **tăng theo tháng**. Sau ~5 tháng chạy, cột 3+4 ước ~**80–95% số dòng** GET trả về.

**Hai đòn:**
- **(A) Bỏ dòng vật tư cột 3/4** → cắt ~**40–55%** mỗi phiếu thuộc 80–95% số dòng.
- **(B) Lọc kỳ server cột 4** → cột 4 từ "toàn bộ paid kể từ 7/2026" còn **1 tháng**; sống 5 tháng ⇒ cột 4 còn ~**1/5** số dòng (~−80%). Cột 3 lọc kỳ cũng cắt mạnh phần nợ cũ.

**Tổng hợp:** payload mỗi lần nạp Kanban giảm ước **~55–70%** (A+B cộng hưởng), và quan trọng hơn: **triệt tiêu term phình theo thời gian** (cột 3/4 không còn lớn dần vô hạn). Nhân với tần suất (mỗi lần đẩy × mỗi client refetch realtime) ⇒ tác động lên **egress tổng đáng kể**.

**Thận trọng diễn giải:** đây là % của **riêng Kanban GET** (một trong các đường nóng nhất), KHÔNG phải % egress toàn app — vẫn còn tab Giao việc, Công nợ, Kho… Muốn ước egress toàn app cần đo tỷ trọng Kanban GET trong tổng (chưa có số đo; có thể lấy từ Supabase Logs theo path nếu cần sau).

## 5. Lan can / nghiệm thu (BẮT BUỘC)
- **Tổng tiền cột 3/4 KHÔNG ĐƯỢC lệch**: đối chiếu `tong_sau_vat` server = `Math.round(getVatTuStats.sauVat) + cardLamTron` cũ trên tập mẫu trước khi gỡ dòng. Nhớ cộng `lam_tron` (ở phiếu, không ở vật tư).
- Mở thẻ cột 3/4 vẫn phải thấy **đủ dòng vật tư** (lazy) — không rơi dữ liệu.
- Giữ `so_tien_da_thu`, `_co_mau`, badge tuổi nợ, ĐNTT… như cũ.
- Không đụng cột 1/2, luồng M-invoice, thu tiền, export.

## 7. Vì sao HOÃN đòn (A) — lý do kỹ thuật
Rà frontend: mảng `soct_chi_tiet_vat_tu` bị đọc ở ~15 chỗ, trong đó cột 3/4 chạm:
- Tổng tiền thẻ (`getVatTuStats`), sắp xếp (`cardTong`), **modal** (bảng vật tư), và `aggVatTu` cho export — trong đó cờ **`ghepMa` phụ thuộc `!!v.soct_kho_hang`** (embed kho). Bỏ embed/dòng ở cột 3/4 sẽ đổi `ghepMa` → rủi ro **sai tên ghép mã khi xuất** + modal rỗng vật tư nếu không lazy-load.
→ Đòn (A) cần: nguồn tổng từ field server (`_tong_sau_vat`) + **lazy-load dòng khi mở thẻ** cột 3/4 + giữ đúng `ghepMa`. Đây là refactor lớn, dễ sai **tiền/tên hóa đơn** — mà user KHÔNG test từng phần. Làm riêng 1 phase, có bước đối chiếu tổng cũ=mới + mở thẻ đủ dòng trước khi gỡ. Đòn (B) đã chặn term phình tệ nhất (cột 4 vô hạn) nên (A) không còn gấp.

## 6. Ngoài phạm vi
Không nâng Pro (quyết định riêng), không đổi schema (trừ RPC tùy chọn C), không đụng các tab khác (có thể là spec egress riêng sau). Liên quan [[egress-free-plan]], [[supabase-1000-row-cap]], [[ke-toan-kanban]], [[cong-no-bao-gia]].
