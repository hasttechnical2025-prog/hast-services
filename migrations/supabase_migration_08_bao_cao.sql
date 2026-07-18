-- MIGRATION 08: Chuẩn bị dữ liệu cho Báo cáo tháng
-- Chạy trong Supabase SQL Editor. Idempotent.

-- 1. Thêm "Số lượng" vào phiếu giao việc
--    (VD: 1 phiếu Lắp máy nhưng lắp 2 máy -> số vụ việc = 1, số lượng = 2)
ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS so_luong INT NOT NULL DEFAULT 1;

-- 2. Thêm "Hãng" cho máy của khách hàng (Konica / Fuji / Khác) -> dùng cho Mục 2 báo cáo
ALTER TABLE public.soct_khach_hang
    ADD COLUMN IF NOT EXISTS hang TEXT;

-- 3. Seed danh mục nhóm 'hang'
INSERT INTO public.soct_danh_muc (nhom, gia_tri, thu_tu) VALUES
    ('hang', 'Konica', 1),
    ('hang', 'Fuji', 2),
    ('hang', 'Khác', 3)
ON CONFLICT (nhom, gia_tri) DO NOTHING;

-- Cột mới kế thừa RLS đã bật ở migration 07 (không cần policy mới).
