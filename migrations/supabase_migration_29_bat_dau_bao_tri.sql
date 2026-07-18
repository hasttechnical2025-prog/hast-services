-- MIGRATION 29: Mốc BẮT ĐẦU theo dõi bảo trì của máy (đối xứng với tam_dung_tu_thang).
-- Bối cảnh: máy lắp giữa năm (VD mua T6/2026) đang bị tính "thiếu bảo trì" cho T1-T5 —
-- lúc đó máy còn chưa tồn tại. "Số lần theo HĐ" cũng sai (ghi 12 thay vì 7).
-- Hai mốc bat_dau_tu_thang + tam_dung_tu_thang kẹp lại = khoảng máy còn hiệu lực trong năm.
-- Chạy trong Supabase SQL Editor. Idempotent.

ALTER TABLE public.soct_khach_hang
    -- 'YYYY-MM': bắt đầu theo dõi bảo trì TỪ tháng này (tháng lắp máy).
    -- NULL = coi như đã có máy từ trước (giữ nguyên hành vi cũ cho toàn bộ máy hiện có).
    ADD COLUMN IF NOT EXISTS bat_dau_tu_thang TEXT;
