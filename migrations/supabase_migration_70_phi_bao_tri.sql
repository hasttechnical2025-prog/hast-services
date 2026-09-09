-- MIGRATION 70: Billing PHÍ BẢO TRÌ (phí dịch vụ kỹ thuật/năm theo hợp đồng HĐDV) → đẩy Kanban.
--
-- Loại billing thứ 3 (sau thue_cpc + tach_hd). Cấu hình lưu THEO MÁY (mỗi dòng soct_khach_hang =
-- 1 điểm máy), nhập ở màn hình "Phí bảo trì" (staff), gom theo Số HĐDV để lên 1 hóa đơn/HĐ.
--
-- ⚠️ CHẠY SQL TRƯỚC KHI DEPLOY (trigger kho phải loại 'phi_bao_tri' kẻo trừ nhầm mã dịch vụ PHIBT).

-- 1. Cấu hình phí bảo trì theo máy (điểm máy). Chỉ dùng cho máy loai_hd ∈ {HĐBT, MF}.
ALTER TABLE public.soct_khach_hang
  ADD COLUMN IF NOT EXISTS so_hddv       TEXT,        -- số hợp đồng dịch vụ (khóa gom hóa đơn)
  ADD COLUMN IF NOT EXISTS ngay_ky_hddv  DATE,        -- ngày ký HĐDV (mốc chu kỳ hàng năm)
  ADD COLUMN IF NOT EXISTS don_gia_bt    NUMERIC;     -- đơn giá phí bảo trì / máy / năm

-- 2. Mã dịch vụ PHIBT cho dòng vật tư hóa đơn (FK soct_chi_tiet_vat_tu.ma_hang -> soct_kho_hang).
--    Giống cách seed DVTM/DVBDT... của Thuê/CPC (mig 55). ton_kho=0, KHÔNG phải hàng thật.
INSERT INTO public.soct_kho_hang (ma_hang, ten_hang, ton_kho)
VALUES ('PHIBT', 'Phí dịch vụ kỹ thuật bảo trì', 0)
ON CONFLICT (ma_hang) DO NOTHING;

-- 3. Trigger kho: LOẠI thêm 'phi_bao_tri' khỏi diện "tiêu thụ kho" (như đã loại 'thue_cpc' ở mig 62).
--    Chỉ CREATE OR REPLACE 2 hàm; trigger giữ nguyên (tham chiếu theo tên hàm).
CREATE OR REPLACE FUNCTION public.soct_phieu_consumes(p_id uuid)
RETURNS boolean AS $$
DECLARE v_ket text; v_nguon text;
BEGIN
  SELECT ket_qua, nguon INTO v_ket, v_nguon FROM public.soct_cong_viec WHERE id = p_id;
  RETURN v_ket = 'Hoàn thành' AND COALESCE(v_nguon,'') NOT IN ('thue_cpc', 'phi_bao_tri');
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.soct_fn_phieu_kho()
RETURNS TRIGGER AS $$
DECLARE was boolean; now_ boolean; r RECORD;
BEGIN
  was  := (OLD.ket_qua = 'Hoàn thành' AND COALESCE(OLD.nguon,'') NOT IN ('thue_cpc', 'phi_bao_tri'));
  now_ := (NEW.ket_qua = 'Hoàn thành' AND COALESCE(NEW.nguon,'') NOT IN ('thue_cpc', 'phi_bao_tri'));
  IF was = now_ THEN RETURN NEW; END IF;
  FOR r IN
    SELECT ma_hang, so_luong FROM public.soct_chi_tiet_vat_tu
    WHERE id_cong_viec = NEW.id AND NOT COALESCE(da_tra,false)
  LOOP
    IF now_ THEN
      PERFORM public.soct_kho_apply(r.ma_hang, COALESCE(r.so_luong,0));
    ELSE
      PERFORM public.soct_kho_apply(r.ma_hang, -COALESCE(r.so_luong,0));
    END IF;
  END LOOP;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
