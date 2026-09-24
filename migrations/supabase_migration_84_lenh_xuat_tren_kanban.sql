-- MIGRATION 84: Giai đoạn NHÁP + người bàn giao cho Lệnh xuất hàng. Additive.
-- tren_kanban=false => lệnh còn NHÁP (chỉ ở Danh sách, sửa/xóa được, KHÔNG hiện trên Kanban).
-- Kinh doanh "Đẩy lên Kanban" -> true (khóa sửa/xóa, hiện trên Kanban KD + bàn /admin).
-- sale_admin "Thu hồi" -> false (mở khóa cho kinh doanh sửa). nguoi_ban_giao_id: đóng dấu ai bàn giao KT.
-- ⚠️ CHẠY SQL TRƯỚC/CÙNG DEPLOY: server sẽ lọc Kanban theo tren_kanban + khóa sửa theo cột này.
-- Lệnh CŨ (trước migration) mặc định false -> sẽ rơi về NHÁP; backfill = true để giữ nguyên hiện trạng
-- (đang nằm trên Kanban), tránh biến mất khỏi bàn kế toán.
ALTER TABLE public.soct_lenh_xuat
  ADD COLUMN IF NOT EXISTS tren_kanban BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nguoi_ban_giao_id UUID REFERENCES public.soct_users(id) ON DELETE SET NULL;

-- Backfill: mọi lệnh đã tồn tại coi như ĐÃ đẩy Kanban (giữ nguyên hiện trạng bàn kế toán).
UPDATE public.soct_lenh_xuat SET tren_kanban = true WHERE tren_kanban = false;

CREATE INDEX IF NOT EXISTS idx_lenh_xuat_tren_kanban ON public.soct_lenh_xuat(tren_kanban);
