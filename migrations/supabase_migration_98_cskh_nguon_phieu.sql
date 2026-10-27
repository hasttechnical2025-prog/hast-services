-- Migration 98: CSKH nhận thêm nguồn "phiếu giao việc đã Hoàn thành" (nguồn sống).
-- Trước đây soct_cskh_lichsu chỉ chứa dữ liệu IMPORT từ phần mềm khác (Book1). Nay mỗi phiếu
-- giao việc Hoàn thành (Sửa chữa/Thay vật tư/Giao mực/Lắp đặt, không miễn phí) cũng đổ vào đây.
--   nguon        : 'import' (mồi quá khứ) | 'phieu' (app tự nuôi). Dòng cũ mặc định 'import'.
--   id_cong_viec : phiếu nguồn (nếu nguon='phieu') — để đồng bộ idempotent, xóa phiếu thì gỡ liên kết.
ALTER TABLE soct_cskh_lichsu
  ADD COLUMN IF NOT EXISTS nguon text NOT NULL DEFAULT 'import',
  ADD COLUMN IF NOT EXISTS id_cong_viec uuid REFERENCES soct_cong_viec(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cskh_lichsu_nguon ON soct_cskh_lichsu(nguon);
CREATE INDEX IF NOT EXISTS idx_cskh_lichsu_cv ON soct_cskh_lichsu(id_cong_viec);

COMMENT ON COLUMN soct_cskh_lichsu.nguon IS 'Nguồn lịch sử: import (phần mềm khác) | phieu (phiếu giao việc app).';
COMMENT ON COLUMN soct_cskh_lichsu.id_cong_viec IS 'Phiếu giao việc nguồn (khi nguon=phieu) — phục vụ đồng bộ idempotent.';
