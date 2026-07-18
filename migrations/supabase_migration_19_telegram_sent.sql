-- MIGRATION 19: Thêm cờ telegram_sent để chặn Webhook DB bắn trùng tin nhắn lẻ tẻ khi giao việc hàng loạt
-- Chạy trong Supabase SQL Editor. Idempotent.

ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS telegram_sent BOOLEAN NOT NULL DEFAULT FALSE;
