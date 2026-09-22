-- MIGRATION 79: Số hợp đồng cho Lệnh xuất hàng (in lên lệnh + tra cứu). Additive.
-- Chạy TRƯỚC khi deploy (POST/PUT sẽ ghi cột này). GET dùng select('*') nên an toàn với code cũ.
ALTER TABLE public.soct_lenh_xuat
  ADD COLUMN IF NOT EXISTS so_hop_dong TEXT;
CREATE INDEX IF NOT EXISTS idx_lenh_xuat_sohd_ct ON public.soct_lenh_xuat(so_hop_dong);
