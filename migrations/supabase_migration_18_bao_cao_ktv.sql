-- MIGRATION 18: Báo cáo KTV (Nhật ký công việc) và Ngày nghỉ lễ
-- Chạy trong Supabase SQL Editor. Idempotent.

-- 1. Bổ sung các cột báo cáo vào bảng Công việc chính
ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS counter INT,
    ADD COLUMN IF NOT EXISTS ghi_chu_ktv TEXT;

-- 2. Bảng lưu trữ ngày nghỉ lễ theo quy định (để loại trừ khỏi báo cáo & nhắc nhở)
CREATE TABLE IF NOT EXISTS public.soct_ngay_nghi (
    ngay DATE PRIMARY KEY,
    ghi_chu TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Bảng nhật ký công việc ngoài luồng (việc không tên) của KTV
CREATE TABLE IF NOT EXISTS public.soct_nhat_ky_ktv (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ktv_id UUID NOT NULL REFERENCES public.soct_users(id) ON DELETE CASCADE,
    ngay DATE NOT NULL DEFAULT CURRENT_DATE,
    noi_dung TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nhat_ky_ktv_date ON public.soct_nhat_ky_ktv(ktv_id, ngay);

-- 4. Bảng chốt trạng thái báo cáo ngày của KTV
CREATE TABLE IF NOT EXISTS public.soct_trang_thai_bao_cao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ktv_id UUID NOT NULL REFERENCES public.soct_users(id) ON DELETE CASCADE,
    ngay_bao_cao DATE NOT NULL,
    da_nop BOOLEAN NOT NULL DEFAULT FALSE,
    thoi_gian_nop TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT soct_trang_thai_bao_cao_unique UNIQUE (ktv_id, ngay_bao_cao)
);
CREATE INDEX IF NOT EXISTS idx_tt_bao_cao ON public.soct_trang_thai_bao_cao(ktv_id, ngay_bao_cao);
