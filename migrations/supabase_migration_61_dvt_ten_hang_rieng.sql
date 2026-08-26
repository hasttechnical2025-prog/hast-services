-- MIGRATION 61: Đơn vị tính (ĐVT) trong mẫu tên/giá riêng theo khách.
--
-- `soct_chi_tiet_vat_tu.don_vi_tinh` đã có (mig 55) — ĐVT thực ghi trên hóa đơn (M-invoice dùng,
-- mặc định "Cái" khi trống). Migration này thêm ĐVT vào MẪU theo khách để "Áp mẫu khách" /
-- Nhập Excel tự điền ĐVT, khỏi sửa lặp mỗi kỳ.
--
-- ⚠️ CHẠY SQL TRƯỚC KHI DEPLOY. Idempotent.

ALTER TABLE public.soct_ten_hang_rieng ADD COLUMN IF NOT EXISTS don_vi_tinh TEXT;
