-- MIGRATION 45: Giá riêng theo khách (mở rộng bảng tên riêng thành "tên + giá mẫu")
-- soct_ten_hang_rieng giờ lưu MẪU (template) theo khách: tên và/hoặc đơn giá cho từng mã hàng.
-- Áp vào phiếu bằng NÚT (không tự điền ngầm) -> tech_admin buộc rà soát trước khi đẩy kế toán.
-- Idempotent. Chạy trong Supabase SQL Editor.

ALTER TABLE public.soct_ten_hang_rieng
    ADD COLUMN IF NOT EXISTS don_gia NUMERIC(15, 2);

-- Cho phép chỉ lưu GIÁ (không kèm tên) hoặc chỉ tên.
ALTER TABLE public.soct_ten_hang_rieng
    ALTER COLUMN ten_hang DROP NOT NULL;
