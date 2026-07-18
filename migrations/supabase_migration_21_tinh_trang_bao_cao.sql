-- MIGRATION 21: Danh mục "Tình trạng báo cáo KTV" cho dropdown ở báo cáo ngày của KTV.
-- Admin cấu hình thêm/sửa/ẩn trong Hệ thống > Danh mục. Idempotent.

INSERT INTO public.soct_danh_muc (nhom, gia_tri, thu_tu) VALUES
    ('tinh_trang_bao_cao', 'HĐBT', 1),
    ('tinh_trang_bao_cao', 'Làm giám định', 2),
    ('tinh_trang_bao_cao', 'Theo dõi thêm', 3),
    ('tinh_trang_bao_cao', 'Khác', 4)
ON CONFLICT (nhom, gia_tri) DO NOTHING;
