-- MIGRATION 41: Tên hàng hóa riêng khi xuất hóa đơn
-- Cùng 1 mã hàng nhưng một số khách đặc biệt cần tên hiển thị khác trên hóa đơn.
-- Hai cấp ghi đè, ưu tiên từ trên xuống:
--   (1) ten_hang_hd  : ghi đè cho RIÊNG một dòng phiếu (ca lẻ ~5-10%).
--   (2) soct_ten_hang_rieng : tên MẶC ĐỊNH theo (khách + mã hàng), tự áp mọi phiếu của khách.
--   (3) soct_kho_hang.ten_hang : tên mặc định gốc ở kho.
--   (4) ma_hang : phòng khi trống.
-- Idempotent. Chạy trong Supabase SQL Editor.

-- (1) Ghi đè theo từng dòng vật tư
ALTER TABLE public.soct_chi_tiet_vat_tu
    ADD COLUMN IF NOT EXISTS ten_hang_hd TEXT;

-- (2) Tên mặc định theo khách. scope_key = 'cum:<ma_khach_cum>' hoặc 'may:<id_khach_hang>'
--     (khớp đúng cách gom nhóm khách ở Công nợ / Kanban).
CREATE TABLE IF NOT EXISTS public.soct_ten_hang_rieng (
    scope_key  TEXT NOT NULL,
    ma_hang    TEXT NOT NULL,
    ten_hang   TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (scope_key, ma_hang)
);
ALTER TABLE public.soct_ten_hang_rieng ENABLE ROW LEVEL SECURITY;
