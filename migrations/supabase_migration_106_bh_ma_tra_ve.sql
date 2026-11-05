-- MIGRATION 106: Bảo hành FBVN — thêm trường "Mã trả về".
--
-- Khi hãng trả hàng bảo hành, con hàng trả về CÓ THỂ khác mã đã gửi (mã mới / mã thay thế),
-- vd gửi 948K41790 -> nhận 948K59323. Lưu lại để sau tra "con đang lắp ở máy khách là mã nào".
-- Để TRỐNG = hãng trả đúng mã đã gửi (đa số). Gộp 1 khái niệm "mã nhận về khác mã gửi".
-- Idempotent. Chạy trong Supabase SQL Editor.

ALTER TABLE public.soct_bh_fbvn
    ADD COLUMN IF NOT EXISTS ma_tra_ve TEXT;   -- Mã trả về (nếu hãng trả mã khác mã gửi)
