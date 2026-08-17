-- MIGRATION 47: Theo dõi số tiền đã thu theo SỐ HÓA ĐƠN (công nợ phải thu)
-- Kế toán thu theo hóa đơn; lưu 1 con số lũy kế cho mỗi số HĐ. So với tổng SAU VAT của hóa đơn:
--  đã thu < tổng -> còn nợ (thẻ ở Chờ thanh toán); = tổng -> chuyển Đã thanh toán; > tổng -> trả dư.
-- Idempotent. Chạy trong Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.soct_hd_thu (
  so_hoa_don     TEXT PRIMARY KEY,
  so_tien_da_thu NUMERIC(15, 2) NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.soct_hd_thu ENABLE ROW LEVEL SECURITY;
