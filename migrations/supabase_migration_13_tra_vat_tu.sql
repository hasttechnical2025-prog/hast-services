-- MIGRATION 13: Trả vật tư về kho (khách không lấy nữa sau khi phiếu Hoàn thành)
-- Chạy trong Supabase SQL Editor. Idempotent.

-- Cờ đánh dấu dòng vật tư đã được trả về kho (giữ dòng để đối soát) + ngày trả
ALTER TABLE public.soct_chi_tiet_vat_tu
    ADD COLUMN IF NOT EXISTS da_tra BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.soct_chi_tiet_vat_tu
    ADD COLUMN IF NOT EXISTS ngay_tra DATE;
