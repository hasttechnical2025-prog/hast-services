-- MIGRATION 58: Đếm số lần xuất ĐNTT (cho badge "đã xuất DD-M (N)" trên thẻ Kanban).
--
-- `dntt_lan` INT: số lần đã xuất Đề nghị thanh toán cho hóa đơn (tăng mỗi lần xuất).
-- Lưu trên MỌI phiếu cùng số HĐ (cùng giá trị). Badge hiện ngày xuất gần nhất (dntt_luc) + (dntt_lan).
--
-- ⚠️ CHẠY SQL TRƯỚC KHI DEPLOY (GET kanban-hd select dntt_lan -> 500 nếu thiếu). Idempotent.

ALTER TABLE public.soct_cong_viec ADD COLUMN IF NOT EXISTS dntt_lan INT NOT NULL DEFAULT 0;
