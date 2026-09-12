-- Migration 73: Bổ sung trạng thái ngưng sử dụng và mã thay thế cho vật tư kho hàng
-- ngung_su_dung: boolean, mặc định false. Khi true và tồn kho = 0 thì ẩn khỏi danh sách gợi ý.
-- ma_thay_the: mã vật tư mới thay thế mã cũ (nếu có).

ALTER TABLE public.soct_kho_hang
ADD COLUMN IF NOT EXISTS ngung_su_dung BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ma_thay_the TEXT;
