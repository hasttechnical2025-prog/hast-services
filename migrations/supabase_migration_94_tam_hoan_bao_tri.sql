-- MIGRATION 94: Mốc KẾT THÚC tạm hoãn bảo trì (đối xứng với tam_dung_tu_thang).
-- Bối cảnh: khách chuyển địa điểm / tạm nghỉ 1-2 tháng -> cần treo CẢ NHÓM máy ngừng
-- theo dõi bảo trì TRONG MỘT KHOẢNG, hết khoảng tự theo dõi lại (không phải vào gỡ tay).
-- tam_dung_tu_thang + tam_dung_den_thang = khoảng [từ, đến] máy tạm ngừng theo dõi.
--   tam_dung_den_thang NULL  = dừng VÔ HẠN (giữ nguyên hành vi cũ — khách đã bỏ máy).
--   tam_dung_den_thang 'YYYY-MM' = tháng CUỐI còn tạm dừng; tháng den+1 trở đi theo dõi lại.
-- Chạy trong Supabase SQL Editor. Idempotent.

ALTER TABLE public.soct_khach_hang
    ADD COLUMN IF NOT EXISTS tam_dung_den_thang TEXT;
