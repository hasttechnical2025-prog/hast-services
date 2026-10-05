-- MIGRATION 90: Dung lượng HỘP THEO MÁY (factory) cho mực/vật tư máy thuê.
-- Hộp mực lắp sẵn lúc lắp máy (factory) thường có dung lượng NHỎ HƠN hộp thay
-- (vd máy Fuji ~9.000 trang so với hộp thay ~24.000). Để trống (NULL) = dùng như
-- `dinh_luong` -> công thức cảnh báo rút gọn về cũ, không ảnh hưởng máy khác.
-- Engine cảnh báo: hộp 1 = dinh_luong_dau, các hộp sau = dinh_luong.
-- Additive/an toàn.

ALTER TABLE public.soct_muc_may_thue
  ADD COLUMN IF NOT EXISTS dinh_luong_dau NUMERIC;  -- dung lượng hộp theo máy (factory); NULL = dùng như dinh_luong
