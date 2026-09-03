-- MIGRATION 67: Sửa hàm cuốn ngày — phiếu 'Chờ nhận' có ket_qua = 'Chờ nhận' (KHÔNG phải NULL),
-- migration 66 chỉ nhận NULL/'Đã nhận'/'Chưa hoàn thành' nên BỎ SÓT phiếu 'Chờ nhận' -> không cuốn.
--
-- Sửa: cuốn MỌI phiếu chưa xong TRỪ 'Đang làm' và 'Hoàn thành' (robust cho cả status tương lai).
-- Tức cuốn: 'Chờ nhận' + 'Đã nhận' + 'Chưa hoàn thành' (+ NULL nếu có dữ liệu cũ).
--
-- ⚠️ CHẠY SQL. Idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.soct_cuon_ngay_phieu(p_today date)
RETURNS TABLE(id uuid, report text, so_lan_cuon integer, ten_khach text) AS $$
  UPDATE public.soct_cong_viec cv
  SET ngay = p_today,
      so_lan_cuon = COALESCE(cv.so_lan_cuon, 0) + 1
  WHERE cv.ngay < p_today
    AND cv.nguon IS NULL
    AND (cv.ket_qua IS NULL OR cv.ket_qua NOT IN ('Đang làm', 'Hoàn thành'))
  RETURNING cv.id, cv.report, cv.so_lan_cuon,
    (SELECT kh.ten_khach_hang FROM public.soct_khach_hang kh WHERE kh.id = cv.id_khach_hang);
$$ LANGUAGE sql;
