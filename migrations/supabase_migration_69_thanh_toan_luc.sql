-- MIGRATION 69: Mốc NGÀY THU (thanh_toan_luc) cho phiếu 'Đã thanh toán'.
--
-- BÀI TOÁN: Kanban Cột 4 (Đã thanh toán) trước đây lọc theo `ngay_xuat_hd` nằm trong kỳ đang
-- chọn. Thực tế phiếu đẩy KTHC cuối tháng (VD T8) nhưng kế toán soát/thu đầu tháng sau (T9) →
-- HĐ vừa thu bị "rớt" về kỳ T8, không hiện ở kỳ mặc định T9 → kế toán không thấy việc mình vừa làm.
--
-- SỬA: Cột 4 lọc theo NGÀY THU (kỳ đối chiếu = tháng THU). Cần đóng dấu thời điểm chuyển sang
-- 'Đã thanh toán' vào cột này (set ở kanban-hd PUT + hd-thu chuyen; gỡ về null khi rời khỏi paid).
--
-- Lưu giờ VN (đóng dấu bằng now()+7h ở API) để so khớp tháng theo lịch VN.
--
-- ⚠️ CHẠY SQL. Idempotent.

ALTER TABLE public.soct_cong_viec
  ADD COLUMN IF NOT EXISTS thanh_toan_luc timestamptz;

-- BACKFILL cho phiếu ĐÃ 'Đã thanh toán' mà chưa có mốc:
--   ưu tiên ngày ghi thu thật (soct_hd_thu.updated_at + 7h = giờ VN) → ngay_xuat_hd → ngay.
-- Nhờ vậy các HĐ vừa import thu (updated_at tháng này) hiện đúng kỳ thu, backlog cũ giữ theo ngày xuất.
UPDATE public.soct_cong_viec cv
SET thanh_toan_luc = COALESCE(
      (SELECT ht.updated_at + interval '7 hours'
         FROM public.soct_hd_thu ht
        WHERE ht.so_hoa_don = cv.so_hoa_don
        LIMIT 1),
      (cv.ngay_xuat_hd::timestamptz),
      (cv.ngay::timestamptz)
    )
WHERE cv.trang_thai_hd = 'Đã thanh toán'
  AND cv.thanh_toan_luc IS NULL;

-- Tra cứu nhanh theo mốc thu (lọc Cột 4 theo tháng).
CREATE INDEX IF NOT EXISTS idx_soct_cv_thanh_toan_luc
  ON public.soct_cong_viec (thanh_toan_luc);
