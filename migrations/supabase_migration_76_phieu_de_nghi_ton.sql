-- MIGRATION 76: Phiếu đề nghị (BM38) TÁC ĐỘNG TỒN KHO — Pha 2.
--
-- Nghiệp vụ: BM38 có 2 vế "Hàng xuất ra" / "Hàng nhập lại". Việc có đụng tồn hay không
-- KHÔNG suy đoán được từ cấu trúc (vd chuyển đổi mã vs gộp mã theo khách giống nhau về hình thức)
-- -> cần người điều khiển:
--   * Công tắc CẤP PHIẾU  tac_dong_ton : bật (mặc định) mới áp tồn; tắt -> phiếu thuần giấy tờ.
--   * Cờ TỪNG DÒNG        tinh_ton     : mặc định bật nếu mã có trong kho (vật tư), tắt nếu không
--                                        (máy / mã gộp / mã mới); người dùng chỉnh tay được.
-- Mốc áp tồn = lúc "Xác nhận thực hiện" (KHÔNG phải lúc tạo). Trạng thái: 'nhap' -> 'da_thuc_hien'.
-- Sửa/Xóa phiếu ĐÃ thực hiện: ứng dụng phải HOÀN TÁC (đảo dấu) trước -> tồn không lệch.
--
-- ⚠️ Dùng LẠI helper soct_kho_apply(ma, delta) của mig 62 (delta>0 = tiêu thụ -> ton_kho giảm):
--    Hàng xuất ra  -> apply(ma, +SL)  (tiêu thụ, giảm tồn)
--    Hàng nhập lại -> apply(ma, -SL)  (hoàn, tăng tồn)
--    BM38 KHÔNG đi qua soct_chi_tiet_vat_tu nên KHÔNG bị trigger mig 62 tính trùng.

-- 1. Cột trên phiếu (master)
ALTER TABLE public.soct_phieu_de_nghi
  ADD COLUMN IF NOT EXISTS tac_dong_ton  BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS trang_thai    TEXT        NOT NULL DEFAULT 'nhap',   -- 'nhap' | 'da_thuc_hien'
  ADD COLUMN IF NOT EXISTS thuc_hien_luc TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS thuc_hien_by  UUID;

-- 2. Cột trên dòng chi tiết
ALTER TABLE public.soct_phieu_de_nghi_ct
  ADD COLUMN IF NOT EXISTS tinh_ton BOOLEAN NOT NULL DEFAULT false;

-- 3. RPC áp/hoàn tồn cho 1 phiếu (chạy trong 1 transaction, dùng lại soct_kho_apply).
--    p_sign = +1 : thực hiện ;  p_sign = -1 : hoàn tác.
--    Chỉ áp khi công tắc phiếu bật; chỉ các dòng tinh_ton=true & có mã.
CREATE OR REPLACE FUNCTION public.soct_pdn_apply_ton(p_id uuid, p_sign int)
RETURNS void AS $$
DECLARE r RECORD; v_on boolean;
BEGIN
  SELECT tac_dong_ton INTO v_on FROM public.soct_phieu_de_nghi WHERE id = p_id;
  IF NOT COALESCE(v_on, false) THEN RETURN; END IF;
  FOR r IN
    SELECT loai_hang, ma_hang, COALESCE(so_luong,0) AS sl
    FROM public.soct_phieu_de_nghi_ct
    WHERE phieu_id = p_id
      AND COALESCE(tinh_ton, false) = true
      AND ma_hang IS NOT NULL AND ma_hang <> ''
  LOOP
    IF r.loai_hang = 'xuat_ra' THEN
      PERFORM public.soct_kho_apply(r.ma_hang, r.sl * p_sign);    -- xuất: tiêu thụ -> giảm tồn
    ELSIF r.loai_hang = 'nhap_lai' THEN
      PERFORM public.soct_kho_apply(r.ma_hang, -r.sl * p_sign);   -- nhập: hoàn -> tăng tồn
    END IF;
  END LOOP;
END; $$ LANGUAGE plpgsql;
