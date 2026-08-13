-- MIGRATION 44: Đối soát công nợ lịch sử — phiếu TRƯỚC 01/08/2026 coi như đã thanh toán
-- Sau backfill (mig 43), nhiều phiếu 'Đã lên hóa đơn' lịch sử tràn lên cột "Chờ thanh toán".
-- Quyết định vận hành: phiếu có NGÀY PHIẾU (ngay) trước 01/08/2026 coi như đã lên hóa đơn +
-- đã thu tiền xong -> chuyển 'Đã thanh toán' để làm sạch cột Chờ thanh toán.
-- Chạy trong Supabase SQL Editor. An toàn chạy lại (chỉ đụng dòng đang 'Đã lên hóa đơn').

UPDATE public.soct_cong_viec
SET trang_thai_hd = 'Đã thanh toán'
WHERE trang_thai_hd = 'Đã lên hóa đơn'
  AND ngay < '2026-08-01';

-- ── CỬA ĐỐI SOÁT LẠI TOÀN BỘ (chạy khi cần rà soát công nợ cũ) ───────────────────
-- Kéo tất cả phiếu trước 01/08/2026 trở lại "Chờ thanh toán":
-- UPDATE public.soct_cong_viec
-- SET trang_thai_hd = 'Đã lên hóa đơn'
-- WHERE trang_thai_hd = 'Đã thanh toán'
--   AND ngay < '2026-08-01';
