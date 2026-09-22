-- MIGRATION 77: Mốc thời gian office BÀN GIAO kế toán (Kanban cột 1 -> cột 2).
-- Cột 3 (Đã lên hóa đơn) đã có ngay_xuat_hd; cột 4 (Đã thanh toán) đã có thanh_toan_luc.
-- Chỉ thiếu mốc vào cột 2 -> thêm ban_giao_kt_luc để hiển thị timeline chuyển cột trên thẻ.
--
-- Quy tắc (xử lý ở route kanban-hd):
--  - Đóng dấu LẦN ĐẦU khi phiếu vào 'Đang xử lý HĐ' (chỉ set khi đang NULL -> không ghi đè khi kéo tới lui 2<->3).
--  - Xóa (NULL) khi trả HẲN về cột 1 ('Chờ xuất HĐ' / 'Chưa hóa đơn') để lần bàn giao sau có mốc mới.
--  - KHÔNG backfill: thẻ cũ đã ở cột 2/3/4 sẽ hiện "—" (quá khứ không lưu).

ALTER TABLE public.soct_cong_viec
  ADD COLUMN IF NOT EXISTS ban_giao_kt_luc TIMESTAMPTZ;
