-- MIGRATION 46: Lưu NGƯỜI LẬP HÓA ĐƠN (để hiển thị trên thẻ Kanban + đối chiếu trách nhiệm)
-- Ghi khi kế toán "Hoàn tất xuất hóa đơn" (chuyển sang 'Đã lên hóa đơn').
-- Idempotent. Chạy trong Supabase SQL Editor.

ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS nguoi_xuat_hd UUID REFERENCES public.soct_users(id) ON DELETE SET NULL;
