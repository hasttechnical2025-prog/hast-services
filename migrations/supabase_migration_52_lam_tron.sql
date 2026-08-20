-- MIGRATION 52: Khoản làm tròn tổng sau thuế (chênh lệch làm tròn hóa đơn)
--
-- VAT 8% làm tròn theo dòng khiến tổng sau thuế lệch ±1đ so với số TRÒN trên hóa đơn thật
-- (VD 6.190.000,56 -> tự làm tròn 6.190.001, nhưng hợp đồng/hóa đơn ghi 6.190.000).
-- `lam_tron` (đồng, CHO PHÉP ÂM) cộng thẳng vào tổng sau thuế của phiếu:
--   - Hiển thị khớp hóa đơn thật.
--   - Công nợ dùng đúng số tròn -> khách trả đủ là tất toán, không kẹt "còn nợ 1đ" mãi.
-- Lưu trên 1 phiếu ĐẠI DIỆN của nhóm hóa đơn (các phiếu khác = 0) nên tổng theo số HĐ = Σ lam_tron.
--
-- Idempotent. Chạy trong Supabase SQL Editor.

ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS lam_tron INTEGER NOT NULL DEFAULT 0;
