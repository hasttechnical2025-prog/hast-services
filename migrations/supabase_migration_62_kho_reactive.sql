-- MIGRATION 62: Đồng bộ tồn kho PHẢN ỨNG (reactive) ở tầng DB — an toàn tuyệt đối khi SỬA phiếu.
--
-- Vấn đề cũ: trigger chỉ trừ kho MỘT LẦN lúc phiếu -> 'Hoàn thành'. Admin sửa vật tư phiếu đã
-- hoàn thành (thêm/bớt/đổi SL), hoặc mở lại phiếu, thì kho KHÔNG được điều chỉnh -> tồn kho lệch.
-- Việc trả vật tư (da_tra) lại chỉnh kho ở tầng ứng dụng -> logic phân tán, dễ vỡ khi bàn giao.
--
-- Mô hình mới: 1 DÒNG vật tư "tiêu thụ" kho khi và chỉ khi
--     phiếu cha 'Hoàn thành'  AND  da_tra = false  AND  nguon <> 'thue_cpc'
-- (loại 'thue_cpc' vì là dịch vụ, không phải vật tư thật; 'tach_hd' VẪN tiêu thụ vì giữ vật tư thật).
-- Bất kỳ thay đổi nào (thêm/xóa/sửa dòng, đổi SL/mã/da_tra, chuyển phiếu, đổi ket_qua/nguon) đều
-- được trigger điều chỉnh ton_kho theo DELTA -> kho luôn khớp, KHÔNG cần code ứng dụng đụng vào.
--
-- ⚠️ KHÔNG backfill: phiếu 'Hoàn thành' hiện tại đã bị trừ kho bởi trigger cũ (1 lần) -> giữ nguyên.
--    Trigger mới chỉ tác động các THAY ĐỔI từ nay. Sau khi chạy, TEST bằng 1 phiếu nháp trước khi tin.
-- ⚠️ CHẠY SQL TRƯỚC KHI DEPLOY (code tra-vat-tu bỏ chỉnh kho tay -> nếu thiếu trigger sẽ không trừ/hoàn).

-- 1. Bỏ trigger + hàm CŨ (chỉ trừ 1 lần lúc hoàn thành)
DROP TRIGGER IF EXISTS soct_tr_handle_hoan_thanh_cong_viec ON public.soct_cong_viec;
DROP FUNCTION IF EXISTS public.soct_fn_handle_hoan_thanh_cong_viec();

-- 2. Helper: cộng/trừ kho theo "lượng tiêu thụ" (delta>0 = tiêu thụ -> ton_kho giảm).
CREATE OR REPLACE FUNCTION public.soct_kho_apply(p_ma_hang text, p_delta numeric)
RETURNS void AS $$
BEGIN
  IF p_ma_hang IS NULL OR COALESCE(p_delta,0) = 0 THEN RETURN; END IF;
  UPDATE public.soct_kho_hang SET ton_kho = COALESCE(ton_kho,0) - p_delta WHERE ma_hang = p_ma_hang;
END; $$ LANGUAGE plpgsql;

-- 3. Phiếu (theo id) có ở trạng thái "tiêu thụ kho" không (Hoàn thành & không phải billing thuê/CPC).
CREATE OR REPLACE FUNCTION public.soct_phieu_consumes(p_id uuid)
RETURNS boolean AS $$
DECLARE v_ket text; v_nguon text;
BEGIN
  SELECT ket_qua, nguon INTO v_ket, v_nguon FROM public.soct_cong_viec WHERE id = p_id;
  RETURN v_ket = 'Hoàn thành' AND COALESCE(v_nguon,'') <> 'thue_cpc';
END; $$ LANGUAGE plpgsql;

-- 4. Trigger trên DÒNG vật tư: mọi INSERT/UPDATE/DELETE -> gỡ tiêu thụ cũ, áp tiêu thụ mới.
CREATE OR REPLACE FUNCTION public.soct_fn_vattu_kho()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
    IF NOT COALESCE(OLD.da_tra,false) AND public.soct_phieu_consumes(OLD.id_cong_viec) THEN
      PERFORM public.soct_kho_apply(OLD.ma_hang, -COALESCE(OLD.so_luong,0)); -- hoàn lại tiêu thụ cũ
    END IF;
  END IF;
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    IF NOT COALESCE(NEW.da_tra,false) AND public.soct_phieu_consumes(NEW.id_cong_viec) THEN
      PERFORM public.soct_kho_apply(NEW.ma_hang, COALESCE(NEW.so_luong,0)); -- áp tiêu thụ mới
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS soct_tr_vattu_kho ON public.soct_chi_tiet_vat_tu;
CREATE TRIGGER soct_tr_vattu_kho
AFTER INSERT OR UPDATE OR DELETE ON public.soct_chi_tiet_vat_tu
FOR EACH ROW EXECUTE FUNCTION public.soct_fn_vattu_kho();

-- 5. Trigger trên PHIẾU: khi ket_qua/nguon đổi làm trạng thái "tiêu thụ" bật/tắt -> trừ/hoàn toàn bộ dòng.
CREATE OR REPLACE FUNCTION public.soct_fn_phieu_kho()
RETURNS TRIGGER AS $$
DECLARE was boolean; now_ boolean; r RECORD;
BEGIN
  was  := (OLD.ket_qua = 'Hoàn thành' AND COALESCE(OLD.nguon,'') <> 'thue_cpc');
  now_ := (NEW.ket_qua = 'Hoàn thành' AND COALESCE(NEW.nguon,'') <> 'thue_cpc');
  IF was = now_ THEN RETURN NEW; END IF;
  FOR r IN
    SELECT ma_hang, so_luong FROM public.soct_chi_tiet_vat_tu
    WHERE id_cong_viec = NEW.id AND NOT COALESCE(da_tra,false)
  LOOP
    IF now_ THEN
      PERFORM public.soct_kho_apply(r.ma_hang, COALESCE(r.so_luong,0));   -- bật tiêu thụ -> trừ kho
    ELSE
      PERFORM public.soct_kho_apply(r.ma_hang, -COALESCE(r.so_luong,0));  -- tắt tiêu thụ -> hoàn kho
    END IF;
  END LOOP;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS soct_tr_phieu_kho ON public.soct_cong_viec;
CREATE TRIGGER soct_tr_phieu_kho
AFTER UPDATE OF ket_qua, nguon ON public.soct_cong_viec
FOR EACH ROW EXECUTE FUNCTION public.soct_fn_phieu_kho();
