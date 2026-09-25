-- MIGRATION 85: "Lô đẩy Kanban" cho phiếu kỹ thuật (soct_cong_viec).
-- Mỗi lần Công nợ đẩy 1 nhóm phiếu lên Kanban -> đóng dấu CÙNG 1 hd_lo -> Kanban gom theo lô
-- (mỗi lô = 1 thẻ = 1 hóa đơn), không phụ thuộc ô "gom theo khách".
--  - Đẩy 1 phiếu  -> lô riêng -> 1 HĐ.
--  - Đẩy K phiếu 1 lần -> cùng lô -> 1 HĐ cho K.
--  - Đẩy N rồi đẩy M (cùng khách) -> 2 lô -> 2 HĐ.
-- Additive: phiếu cũ hd_lo = NULL -> Kanban giữ hành vi cũ (cột 1 lẻ, cột 2 theo cụm/tach_rieng),
-- KHÔNG cần backfill, KHÔNG bắt thu hồi phiếu đang dở.
ALTER TABLE public.soct_cong_viec
  ADD COLUMN IF NOT EXISTS hd_lo TEXT;
CREATE INDEX IF NOT EXISTS idx_cong_viec_hd_lo ON public.soct_cong_viec(hd_lo);
