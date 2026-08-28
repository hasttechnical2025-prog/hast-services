-- MIGRATION 65: Tên dịch vụ trên hóa đơn theo TỪNG hợp đồng khung (Thuê/CPC gộp).
--
-- Cho phép mỗi hợp đồng khung tự đặt phần CỐ ĐỊNH của tên 2 dòng dịch vụ trên hóa đơn:
--   - ten_dv_thue_may : phần cố định dòng thuê máy (mặc định trống -> "Dịch vụ thuê máy")
--   - ten_dv_dau_doc  : phần cố định dòng đầu đọc thẻ (mặc định trống -> "Dịch vụ đầu đọc thẻ")
-- Hệ thống TỰ ghép phần BIẾN ĐỔI (kỳ: "tháng M/YYYY" hoặc "từ … đến …") vào sau khi đẩy Kanban.
-- KHÔNG gõ tháng vào đây (gõ tay = đóng băng tháng, sai kỳ sau).
--
-- ⚠️ CHẠY SQL. Idempotent.

ALTER TABLE public.soct_thue_cpc_hop_dong_khung
  ADD COLUMN IF NOT EXISTS ten_dv_thue_may TEXT,
  ADD COLUMN IF NOT EXISTS ten_dv_dau_doc  TEXT;
