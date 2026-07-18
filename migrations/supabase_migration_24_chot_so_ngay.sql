-- MIGRATION 24: Cấu trúc hóa "ngày chốt số" của máy thuê/CPC để nhắc lấy counter tự động.
-- Thêm chot_so_ngay (1-31) + chot_so_cuoi_thang. Backfill từ ngay_chot_so (text) cũ. Idempotent.

ALTER TABLE public.soct_khach_hang
    ADD COLUMN IF NOT EXISTS chot_so_ngay SMALLINT,
    ADD COLUMN IF NOT EXISTS chot_so_cuoi_thang BOOLEAN NOT NULL DEFAULT false;

-- Backfill: text có chữ "cuối" -> cờ cuối tháng
UPDATE public.soct_khach_hang
SET chot_so_cuoi_thang = true
WHERE chot_so_cuoi_thang = false
  AND ngay_chot_so IS NOT NULL
  AND (lower(ngay_chot_so) LIKE '%cuối%' OR lower(ngay_chot_so) LIKE '%cuoi%');

-- Backfill: lấy số trong text -> chot_so_ngay (kẹp 1..31)
UPDATE public.soct_khach_hang
SET chot_so_ngay = LEAST(GREATEST(regexp_replace(ngay_chot_so, '\D', '', 'g')::int, 1), 31)
WHERE chot_so_ngay IS NULL
  AND chot_so_cuoi_thang = false
  AND ngay_chot_so IS NOT NULL
  AND regexp_replace(ngay_chot_so, '\D', '', 'g') ~ '^\d+$';
