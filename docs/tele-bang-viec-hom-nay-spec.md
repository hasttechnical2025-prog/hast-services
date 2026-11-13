# Spec — "Bảng việc hôm nay" tự cập nhật trên nhóm Telegram (ít ồn)

**Trạng thái:** ĐÃ CODE 13/11/2026. Không migration (dùng `soct_cau_hinh`). **Prereq vận hành: cấp quyền "Ghim tin nhắn" cho bot trong nhóm + bật cờ `tele_board_bat` ở Cấu hình.**

## 1. Mục tiêu
Cho cả team nắm việc của mọi KTV **mà không buzz điện thoại liên tục**. Thay vì mỗi việc 1 tin, **cả ngày 1 TIN DUY NHẤT** được **ghim** + **sửa tại chỗ** mỗi khi có thay đổi. *Sửa tin Telegram KHÔNG gửi thông báo* → gần như **0 buzz**. Thay thế "Công việc chung" trong app (không ai mở).

## 2. Giữ nguyên (không đụng) — các tin LOUD liên quan trực tiếp
- **Việc giao cho KTV** → vẫn bắn **tin cá nhân** (rung) cho đúng người đó. KTV chỉ buzz vì việc **của mình**.
- **Việc chưa ai nhận** → vẫn bắn tin **CHỜ NHẬN loud** lên nhóm như hiện tại (cần người vào app nhận). (notifyNewJob nhánh `!ktv_id` giữ nguyên.)
→ Bảng ghim là **thông tin bổ sung**, không thay các tin actionable này.

## 3. Nội dung bảng
1 tin, tiêu đề + nhóm theo trạng thái, mỗi dòng theo format user chốt:
```
📋 BẢNG VIỆC HÔM NAY · 13/11/2026

⏳ Chưa nhận
• DCV 3065 * TT chiếu phim Quốc Gia (Thay vật tư)

🔧 Đang làm
• Hoàng Đức Thế - Apeos C3061 * Samsung E&A (Cài đặt)
• Phạm Hoàng Hải Sơn - bizhub 450i * Bộ Tư pháp (Sửa máy)

✅ Hoàn thành
• Phạm Quang Toàn - SF 9350 * TTX VN (Giao mực)
```
- **Dòng:** `<Tên KTV> - <model> * <tên khách> (<loại việc>)`. Chưa giao thì bỏ "Tên KTV -".
- **Nguồn:** phiếu `ngay = hôm nay (giờ VN)`, bỏ phiếu `nguon` ≠ null (phantom Thuê/CPC·Phí BT). Model = `soct_khach_hang.model`; khách = cụm||điểm máy; việc = `loai_cong_viec`.
- **Trạng thái** gom từ `ket_qua`: Chờ nhận → ⏳; Đã nhận/Đang làm → 🔧; Hoàn thành → ✅; Chưa hoàn thành → ⚠️ (mục riêng cuối).
- **Giới hạn 4096 ký tự:** format đã rất gọn (không địa chỉ/mã máy) → đủ cho ~40–50 việc. Vượt thì cắt bớt mục Hoàn thành (chỉ đếm số lượng).

## 4. Vòng đời bảng (reset theo ngày)
Lưu ở config `tele_board` = JSON `{ ngay, message_id }`:
- **Ngày mới** (`tele_board.ngay` ≠ hôm nay) → `sendMessage` tin mới → **ghim** (`pinChatMessage`, disable_notification) → **bỏ ghim** tin cũ (`unpinChatMessage`) → lưu `{ngay, message_id}` mới.
- **Trong ngày** → `editMessageText(message_id, text)` (im lặng).
- Prereq: **bot phải là admin nhóm + quyền Ghim tin**. Thiếu quyền → pin lỗi, nuốt lỗi (vẫn gửi/sửa được tin).

## 5. Kích hoạt refresh
- Hàm dùng chung **`refreshTeleBoard()`** (lib mới `src/lib/tele-board.ts`): nạp việc hôm nay → dựng text → ensure bảng (ngày mới/cũ) → edit.
- **Gọi fire-and-forget từ `broadcastJobsChanged()`** (đã được gọi ở MỌI nơi phiếu đổi: tạo/nhận/bắt đầu/hoàn thành/giao/xóa/cuốn ngày) → phủ hết các đường (/qlkt, /m, /ktv, cron) mà không phải sửa từng endpoint.
- **Chống bão:** throttle per-instance ~3–5s (biến module `lastRefreshAt`) — gộp các thay đổi dồn dập (bulk/cuốn ngày) thành 1 lần dựng. Eventually-consistent, trễ vài giây chấp nhận được.
- **Không await** trong luồng chính (không thêm độ trễ khi lưu phiếu); lỗi nuốt gọn.

## 6. Config bật/tắt
- Key `tele_board_bat` ('1'/'0', mặc định '0' — bật khi sẵn sàng). `refreshTeleBoard()` tắt → no-op.
- Thêm ô bật/tắt ở **Hệ thống › Cấu hình** (/qlkt) như các cờ khác. (Office tự chủ nếu thấy ồn/không cần.)

## 7. Telegram lib cần thêm
`src/lib/telegram.ts`: `pinChatMessage(chatId, messageId, silent=true)`, `unpinChatMessage(chatId, messageId)`. (`sendTelegramMessage` đã trả `messageId`; `editTelegramMessageText` đã có.)

## 8. Nghiệm thu
- Tạo/nhận/hoàn thành việc → **bảng ghim tự đổi**, **không có tiếng buzz** từ bảng.
- KTV vẫn **chỉ rung** khi có việc **giao cho mình** hoặc việc **chờ nhận** (như cũ).
- Qua ngày mới → bảng mới được ghim, bảng cũ bỏ ghim.
- Tắt config → không còn bảng, các tin loud cũ vẫn chạy bình thường.
- Bot thiếu quyền ghim → vẫn gửi/sửa được, chỉ không ghim (log cảnh báo).

## 9. Ngoài phạm vi / rủi ro
- Không migration; không đụng tin cá nhân/chờ-nhận hiện có.
- Rủi ro đua tạo bảng 2 lần đầu ngày (2 request đồng thời) → hiếm; chấp nhận (bỏ ghim dọn). Có thể siết sau nếu gặp.
- Rate limit Telegram (edit): ~15–20 việc/ngày × vài lần đổi = thấp, trong ngưỡng.
- Liên quan [[telegram-va-hoan-phieu]], [[chuyen-viec-nhac-trang-thai]], [[egress-free-plan]] (board đọc DB mỗi refresh — nhẹ, đã throttle).
