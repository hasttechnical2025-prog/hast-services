-- MIGRATION 50: Đánh dấu phiếu XUẤT MIỄN PHÍ (MF) — chủ yếu cho vật tư máy thuê/CPC.
--
-- Phần lớn vật tư máy thuê/CPC xuất miễn phí (hóa đơn 0đ); số ít có tính phí. Kế toán cần
-- nhận biết ngay trên Kanban. `mien_phi = true` -> phiếu MF (badge xanh); false -> có phí.
-- Mặc định false; form Giao việc tự đặt true khi máy là Thuê/CPC (người dùng đổi được).
-- KHÔNG backfill phiếu cũ (theo yêu cầu — người dùng tự rà tay).
--
-- Idempotent. Chạy trong Supabase SQL Editor.

ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS mien_phi BOOLEAN NOT NULL DEFAULT false;
