-- MIGRATION 10: Kiểm soát hoàn trả phiếu cứng (bản giấy) sau khi KTV hoàn thành việc
-- Chạy trong Supabase SQL Editor. Idempotent.

-- 1. Trạng thái nộp phiếu cứng trên phiếu công tác
ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS da_nop_phieu BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS ngay_nop_phieu DATE;

-- 2. Ngưỡng cảnh báo trễ (số ngày kể từ ngày làm mà chưa nộp phiếu) — mặc định 3
INSERT INTO public.soct_cau_hinh (khoa, gia_tri) VALUES
    ('phieu_cung_canh_bao_ngay', '3')
ON CONFLICT (khoa) DO NOTHING;
