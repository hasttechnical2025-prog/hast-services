-- MIGRATION 83: Lý do kế toán TRẢ LẠI lệnh xuất (Kanban KD, cột 2 -> cột 1). Additive.
-- Đối xứng soct_cong_viec.ly_do_tra (mig 57). PUT ?kanban=1 ghi cột này mỗi lần bàn giao (xóa về NULL)
-- -> ⚠️ CHẠY SQL TRƯỚC/CÙNG DEPLOY lát 4b, thiếu cột là bàn giao KD lỗi 500.
ALTER TABLE public.soct_lenh_xuat
  ADD COLUMN IF NOT EXISTS ly_do_tra TEXT;
