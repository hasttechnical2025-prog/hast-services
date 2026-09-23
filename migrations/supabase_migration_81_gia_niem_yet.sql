-- MIGRATION 81: Giá niêm yết vật tư (tab Kho hàng › Giá niêm yết — chỉ tra cứu, admin nhập).
-- 3 mức giá/mã (nullable, chỉ điền cho vật tư cần). Additive, KHÔNG đụng tồn kho reactive (mig 62).
-- Hiển thị theo role: niêm yết (mọi role mở tab), giá nhân viên (staff+tech_admin+admin),
-- giá quản lý (tech_admin+admin). Non-admin chỉ thấy mã CÓ giá (≥1 cột giá role được xem khác NULL).
ALTER TABLE public.soct_kho_hang
  ADD COLUMN IF NOT EXISTS gia_niem_yet  NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS gia_nhan_vien NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS gia_quan_ly   NUMERIC(15,2);
