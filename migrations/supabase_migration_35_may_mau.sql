-- MIGRATION 35: Đánh dấu máy thuê/CPC là MÁY MÀU hay ĐEN TRẮNG.
-- Mục đích: ở tab "Nhập counter", máy ĐEN TRẮNG sẽ KHÓA ô nhập counter Màu cho đỡ nhầm,
-- và tô màu phần model để nhìn phát biết liền.
-- NULL = chưa xác định -> code coi như máy màu (không khóa gì) cho an toàn.
-- Chạy trong Supabase SQL Editor. Idempotent.

ALTER TABLE public.soct_khach_hang
    ADD COLUMN IF NOT EXISTS may_mau BOOLEAN;

-- Seed tự động: máy đã cấu hình ĐƠN GIÁ / ĐỊNH MỨC / CAM KẾT phần MÀU -> là máy màu;
-- còn lại (không có gì về màu) -> đen trắng. Admin chỉnh tay các ngoại lệ sau.
UPDATE public.soct_khach_hang
SET may_mau = (
        COALESCE(don_gia_mau, 0) > 0
     OR COALESCE(dinh_muc_mien_phi_mau, 0) > 0
     OR COALESCE(cam_ket_toi_thieu_mau, 0) > 0
    )
WHERE may_mau IS NULL
  AND loai_hd IN ('Máy thuê', 'Máy CPC');
