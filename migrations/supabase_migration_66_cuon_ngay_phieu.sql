-- MIGRATION 66: Tự động CUỐN NGÀY phiếu giao việc chưa thực hiện sang ngày làm việc kế tiếp.
--
-- Phiếu KTV (nguon IS NULL) đến ngày mà VẪN chưa làm (Chờ nhận / Đã nhận / Chưa hoàn thành —
-- KHÔNG gồm 'Đang làm' và 'Hoàn thành') thì cron sáng mỗi NGÀY LÀM VIỆC set ngay = hôm nay.
-- Vì cron chỉ chạy vào ngày làm việc (bỏ T7/CN/lễ ở endpoint) nên "về hôm nay" = cuốn tới đúng
-- ngày làm việc kế tiếp, không cần tính tay.
--
-- so_lan_cuon: đếm số lần bị cuốn -> cảnh báo phiếu TỒN ĐỌNG (cuốn nhiều lần = bị bỏ quên).
-- created_at giữ nguyên nên vẫn truy được ngày tạo gốc.
--
-- ⚠️ CHẠY SQL. Idempotent.

ALTER TABLE public.soct_cong_viec
  ADD COLUMN IF NOT EXISTS so_lan_cuon INTEGER NOT NULL DEFAULT 0;

-- Hàm cuốn: set ngay = p_today + tăng so_lan_cuon cho các phiếu đủ điều kiện. Trả về danh sách đã
-- cuốn (để endpoint đếm + lọc phiếu tồn đọng). Endpoint tự lo việc "hôm nay có phải ngày làm việc".
CREATE OR REPLACE FUNCTION public.soct_cuon_ngay_phieu(p_today date)
RETURNS TABLE(id uuid, report text, so_lan_cuon integer, ten_khach text) AS $$
  UPDATE public.soct_cong_viec cv
  SET ngay = p_today,
      so_lan_cuon = COALESCE(cv.so_lan_cuon, 0) + 1
  WHERE cv.ngay < p_today
    AND cv.nguon IS NULL
    AND (cv.ket_qua IS NULL OR cv.ket_qua IN ('Đã nhận', 'Chưa hoàn thành'))
  RETURNING cv.id, cv.report, cv.so_lan_cuon,
    (SELECT kh.ten_khach_hang FROM public.soct_khach_hang kh WHERE kh.id = cv.id_khach_hang);
$$ LANGUAGE sql;
