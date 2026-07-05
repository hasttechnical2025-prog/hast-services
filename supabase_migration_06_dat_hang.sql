-- MIGRATION 06: Đặt hàng nhiều mã trên một đơn (bảng + trigger)
-- IDEMPOTENT + AN TOÀN DỮ LIỆU: dùng IF NOT EXISTS, KHÔNG drop bảng để chạy lại
-- không mất dữ liệu Đặt hàng / Hàng về. Chạy trong Supabase SQL Editor.

-- 2. Đơn đặt hàng (header)
CREATE TABLE IF NOT EXISTS public.soct_dat_hang (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ngay_dat DATE NOT NULL DEFAULT CURRENT_DATE,
    nha_cung_cap TEXT,
    so_don_hang TEXT,
    da_dat BOOLEAN NOT NULL DEFAULT FALSE,       -- nháp -> đã đặt (đã gửi NCC)
    hoan_thanh BOOLEAN NOT NULL DEFAULT FALSE,   -- tự động: mọi dòng đã đủ hàng
    ghi_chu TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Chi tiết dòng hàng của đơn
CREATE TABLE IF NOT EXISTS public.soct_dat_hang_ct (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_dat_hang UUID NOT NULL REFERENCES public.soct_dat_hang(id) ON DELETE CASCADE,
    ma_hang TEXT NOT NULL REFERENCES public.soct_kho_hang(ma_hang) ON DELETE CASCADE,
    sl_dat INT NOT NULL CHECK (sl_dat > 0),
    hoan_thanh BOOLEAN NOT NULL DEFAULT FALSE,   -- tự động: dòng này nhận đủ
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dat_hang_ct_don ON public.soct_dat_hang_ct(id_dat_hang);

-- 4. Các đợt hàng về (theo từng dòng hàng)
CREATE TABLE IF NOT EXISTS public.soct_hang_ve_dot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_dat_hang_ct UUID NOT NULL REFERENCES public.soct_dat_hang_ct(id) ON DELETE CASCADE,
    ngay_nhan DATE NOT NULL DEFAULT CURRENT_DATE,
    so_luong_nhan INT NOT NULL CHECK (so_luong_nhan > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hang_ve_ct ON public.soct_hang_ve_dot(id_dat_hang_ct);

-- 5. Trigger: hàng về -> cộng tồn kho + thống kê tháng + tự đánh dấu dòng/đơn hoàn thành
CREATE OR REPLACE FUNCTION public.soct_fn_handle_hang_ve_dot()
RETURNS TRIGGER AS $$
DECLARE
    v_ct_id UUID;
    v_ma_hang TEXT;
    v_sl_dat INT;
    v_id_dat_hang UUID;
    v_ngay_nhan DATE;
    v_thang_nam TEXT;
    v_sl_moi INT := 0;
    v_sl_cu INT := 0;
    v_diff INT;
    v_tong_nhan INT;
    v_tong_dong INT;
    v_dong_du INT;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        v_ct_id := NEW.id_dat_hang_ct; v_ngay_nhan := NEW.ngay_nhan; v_sl_moi := NEW.so_luong_nhan;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_ct_id := NEW.id_dat_hang_ct; v_ngay_nhan := NEW.ngay_nhan; v_sl_moi := NEW.so_luong_nhan; v_sl_cu := OLD.so_luong_nhan;
    ELSIF (TG_OP = 'DELETE') THEN
        v_ct_id := OLD.id_dat_hang_ct; v_ngay_nhan := OLD.ngay_nhan; v_sl_cu := OLD.so_luong_nhan;
    END IF;

    v_thang_nam := to_char(v_ngay_nhan, 'YYYY-MM');
    v_diff := v_sl_moi - v_sl_cu;

    SELECT ma_hang, sl_dat, id_dat_hang INTO v_ma_hang, v_sl_dat, v_id_dat_hang
    FROM public.soct_dat_hang_ct WHERE id = v_ct_id;
    IF v_ma_hang IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy dòng hàng của đơn';
    END IF;

    -- Cập nhật tồn kho
    UPDATE public.soct_kho_hang SET ton_kho = ton_kho + v_diff WHERE ma_hang = v_ma_hang;

    -- Thống kê nhập theo tháng
    IF v_diff <> 0 THEN
        INSERT INTO public.soct_nhap_hang_thang (ma_hang, thang_nam, so_luong_nhap)
        VALUES (v_ma_hang, v_thang_nam, GREATEST(0, v_diff))
        ON CONFLICT (ma_hang, thang_nam)
        DO UPDATE SET so_luong_nhap = GREATEST(0, public.soct_nhap_hang_thang.so_luong_nhap + v_diff);
    END IF;

    -- Dòng hàng đủ chưa
    SELECT COALESCE(SUM(so_luong_nhan), 0) INTO v_tong_nhan
    FROM public.soct_hang_ve_dot WHERE id_dat_hang_ct = v_ct_id;
    UPDATE public.soct_dat_hang_ct SET hoan_thanh = (v_tong_nhan >= v_sl_dat) WHERE id = v_ct_id;

    -- Đơn hoàn thành khi mọi dòng đủ
    SELECT COUNT(*), COUNT(*) FILTER (WHERE hoan_thanh) INTO v_tong_dong, v_dong_du
    FROM public.soct_dat_hang_ct WHERE id_dat_hang = v_id_dat_hang;
    UPDATE public.soct_dat_hang SET hoan_thanh = (v_tong_dong > 0 AND v_dong_du = v_tong_dong)
    WHERE id = v_id_dat_hang;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER soct_tr_handle_hang_ve_dot
AFTER INSERT OR UPDATE OR DELETE ON public.soct_hang_ve_dot
FOR EACH ROW EXECUTE FUNCTION public.soct_fn_handle_hang_ve_dot();
