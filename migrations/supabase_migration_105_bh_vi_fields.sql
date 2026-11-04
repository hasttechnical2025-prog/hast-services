-- MIGRATION 105: Bảo hành FBVN — thêm 2 trường mô tả TIẾNG VIỆT cho BB Bàn giao.
--
-- 1 ca sinh 2 văn bản khác ngôn ngữ: Form A (English) dùng contents/possible_cause (Anh);
-- BB Bàn giao (Tiếng Việt) dùng tinh_trang_vi/nguyen_nhan_vi. "Hàng hóa" (BB) dùng CHUNG
-- ten_claim (Name of Goods). Các mã/ngày/serial/model dùng chung không cần dịch.
-- Idempotent. Chạy trong Supabase SQL Editor.

ALTER TABLE public.soct_bh_fbvn
    ADD COLUMN IF NOT EXISTS tinh_trang_vi  TEXT,   -- Tình trạng (BB, tiếng Việt)
    ADD COLUMN IF NOT EXISTS nguyen_nhan_vi TEXT;   -- Nguyên nhân (BB, tiếng Việt)
