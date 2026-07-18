-- MIGRATION 31: Khách hàng cụm (một khách - nhiều máy) phục vụ gom công nợ.
-- Mỗi dòng soct_khach_hang thực chất là 1 ĐIỂM MÁY. Nhiều điểm máy có thể thuộc
-- cùng một khách hàng thật (khách cụm), VD: Phòng TCCB có nhiều máy ở nhiều phòng.
--
-- Thiết kế AN TOÀN, thuần THÊM MỚI (không viết đè dữ liệu cũ):
--  - Bảng cụm dùng mã khách hàng (dãy số) nhập tay làm khóa.
--  - Điểm máy trỏ về cụm qua cột ma_khach_cum CHO PHÉP TRỐNG.
--  - Máy CHƯA gán cụm -> công nợ vẫn coi mỗi điểm máy là 1 khách (như hiện tại).
--    => chưa gán không bao giờ vỡ, gán tới đâu gom tới đó.
-- Chạy trong Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS public.soct_khach_cum (
    ma_khach_hang  TEXT PRIMARY KEY,          -- dãy số, nhập tay (VD 12345)
    ten_khach_hang TEXT NOT NULL,
    dia_chi        TEXT,
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Điểm máy trỏ về cụm. ON DELETE SET NULL: xóa cụm -> máy tự về "lẻ", không mất máy.
-- ON UPDATE CASCADE: đổi mã cụm thì các máy theo cùng.
ALTER TABLE public.soct_khach_hang
    ADD COLUMN IF NOT EXISTS ma_khach_cum TEXT
        REFERENCES public.soct_khach_cum(ma_khach_hang) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS idx_khach_hang_ma_khach_cum ON public.soct_khach_hang(ma_khach_cum);
