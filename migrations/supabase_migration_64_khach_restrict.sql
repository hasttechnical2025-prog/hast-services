-- MIGRATION 64: BẢO VỆ LỊCH SỬ — chặn xóa khách/điểm máy còn phiếu (đổi FK CASCADE -> RESTRICT).
--
-- Trước đây: soct_cong_viec.id_khach_hang -> soct_khach_hang ON DELETE CASCADE.
-- => Xóa 1 điểm máy (hoặc "Xóa toàn bộ" khách khi import) sẽ CASCADE-XÓA TOÀN BỘ phiếu + vật tư
--    (mất sạch lịch sử doanh thu/hóa đơn, không hoàn tác). Cực kỳ nguy hiểm.
--
-- Nay đổi sang ON DELETE RESTRICT: DB TỰ CHẶN xóa điểm máy nếu còn phiếu — an toàn dù xóa bằng
-- đường nào (UI, API, SQL). Điểm máy "nghỉ" thì dùng tam_dung_tu_thang, KHÔNG xóa.
--
-- ⚠️ CHẠY SQL. Idempotent.

DO $$
DECLARE cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'soct_cong_viec' AND con.contype = 'f'
    AND pg_get_constraintdef(con.oid) LIKE '%REFERENCES%soct_khach_hang%'
    AND pg_get_constraintdef(con.oid) LIKE '%id_khach_hang%';
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.soct_cong_viec DROP CONSTRAINT ' || quote_ident(cname);
  END IF;
END $$;

ALTER TABLE public.soct_cong_viec
  ADD CONSTRAINT soct_cong_viec_id_khach_hang_fkey
  FOREIGN KEY (id_khach_hang) REFERENCES public.soct_khach_hang(id) ON DELETE RESTRICT;
