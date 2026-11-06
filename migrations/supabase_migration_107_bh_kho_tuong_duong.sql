-- MIGRATION 107: DM Hàng bảo hành → Kho hàng bảo hành (mã tương đương + ngưng dùng).
--
-- NSX cải tiến mã khi lỗi hàng loạt → trả về mã MỚI (vd A gửi → A1 trả về). Dùng cơ chế
-- "mã tương đương" GIỐNG kho chính (soct_kho_hang): ma_thay_the = chuỗi mã, nhiều mã cách
-- dấu phẩy, 2 chiều → gộp TỒN theo nhóm tương đương. Tồn KHÔNG lưu cột (tính động từ
-- soct_bh_fbvn: hàng về +1, trả khách −1, theo mã thực nhận). ngung_su_dung = mã cũ đã ngưng.
-- Idempotent. Chạy trong Supabase SQL Editor.

ALTER TABLE public.soct_bh_dmhang
    ADD COLUMN IF NOT EXISTS ma_thay_the   TEXT,                       -- mã tương đương (nhiều mã, cách dấu phẩy)
    ADD COLUMN IF NOT EXISTS ngung_su_dung BOOLEAN NOT NULL DEFAULT false;  -- mã cũ đã ngưng dùng (badge)
