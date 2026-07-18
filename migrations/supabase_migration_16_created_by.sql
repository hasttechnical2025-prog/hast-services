-- MIGRATION 16: Lưu NGƯỜI TẠO PHIẾU để hiển thị trong tin nhắn Telegram
-- Chạy trong Supabase SQL Editor. Idempotent.

ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.soct_users(id) ON DELETE SET NULL;
