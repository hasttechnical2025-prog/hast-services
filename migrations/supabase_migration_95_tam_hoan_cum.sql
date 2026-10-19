-- MIGRATION 95: Tách lớp TẠM HOÃN CỤM khỏi tạm hoãn lẻ (mô hình 2 lớp OR).
-- Trước đây cả "khách bỏ 1 máy" (lẻ) và "cả cụm nghỉ tạm" đều ghi chung vào
-- tam_dung_tu_thang/den -> gỡ tạm hoãn cụm xóa luôn tạm hoãn lẻ. Nay tách riêng:
--   Lớp 1 (lẻ, neo điểm máy):  tam_dung_tu_thang / tam_dung_den_thang  (giữ nguyên, form Khách hàng)
--   Lớp 2 (cụm, neo nhóm HĐBT): tam_hoan_cum_tu_thang / tam_hoan_cum_den_thang  (MỚI, ghi cho mọi máy nhóm)
-- "Nghỉ bảo trì" = lớp 1 HOẶC lớp 2 đang hiệu lực. Gỡ lớp nào chỉ xóa cột lớp đó.
-- Chạy trong Supabase SQL Editor. Idempotent.

ALTER TABLE public.soct_khach_hang
    ADD COLUMN IF NOT EXISTS tam_hoan_cum_tu_thang TEXT,
    ADD COLUMN IF NOT EXISTS tam_hoan_cum_den_thang TEXT;
