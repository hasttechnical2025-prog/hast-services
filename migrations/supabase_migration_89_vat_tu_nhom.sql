-- MIGRATION 89: Mở rộng cảnh báo vật tư tiêu hao máy thuê (thêm nhóm TRỐNG, ngoài MỰC).
-- Additive/an toàn. Tái dùng engine "sắp hết mực" (modulo counter ÷ định lượng).
-- `nhom`: muc | trong (có thể mở rộng sau). `loai` (counter theo) nay nhận thêm 'tong' (bw+mau)
-- cho trống đen máy màu — chỉ là giá trị chuỗi, KHÔNG cần đổi schema.

ALTER TABLE public.soct_muc_may_thue
  ADD COLUMN IF NOT EXISTS nhom TEXT NOT NULL DEFAULT 'muc';  -- muc | trong
