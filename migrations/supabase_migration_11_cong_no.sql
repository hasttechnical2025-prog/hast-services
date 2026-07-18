-- MIGRATION 11: Công nợ / trạng thái hóa đơn cấp phiếu cho luồng Báo giá
-- Chạy trong Supabase SQL Editor. Idempotent.

-- Trạng thái hóa đơn 3 mức ở cấp phiếu:
--   'Chưa hóa đơn' (mặc định) -> 'Đã báo giá' -> 'Đã lên hóa đơn'
ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS trang_thai_hd TEXT NOT NULL DEFAULT 'Chưa hóa đơn';

CREATE INDEX IF NOT EXISTS idx_cong_viec_trang_thai_hd ON public.soct_cong_viec(trang_thai_hd);
