-- MIGRATION 25: Thêm cột "NV Kinh doanh" cho máy thuê/CPC (soct_khach_hang).
-- Giá trị chọn từ danh mục nhóm 'nv_kinh_doanh' (admin tạo trong Hệ thống > Danh mục).
-- Nullable, không phá luồng hiện tại. Idempotent.

ALTER TABLE public.soct_khach_hang ADD COLUMN IF NOT EXISTS nv_kinh_doanh TEXT;
