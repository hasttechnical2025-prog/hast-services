-- Migration 97: Khóa phiếu Cột 1 Kanban ("tôi đang làm dở, đừng động").
-- Office dùng chung Cột 1 (Chờ xuất HĐ); thêm cơ chế khóa thủ công để tránh người khác
-- kéo/bàn giao/thu hồi/sửa nhầm phiếu người khác đang soạn dở. Chỉ áp cho Cột 1.
--   khoa_boi : ai đang khóa (NULL = chưa khóa). Khi phiếu rời Cột 1 -> tự xóa (ở API PUT).
--   khoa_luc : thời điểm khóa (giờ VN) — chỉ để tham khảo, KHÔNG tự mở (khóa thủ công hoàn toàn).
ALTER TABLE soct_cong_viec
  ADD COLUMN IF NOT EXISTS khoa_boi uuid REFERENCES soct_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS khoa_luc timestamptz;

COMMENT ON COLUMN soct_cong_viec.khoa_boi IS 'Kanban Cột 1: user đang khóa phiếu (NULL=chưa khóa). Chủ phiếu/admin mới mở được.';
COMMENT ON COLUMN soct_cong_viec.khoa_luc IS 'Kanban Cột 1: thời điểm khóa (giờ VN). Khóa thủ công, không tự mở.';
