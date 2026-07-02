-- MIGRATION 05: Danh mục dropdown tùy chỉnh + cấu hình hệ thống
-- Chạy trong Supabase SQL Editor. Idempotent.

-- 1. Danh mục dropdown (admin tự thêm/sửa/ẩn)
CREATE TABLE IF NOT EXISTS public.soct_danh_muc (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nhom TEXT NOT NULL,          -- loai_cong_viec | loai_hd | ktv_giam_dinh | tinh_trang_may
    gia_tri TEXT NOT NULL,
    thu_tu INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uniq_danh_muc UNIQUE (nhom, gia_tri)
);
CREATE INDEX IF NOT EXISTS idx_danh_muc_nhom ON public.soct_danh_muc(nhom);

-- Seed mặc định: Loại công việc
INSERT INTO public.soct_danh_muc (nhom, gia_tri, thu_tu) VALUES
    ('loai_cong_viec', 'Lắp máy', 1),
    ('loai_cong_viec', 'Sửa máy', 2),
    ('loai_cong_viec', 'Giao mực', 3),
    ('loai_cong_viec', 'Thay vật tư', 4),
    ('loai_cong_viec', 'Bảo trì', 5),
    ('loai_cong_viec', 'Bảo hành', 6),
    ('loai_cong_viec', 'Hỗ trợ thầu', 7),
    ('loai_cong_viec', 'Hỗ trợ đại lý', 8),
    ('loai_cong_viec', 'Khiếu nại', 9),
    ('loai_cong_viec', 'Kiểm tra', 10),
    ('loai_cong_viec', 'Khác', 11)
ON CONFLICT (nhom, gia_tri) DO NOTHING;

-- Seed mặc định: Loại hợp đồng (kèm Máy thuê, Máy CPC)
INSERT INTO public.soct_danh_muc (nhom, gia_tri, thu_tu) VALUES
    ('loai_hd', 'HĐBT', 1),
    ('loai_hd', 'MF', 2),
    ('loai_hd', 'Máy thuê', 3),
    ('loai_hd', 'Máy CPC', 4)
ON CONFLICT (nhom, gia_tri) DO NOTHING;

-- (ktv_giam_dinh và tinh_trang_may để trống, admin tự thêm dần)

-- 2. Cấu hình hệ thống (key-value)
CREATE TABLE IF NOT EXISTS public.soct_cau_hinh (
    khoa TEXT PRIMARY KEY,
    gia_tri TEXT
);
INSERT INTO public.soct_cau_hinh (khoa, gia_tri) VALUES
    ('hdbt_canh_bao_thang', '2')   -- cảnh báo HĐBT sắp hết hạn trước N tháng
ON CONFLICT (khoa) DO NOTHING;
