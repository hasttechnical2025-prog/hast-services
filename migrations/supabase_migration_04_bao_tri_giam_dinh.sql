-- MIGRATION 04: Module Bảo trì & Giám định + hợp đồng bảo trì trên khách hàng
-- Chạy trong Supabase SQL Editor. Idempotent.

-- 1. Hợp đồng bảo trì gắn với khách hàng
ALTER TABLE public.soct_khach_hang
    ADD COLUMN IF NOT EXISTS loai_hd TEXT,             -- VD: MF, HĐBT
    ADD COLUMN IF NOT EXISTS ngay_het_han_hdbt DATE;   -- ngày hết hạn hợp đồng bảo trì

-- 2. Bảo trì theo tháng (mỗi máy tối đa 1 lần/tháng)
CREATE TABLE IF NOT EXISTS public.soct_bao_tri (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ma_may TEXT NOT NULL,
    thang_nam TEXT NOT NULL,                            -- YYYY-MM
    ngay DATE,
    ktv_id UUID REFERENCES public.soct_users(id) ON DELETE SET NULL,
    ghi_chu TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uniq_bao_tri_may_thang UNIQUE (ma_may, thang_nam)
);
CREATE INDEX IF NOT EXISTS idx_bao_tri_thang ON public.soct_bao_tri(thang_nam);
CREATE INDEX IF NOT EXISTS idx_bao_tri_ma_may ON public.soct_bao_tri(ma_may);

-- 3. Giám định: biên bản
CREATE TABLE IF NOT EXISTS public.soct_giam_dinh (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ma_may TEXT,
    id_khach_hang UUID REFERENCES public.soct_khach_hang(id) ON DELETE SET NULL,
    ngay_giam_dinh DATE,
    ktv_giam_dinh TEXT,
    vi_tri TEXT,
    so_dem BIGINT,
    tinh_trang_may TEXT,
    da_bao_gia BOOLEAN NOT NULL DEFAULT FALSE,
    da_thay BOOLEAN NOT NULL DEFAULT FALSE,
    ngay_thay DATE,
    so_report TEXT,
    ghi_chu TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_giam_dinh_ma_may ON public.soct_giam_dinh(ma_may);
CREATE INDEX IF NOT EXISTS idx_giam_dinh_da_thay ON public.soct_giam_dinh(da_thay);

-- 4. Giám định: vật tư đề xuất thay (bắt buộc liên kết Kho)
CREATE TABLE IF NOT EXISTS public.soct_giam_dinh_vat_tu (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_giam_dinh UUID NOT NULL REFERENCES public.soct_giam_dinh(id) ON DELETE CASCADE,
    ma_hang TEXT NOT NULL REFERENCES public.soct_kho_hang(ma_hang) ON DELETE CASCADE,
    so_luong INT NOT NULL DEFAULT 1,
    ghi_chu TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gd_vat_tu_gd ON public.soct_giam_dinh_vat_tu(id_giam_dinh);
