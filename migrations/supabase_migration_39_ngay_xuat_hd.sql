-- MIGRATION 39: Bổ sung ngày xuất hóa đơn
-- Lưu trữ ngày kế toán thực tế xuất hóa đơn để tính toán tuổi nợ đọng trên Kanban.
-- Chạy trong Supabase SQL Editor. Idempotent.

ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS ngay_xuat_hd DATE;
