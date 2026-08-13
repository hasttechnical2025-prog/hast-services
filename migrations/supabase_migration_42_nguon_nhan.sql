-- MIGRATION 42: Nguồn nhận việc — phân biệt phiếu GIAO TRỰC TIẾP vs KTV TỰ NHẬN
-- 'giao'    : tech_admin/staff/admin gán KTV (tạo có KTV, hoặc sửa gán KTV, hoặc KTV kèm lên chính)
-- 'tu_nhan' : KTV tự bấm nhận từ pool trên app
-- NULL      : chưa có KTV (Chờ nhận)
-- Idempotent. Chạy trong Supabase SQL Editor.

ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS nguon_nhan TEXT;
