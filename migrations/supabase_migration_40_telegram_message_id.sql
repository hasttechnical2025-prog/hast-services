-- MIGRATION 40: Lưu trữ Telegram Message ID
-- Phục vụ tính năng tự động sửa (edit) nội dung tin nhắn báo việc trống
-- khi KTV đã vào nhận việc để tránh rác Group và dọn sạch hàng đợi ảo.
-- Chạy trong Supabase SQL Editor. Idempotent.

ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS telegram_message_id BIGINT;
