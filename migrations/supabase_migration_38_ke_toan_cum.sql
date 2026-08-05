-- MIGRATION 38: Thông tin kế toán theo cụm
-- Chuyển mã số thuế và email kế toán về bảng khách cụm để tránh lặp lại dữ liệu
-- cho mỗi điểm máy. Khách hàng lẻ vẫn giữ các cột này.
-- Chạy trong Supabase SQL Editor. Idempotent.

ALTER TABLE public.soct_khach_cum
    ADD COLUMN IF NOT EXISTS ma_so_thue TEXT,
    ADD COLUMN IF NOT EXISTS email_ke_toan TEXT;
