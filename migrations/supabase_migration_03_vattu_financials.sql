-- MIGRATION 03: Tài chính theo từng dòng vật tư + bỏ tiền ở cấp công việc
-- Chạy trong Supabase SQL Editor. Idempotent (chạy lại không lỗi).

-- 1. Thêm các cột tài chính cho từng dòng vật tư
ALTER TABLE public.soct_chi_tiet_vat_tu
    ADD COLUMN IF NOT EXISTS don_gia   NUMERIC(15, 2) NOT NULL DEFAULT 0,  -- đơn giá 1 đơn vị
    ADD COLUMN IF NOT EXISTS vat       NUMERIC(5, 2)  NOT NULL DEFAULT 0,  -- % VAT (VD 10.00 = 10%)
    ADD COLUMN IF NOT EXISTS thanh_tien NUMERIC(15, 2) NOT NULL DEFAULT 0, -- = don_gia * so_luong (chưa VAT)
    ADD COLUMN IF NOT EXISTS hoa_don   BOOLEAN NOT NULL DEFAULT FALSE;     -- dòng này có xuất hóa đơn không

-- 2. Bỏ tiền ở cấp công việc (chuyển sang tính theo tổng vật tư)
ALTER TABLE public.soct_cong_viec
    DROP COLUMN IF EXISTS so_tien,
    DROP COLUMN IF EXISTS loai_thanh_toan;
