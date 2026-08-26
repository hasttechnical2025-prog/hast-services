-- MIGRATION 63: Nhận hàng theo MÃ THỰC (đặt mã A, hàng về có thể mã B — lưu vết thay thế).
--
-- Thực tế: NCC hay giao mã/model KHÁC cái đã đặt. Trước đây đợt hàng về bám cứng mã của DÒNG đặt
-- -> phải xóa mã cũ + lập PO mới. Nay mỗi ĐỢT hàng về khai `ma_hang` THỰC nhận (mặc định = mã đặt):
--   * Tồn kho + Thống kê nhập cộng vào MÃ THỰC.
--   * Dòng PO GIỮ mã đặt; "hoàn thành" tính theo SỐ LƯỢNG nhận (không phụ thuộc mã) -> lưu vết đặt-A-nhận-B.
--   * Cho phép 1 dòng đặt A về vừa A vừa B (nhiều đợt, mã khác nhau).
--
-- ⚠️ CHẠY SQL TRƯỚC/CÙNG DEPLOY. Idempotent.

-- 1. Cột mã thực nhận (NULL = dùng mã của dòng đặt — tương thích dữ liệu cũ).
ALTER TABLE public.soct_hang_ve_dot ADD COLUMN IF NOT EXISTS ma_hang TEXT;

-- 2. Backfill: đợt hàng về cũ -> mã = mã của dòng đặt (không đổi tồn kho, chỉ ghi rõ dữ liệu).
UPDATE public.soct_hang_ve_dot hv
SET ma_hang = ct.ma_hang
FROM public.soct_dat_hang_ct ct
WHERE hv.id_dat_hang_ct = ct.id AND hv.ma_hang IS NULL;

-- 3. Viết lại trigng: cộng/trừ kho + thống kê nhập theo MÃ THỰC của đợt (hoàn OLD, áp NEW).
CREATE OR REPLACE FUNCTION public.soct_fn_handle_hang_ve_dot()
RETURNS TRIGGER AS $$
DECLARE
    v_ct_id UUID; v_sl_dat INT; v_id_dat_hang UUID;
    v_tong_nhan INT; v_tong_dong INT; v_dong_du INT; v_line_ma TEXT;
    o_ma TEXT; o_q INT; o_th TEXT;
    n_ma TEXT; n_q INT; n_th TEXT;
BEGIN
    -- HOÀN đợt CŨ (UPDATE/DELETE) theo mã thực cũ
    IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
        SELECT ma_hang INTO v_line_ma FROM public.soct_dat_hang_ct WHERE id = OLD.id_dat_hang_ct;
        o_ma := COALESCE(OLD.ma_hang, v_line_ma);
        o_q := COALESCE(OLD.so_luong_nhan, 0);
        o_th := to_char(OLD.ngay_nhan, 'YYYY-MM');
        UPDATE public.soct_kho_hang SET ton_kho = ton_kho - o_q WHERE ma_hang = o_ma;
        IF o_q <> 0 THEN
            INSERT INTO public.soct_nhap_hang_thang (ma_hang, thang_nam, so_luong_nhap)
            VALUES (o_ma, o_th, 0)
            ON CONFLICT (ma_hang, thang_nam)
            DO UPDATE SET so_luong_nhap = GREATEST(0, public.soct_nhap_hang_thang.so_luong_nhap - o_q);
        END IF;
    END IF;

    -- ÁP đợt MỚI (INSERT/UPDATE) theo mã thực mới
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        SELECT ma_hang INTO v_line_ma FROM public.soct_dat_hang_ct WHERE id = NEW.id_dat_hang_ct;
        n_ma := COALESCE(NEW.ma_hang, v_line_ma);
        n_q := COALESCE(NEW.so_luong_nhan, 0);
        n_th := to_char(NEW.ngay_nhan, 'YYYY-MM');
        UPDATE public.soct_kho_hang SET ton_kho = ton_kho + n_q WHERE ma_hang = n_ma;
        IF n_q <> 0 THEN
            INSERT INTO public.soct_nhap_hang_thang (ma_hang, thang_nam, so_luong_nhap)
            VALUES (n_ma, n_th, GREATEST(0, n_q))
            ON CONFLICT (ma_hang, thang_nam)
            DO UPDATE SET so_luong_nhap = GREATEST(0, public.soct_nhap_hang_thang.so_luong_nhap + n_q);
        END IF;
    END IF;

    -- Cờ hoàn thành theo SỐ LƯỢNG của dòng (không phụ thuộc mã thực)
    v_ct_id := COALESCE(NEW.id_dat_hang_ct, OLD.id_dat_hang_ct);
    SELECT sl_dat, id_dat_hang INTO v_sl_dat, v_id_dat_hang FROM public.soct_dat_hang_ct WHERE id = v_ct_id;
    SELECT COALESCE(SUM(so_luong_nhan), 0) INTO v_tong_nhan FROM public.soct_hang_ve_dot WHERE id_dat_hang_ct = v_ct_id;
    UPDATE public.soct_dat_hang_ct SET hoan_thanh = (v_tong_nhan >= v_sl_dat) WHERE id = v_ct_id;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE hoan_thanh) INTO v_tong_dong, v_dong_du
    FROM public.soct_dat_hang_ct WHERE id_dat_hang = v_id_dat_hang;
    UPDATE public.soct_dat_hang SET hoan_thanh = (v_tong_dong > 0 AND v_dong_du = v_tong_dong)
    WHERE id = v_id_dat_hang;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
-- Trigger giữ nguyên (soct_tr_handle_hang_ve_dot) — chỉ thay thân hàm.
