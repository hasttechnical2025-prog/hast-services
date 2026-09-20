-- Migration 75: Lưu Ý ĐỊNH gom/tách khi đẩy phiếu sang Kế toán (Kanban cột 1 -> cột 2).
-- Office bỏ tick "Tự động gom nhóm" để ĐẨY LẺ -> ý định này phải đi theo phiếu tới kthc,
-- không còn phụ thuộc cờ hiển thị per-viewer. tach_rieng = true -> cột 2 hiện phiếu RIÊNG (xuất HĐ riêng);
-- false (mặc định) -> gom theo cụm khách như cũ.

ALTER TABLE soct_cong_viec ADD COLUMN IF NOT EXISTS tach_rieng BOOLEAN NOT NULL DEFAULT false;
