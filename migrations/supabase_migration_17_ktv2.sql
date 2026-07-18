-- MIGRATION 17: Hỗ trợ 2 KTV (KTV chính + KTV kèm)
-- Chạy trong Supabase SQL Editor. Idempotent.

ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS ktv2_id UUID REFERENCES public.soct_users(id) ON DELETE SET NULL;
