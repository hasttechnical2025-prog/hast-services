-- MIGRATION 56: "Chưa hoàn thành" — việc làm nhiều buổi (Mô hình B, phiếu tiếp nối có liên kết).
--
-- 1) Đổi trạng thái ket_qua 'Lắp tiếp' -> 'Chưa hoàn thành' (DROP+ADD constraint + chuyển dữ liệu cũ).
-- 2) ngay_hen DATE: ngày hẹn làm tiếp (KTV chọn khi bấm 'Chưa hoàn thành').
-- 3) phieu_goc_id UUID: phiếu TIẾP trỏ về phiếu GỐC (chuỗi làm tiếp).
--
-- ⚠️ CHẠY SQL TRƯỚC KHI DEPLOY. Idempotent. Chạy trong Supabase SQL Editor.

ALTER TABLE public.soct_cong_viec DROP CONSTRAINT IF EXISTS soct_cong_viec_ket_qua_check;

UPDATE public.soct_cong_viec SET ket_qua = 'Chưa hoàn thành' WHERE ket_qua = 'Lắp tiếp';

ALTER TABLE public.soct_cong_viec
    ADD CONSTRAINT soct_cong_viec_ket_qua_check
    CHECK (ket_qua IN ('Chờ nhận', 'Đã nhận', 'Đang làm', 'Hoàn thành', 'Chưa hoàn thành'));

ALTER TABLE public.soct_cong_viec ADD COLUMN IF NOT EXISTS ngay_hen DATE;
ALTER TABLE public.soct_cong_viec ADD COLUMN IF NOT EXISTS phieu_goc_id UUID REFERENCES public.soct_cong_viec(id) ON DELETE SET NULL;
