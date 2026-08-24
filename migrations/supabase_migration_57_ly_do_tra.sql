-- MIGRATION 57: Kế toán TRẢ LẠI phiếu (Kanban Cột 2 -> Cột 1) kèm LÝ DO để tech_admin/staff sửa.
--
-- `ly_do_tra` TEXT: lý do kthc trả phiếu về "Chờ lên hóa đơn" (thiếu/sai thông tin lên HĐ).
-- Hiện badge ở thẻ Cột 1; TỰ XÓA khi tech_admin bàn giao lại (Cột 1 -> Cột 2).
--
-- ⚠️ CHẠY SQL TRƯỚC KHI DEPLOY (GET kanban-hd select ly_do_tra -> 500 nếu thiếu). Idempotent.

ALTER TABLE public.soct_cong_viec ADD COLUMN IF NOT EXISTS ly_do_tra TEXT;
