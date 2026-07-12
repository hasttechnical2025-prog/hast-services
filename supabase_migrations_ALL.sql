-- ============================================================
-- GỘP TOÀN BỘ MIGRATION 02 -> 12 (idempotent, AN TOÀN DỮ LIỆU)
-- Chạy 1 lần trên Supabase SQL Editor. Chạy lại KHÔNG mất dữ liệu.
-- DB MỚI: chạy supabase_schema.sql TRƯỚC, rồi chạy file này.
-- DB ĐANG DÙNG: chạy thẳng file này cũng được (chỉ thêm cái còn thiếu).
-- ============================================================


-- ─────────────────────────────────────────────
-- supabase_migration_02_pool_workflow.sql
-- ─────────────────────────────────────────────
-- MIGRATION 02: Workflow "pool + nhận việc" cho KTV và đăng nhập QR
-- Chạy trong Supabase SQL Editor. Tất cả đều idempotent (chạy lại không lỗi).

-- 1. Trạng thái hoạt động của nhân viên (dùng để vô hiệu hóa KTV nghỉ việc)
ALTER TABLE public.soct_users
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Token đăng nhập cố định cho QR (mỗi KTV một token; NULL = chưa tạo QR)
--    Token được sinh & thu hồi từ phía ứng dụng (Node crypto), không sinh ở đây.
ALTER TABLE public.soct_users
    ADD COLUMN IF NOT EXISTS login_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS soct_users_login_token_key
    ON public.soct_users (login_token)
    WHERE login_token IS NOT NULL;

-- 3. (Realtime) Không cần bật RLS/publication cho client vì app dùng cơ chế
--    Supabase Realtime "Broadcast" phát từ server sau mỗi thay đổi công việc,
--    client chỉ lắng nghe tín hiệu rồi refetch qua API đã xác thực. Không mở
--    quyền đọc trực tiếp bảng cho anon key -> dữ liệu vẫn kín.


-- ─────────────────────────────────────────────
-- supabase_migration_03_vattu_financials.sql
-- ─────────────────────────────────────────────
-- MIGRATION 03: Tài chính theo từng dòng vật tư + bỏ tiền ở cấp công việc
-- Chạy trong Supabase SQL Editor. Idempotent (chạy lại không lỗi).

-- 1. Thêm các cột tài chính cho từng dòng vật tư
ALTER TABLE public.soct_chi_tiet_vat_tu
    ADD COLUMN IF NOT EXISTS don_gia   NUMERIC(15, 2) NOT NULL DEFAULT 0,  -- đơn giá 1 đơn vị
    ADD COLUMN IF NOT EXISTS vat       NUMERIC(5, 2)  NOT NULL DEFAULT 0,  -- % VAT (VD 10.00 = 10%)
    ADD COLUMN IF NOT EXISTS thanh_tien NUMERIC(15, 2) NOT NULL DEFAULT 0, -- = don_gia * so_luong (chưa VAT)
    ADD COLUMN IF NOT EXISTS hoa_don   BOOLEAN NOT NULL DEFAULT FALSE;     -- dòng này có xuất hóa đơn không

-- 2. Bỏ tiền ở cấp công việc (chuyển sang tính theo tổng vật tư)
ALTER TABLE public.soct_cong_viec
    DROP COLUMN IF EXISTS so_tien,
    DROP COLUMN IF EXISTS loai_thanh_toan;


-- ─────────────────────────────────────────────
-- supabase_migration_04_bao_tri_giam_dinh.sql
-- ─────────────────────────────────────────────
-- MIGRATION 04: Module Bảo trì & Giám định + hợp đồng bảo trì trên khách hàng
-- Chạy trong Supabase SQL Editor. Idempotent.

-- 1. Hợp đồng bảo trì gắn với khách hàng
ALTER TABLE public.soct_khach_hang
    ADD COLUMN IF NOT EXISTS loai_hd TEXT,             -- VD: MF, HĐBT
    ADD COLUMN IF NOT EXISTS ngay_het_han_hdbt DATE;   -- ngày hết hạn hợp đồng bảo trì

-- 2. Bảo trì theo tháng (mỗi máy tối đa 1 lần/tháng)
CREATE TABLE IF NOT EXISTS public.soct_bao_tri (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ma_may TEXT NOT NULL,
    thang_nam TEXT NOT NULL,                            -- YYYY-MM
    ngay DATE,
    ktv_id UUID REFERENCES public.soct_users(id) ON DELETE SET NULL,
    ghi_chu TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uniq_bao_tri_may_thang UNIQUE (ma_may, thang_nam)
);
CREATE INDEX IF NOT EXISTS idx_bao_tri_thang ON public.soct_bao_tri(thang_nam);
CREATE INDEX IF NOT EXISTS idx_bao_tri_ma_may ON public.soct_bao_tri(ma_may);

-- 3. Giám định: biên bản
CREATE TABLE IF NOT EXISTS public.soct_giam_dinh (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ma_may TEXT,
    id_khach_hang UUID REFERENCES public.soct_khach_hang(id) ON DELETE SET NULL,
    ngay_giam_dinh DATE,
    ktv_giam_dinh TEXT,
    vi_tri TEXT,
    so_dem BIGINT,
    tinh_trang_may TEXT,
    da_bao_gia BOOLEAN NOT NULL DEFAULT FALSE,
    da_thay BOOLEAN NOT NULL DEFAULT FALSE,
    ngay_thay DATE,
    so_report TEXT,
    ghi_chu TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_giam_dinh_ma_may ON public.soct_giam_dinh(ma_may);
CREATE INDEX IF NOT EXISTS idx_giam_dinh_da_thay ON public.soct_giam_dinh(da_thay);

-- 4. Giám định: vật tư đề xuất thay (bắt buộc liên kết Kho)
CREATE TABLE IF NOT EXISTS public.soct_giam_dinh_vat_tu (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_giam_dinh UUID NOT NULL REFERENCES public.soct_giam_dinh(id) ON DELETE CASCADE,
    ma_hang TEXT NOT NULL REFERENCES public.soct_kho_hang(ma_hang) ON DELETE CASCADE,
    so_luong INT NOT NULL DEFAULT 1,
    ghi_chu TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gd_vat_tu_gd ON public.soct_giam_dinh_vat_tu(id_giam_dinh);


-- ─────────────────────────────────────────────
-- supabase_migration_05_danh_muc_cau_hinh.sql
-- ─────────────────────────────────────────────
-- MIGRATION 05: Danh mục dropdown tùy chỉnh + cấu hình hệ thống
-- Chạy trong Supabase SQL Editor. Idempotent.

-- 1. Danh mục dropdown (admin tự thêm/sửa/ẩn)
CREATE TABLE IF NOT EXISTS public.soct_danh_muc (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nhom TEXT NOT NULL,          -- loai_cong_viec | loai_hd | ktv_giam_dinh | tinh_trang_may
    gia_tri TEXT NOT NULL,
    thu_tu INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uniq_danh_muc UNIQUE (nhom, gia_tri)
);
CREATE INDEX IF NOT EXISTS idx_danh_muc_nhom ON public.soct_danh_muc(nhom);

-- Seed mặc định: Loại công việc
INSERT INTO public.soct_danh_muc (nhom, gia_tri, thu_tu) VALUES
    ('loai_cong_viec', 'Lắp máy', 1),
    ('loai_cong_viec', 'Sửa máy', 2),
    ('loai_cong_viec', 'Giao mực', 3),
    ('loai_cong_viec', 'Thay vật tư', 4),
    ('loai_cong_viec', 'Bảo trì', 5),
    ('loai_cong_viec', 'Bảo hành', 6),
    ('loai_cong_viec', 'Hỗ trợ thầu', 7),
    ('loai_cong_viec', 'Hỗ trợ đại lý', 8),
    ('loai_cong_viec', 'Khiếu nại', 9),
    ('loai_cong_viec', 'Kiểm tra', 10),
    ('loai_cong_viec', 'Khác', 11)
ON CONFLICT (nhom, gia_tri) DO NOTHING;

-- Seed mặc định: Loại hợp đồng (kèm Máy thuê, Máy CPC)
INSERT INTO public.soct_danh_muc (nhom, gia_tri, thu_tu) VALUES
    ('loai_hd', 'HĐBT', 1),
    ('loai_hd', 'MF', 2),
    ('loai_hd', 'Máy thuê', 3),
    ('loai_hd', 'Máy CPC', 4)
ON CONFLICT (nhom, gia_tri) DO NOTHING;

-- (ktv_giam_dinh và tinh_trang_may để trống, admin tự thêm dần)

-- 2. Cấu hình hệ thống (key-value)
CREATE TABLE IF NOT EXISTS public.soct_cau_hinh (
    khoa TEXT PRIMARY KEY,
    gia_tri TEXT
);
INSERT INTO public.soct_cau_hinh (khoa, gia_tri) VALUES
    ('hdbt_canh_bao_thang', '2')   -- cảnh báo HĐBT sắp hết hạn trước N tháng
ON CONFLICT (khoa) DO NOTHING;


-- ─────────────────────────────────────────────
-- supabase_migration_06_dat_hang.sql
-- ─────────────────────────────────────────────
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


-- ─────────────────────────────────────────────
-- supabase_migration_07_rls.sql
-- ─────────────────────────────────────────────
-- MIGRATION 07: Bật RLS chặn anon trên mọi bảng (BẢO MẬT PRODUCTION)
-- Lý do: NEXT_PUBLIC_SUPABASE_ANON_KEY lộ trong bundle trình duyệt. Nếu không bật RLS,
-- bất kỳ ai có anon key đều đọc/ghi thẳng DB qua REST của Supabase, bỏ qua kiểm quyền ở API.
--
-- App truy cập DB HOÀN TOÀN qua service role (trong các API route) -> service role BỎ QUA RLS,
-- nên bật RLS mà KHÔNG tạo policy nào = chặn sạch anon/authenticated, app vẫn chạy bình thường.
-- Realtime dùng cơ chế Broadcast (không phụ thuộc RLS bảng) -> không ảnh hưởng.
--
-- Idempotent: chạy lại nhiều lần không lỗi.

ALTER TABLE public.soct_users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_khach_hang         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_kho_hang           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_nhap_hang_thang    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_dat_hang           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_dat_hang_ct        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_hang_ve_dot        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_cong_viec          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_chi_tiet_vat_tu    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_bao_tri            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_giam_dinh          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_giam_dinh_vat_tu   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_danh_muc           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_cau_hinh           ENABLE ROW LEVEL SECURITY;

-- (Cố ý KHÔNG tạo policy: RLS bật + không policy = deny-all cho anon/authenticated.
--  Nếu sau này cần cho client đọc trực tiếp bảng nào, mới thêm policy cụ thể cho bảng đó.)


-- ─────────────────────────────────────────────
-- supabase_migration_08_bao_cao.sql
-- ─────────────────────────────────────────────
-- MIGRATION 08: Chuẩn bị dữ liệu cho Báo cáo tháng
-- Chạy trong Supabase SQL Editor. Idempotent.

-- 1. Thêm "Số lượng" vào phiếu giao việc
--    (VD: 1 phiếu Lắp máy nhưng lắp 2 máy -> số vụ việc = 1, số lượng = 2)
ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS so_luong INT NOT NULL DEFAULT 1;

-- 2. Thêm "Hãng" cho máy của khách hàng (Konica / Fuji / Khác) -> dùng cho Mục 2 báo cáo
ALTER TABLE public.soct_khach_hang
    ADD COLUMN IF NOT EXISTS hang TEXT;

-- 3. Seed danh mục nhóm 'hang'
INSERT INTO public.soct_danh_muc (nhom, gia_tri, thu_tu) VALUES
    ('hang', 'Konica', 1),
    ('hang', 'Fuji', 2),
    ('hang', 'Khác', 3)
ON CONFLICT (nhom, gia_tri) DO NOTHING;

-- Cột mới kế thừa RLS đã bật ở migration 07 (không cần policy mới).


-- ─────────────────────────────────────────────
-- supabase_migration_09_doanh_so.sql
-- ─────────────────────────────────────────────
-- MIGRATION 09: Doanh số theo tháng (nhập từ kế toán) cho Báo cáo tháng
-- Chạy trong Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS public.soct_doanh_so_thang (
    thang_nam TEXT PRIMARY KEY,               -- YYYY-MM
    thuc_te   NUMERIC(15, 2) NOT NULL DEFAULT 0,  -- Doanh số thực tế (kế toán)
    ke_hoach  NUMERIC(15, 2) NOT NULL DEFAULT 0,  -- Doanh số kế hoạch
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS: chặn anon như các bảng khác (chỉ truy cập qua service role ở API)
ALTER TABLE public.soct_doanh_so_thang ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────
-- supabase_migration_10_phieu_cung.sql
-- ─────────────────────────────────────────────
-- MIGRATION 10: Kiểm soát hoàn trả phiếu cứng (bản giấy) sau khi KTV hoàn thành việc
-- Chạy trong Supabase SQL Editor. Idempotent.

-- 1. Trạng thái nộp phiếu cứng trên phiếu công tác
ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS da_nop_phieu BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS ngay_nop_phieu DATE;

-- 2. Ngưỡng cảnh báo trễ (số ngày kể từ ngày làm mà chưa nộp phiếu) — mặc định 3
INSERT INTO public.soct_cau_hinh (khoa, gia_tri) VALUES
    ('phieu_cung_canh_bao_ngay', '3')
ON CONFLICT (khoa) DO NOTHING;


-- ─────────────────────────────────────────────
-- supabase_migration_11_cong_no.sql
-- ─────────────────────────────────────────────
-- MIGRATION 11: Công nợ / trạng thái hóa đơn cấp phiếu cho luồng Báo giá
-- Chạy trong Supabase SQL Editor. Idempotent.

-- Trạng thái hóa đơn 3 mức ở cấp phiếu:
--   'Chưa hóa đơn' (mặc định) -> 'Đã báo giá' -> 'Đã lên hóa đơn'
ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS trang_thai_hd TEXT NOT NULL DEFAULT 'Chưa hóa đơn';

CREATE INDEX IF NOT EXISTS idx_cong_viec_trang_thai_hd ON public.soct_cong_viec(trang_thai_hd);


-- ─────────────────────────────────────────────
-- supabase_migration_12_audit_log.sql
-- ─────────────────────────────────────────────
-- MIGRATION 12: Audit log (nhật ký thao tác) cho admin theo dõi
-- Chạy trong Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS public.soct_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id   UUID,
    user_name TEXT,
    user_role TEXT,
    action    TEXT NOT NULL,
    detail    TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.soct_audit_log(created_at DESC);

-- RLS: chặn anon như các bảng khác
ALTER TABLE public.soct_audit_log ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- supabase_migration_13_tra_vat_tu.sql
-- ─────────────────────────────────────────────
-- MIGRATION 13: Trả vật tư về kho (khách không lấy nữa sau khi phiếu Hoàn thành)
-- Chạy trong Supabase SQL Editor. Idempotent.

-- Cờ đánh dấu dòng vật tư đã được trả về kho (giữ dòng để đối soát) + ngày trả
ALTER TABLE public.soct_chi_tiet_vat_tu
    ADD COLUMN IF NOT EXISTS da_tra BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.soct_chi_tiet_vat_tu
    ADD COLUMN IF NOT EXISTS ngay_tra DATE;

-- ─────────────────────────────────────────────
-- supabase_migration_14_da_nhan.sql
-- ─────────────────────────────────────────────
-- MIGRATION 14: Thêm trạng thái "Đã nhận" (Chờ nhận -> Đã nhận -> Đang làm -> Hoàn thành/Lắp tiếp)
ALTER TABLE public.soct_cong_viec DROP CONSTRAINT IF EXISTS soct_cong_viec_ket_qua_check;
ALTER TABLE public.soct_cong_viec
  ADD CONSTRAINT soct_cong_viec_ket_qua_check
  CHECK (ket_qua IN ('Chờ nhận', 'Đã nhận', 'Đang làm', 'Hoàn thành', 'Lắp tiếp'));

UPDATE public.soct_cong_viec
   SET ket_qua = 'Đã nhận'
 WHERE ktv_id IS NOT NULL AND ket_qua = 'Chờ nhận';

-- ─────────────────────────────────────────────
-- supabase_migration_15_unique_report_sync_hd.sql
-- ─────────────────────────────────────────────
-- MIGRATION 15: UNIQUE số phiếu + đồng bộ trang_thai_hd với cờ hoa_don
UPDATE public.soct_cong_viec SET report = trim(report)
 WHERE report IS NOT NULL AND report <> trim(report);
DELETE FROM public.soct_cong_viec a USING public.soct_cong_viec b
 WHERE a.report IS NOT NULL AND a.report <> '' AND a.report = b.report
   AND (a.created_at, a.ctid) > (b.created_at, b.ctid);
CREATE UNIQUE INDEX IF NOT EXISTS uq_soct_cong_viec_report
    ON public.soct_cong_viec (report) WHERE report IS NOT NULL AND report <> '';
UPDATE public.soct_cong_viec c SET trang_thai_hd = 'Đã lên hóa đơn'
 WHERE c.trang_thai_hd IS DISTINCT FROM 'Đã lên hóa đơn'
   AND EXISTS (SELECT 1 FROM public.soct_chi_tiet_vat_tu v WHERE v.id_cong_viec = c.id AND v.hoa_don = TRUE);

-- ─────────────────────────────────────────────
-- supabase_migration_16_created_by.sql
-- ─────────────────────────────────────────────
-- MIGRATION 16: Lưu người tạo phiếu (hiển thị trong tin nhắn Telegram)
ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.soct_users(id) ON DELETE SET NULL;

-- MIGRATION 17: Hỗ trợ 2 KTV (KTV chính + KTV kèm)
-- Chạy trong Supabase SQL Editor. Idempotent.

ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS ktv2_id UUID REFERENCES public.soct_users(id) ON DELETE SET NULL;
-- MIGRATION 18: Báo cáo KTV (Nhật ký công việc) và Ngày nghỉ lễ
-- Chạy trong Supabase SQL Editor. Idempotent.

-- 1. Bổ sung các cột báo cáo vào bảng Công việc chính
ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS counter INT,
    ADD COLUMN IF NOT EXISTS ghi_chu_ktv TEXT;

-- 2. Bảng lưu trữ ngày nghỉ lễ theo quy định (để loại trừ khỏi báo cáo & nhắc nhở)
CREATE TABLE IF NOT EXISTS public.soct_ngay_nghi (
    ngay DATE PRIMARY KEY,
    ghi_chu TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Bảng nhật ký công việc ngoài luồng (việc không tên) của KTV
CREATE TABLE IF NOT EXISTS public.soct_nhat_ky_ktv (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ktv_id UUID NOT NULL REFERENCES public.soct_users(id) ON DELETE CASCADE,
    ngay DATE NOT NULL DEFAULT CURRENT_DATE,
    noi_dung TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nhat_ky_ktv_date ON public.soct_nhat_ky_ktv(ktv_id, ngay);

-- 4. Bảng chốt trạng thái báo cáo ngày của KTV
CREATE TABLE IF NOT EXISTS public.soct_trang_thai_bao_cao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ktv_id UUID NOT NULL REFERENCES public.soct_users(id) ON DELETE CASCADE,
    ngay_bao_cao DATE NOT NULL,
    da_nop BOOLEAN NOT NULL DEFAULT FALSE,
    thoi_gian_nop TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT soct_trang_thai_bao_cao_unique UNIQUE (ktv_id, ngay_bao_cao)
);
CREATE INDEX IF NOT EXISTS idx_tt_bao_cao ON public.soct_trang_thai_bao_cao(ktv_id, ngay_bao_cao);
-- MIGRATION 19: Thêm cờ telegram_sent để chặn Webhook DB bắn trùng tin nhắn lẻ tẻ khi giao việc hàng loạt
-- Chạy trong Supabase SQL Editor. Idempotent.

ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS telegram_sent BOOLEAN NOT NULL DEFAULT FALSE;

-- ─────────────────────────────────────────────
-- supabase_migration_20_webauthn.sql
-- ─────────────────────────────────────────────
-- MIGRATION 20: Đăng nhập sinh trắc học (WebAuthn / Passkey)
CREATE TABLE IF NOT EXISTS public.soct_webauthn_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.soct_users(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    counter BIGINT NOT NULL DEFAULT 0,
    transports TEXT,
    device_label TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_used_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_webauthn_user ON public.soct_webauthn_credentials(user_id);
ALTER TABLE public.soct_webauthn_credentials ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- supabase_migration_21_tinh_trang_bao_cao.sql
-- ─────────────────────────────────────────────
INSERT INTO public.soct_danh_muc (nhom, gia_tri, thu_tu) VALUES
    ('tinh_trang_bao_cao', 'HĐBT', 1),
    ('tinh_trang_bao_cao', 'Làm giám định', 2),
    ('tinh_trang_bao_cao', 'Theo dõi thêm', 3),
    ('tinh_trang_bao_cao', 'Khác', 4)
ON CONFLICT (nhom, gia_tri) DO NOTHING;


-- MIGRATION 22: Module Billing Máy thuê / CPC
-- Idempotent (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS). KHÔNG reset DB.
-- Áp dụng cho soct_khach_hang có loai_hd IN ('Máy thuê','Máy CPC').
-- Độc lập hoàn toàn với Sổ công tác (soct_cong_viec) — không tạo loai_cong_viec mới.

-- 1. Mở rộng soct_khach_hang: thông tin hợp đồng thuê/CPC + thông tin in bảng kê
ALTER TABLE public.soct_khach_hang
    ADD COLUMN IF NOT EXISTS phi_thue_thang NUMERIC(15,2),              -- phí thuê máy cố định/tháng, NULL nếu CPC thuần / máy trong gói cơ bản của HĐ khung
    ADD COLUMN IF NOT EXISTS don_gia_bw NUMERIC(15,2) DEFAULT 0,        -- đơn giá / bản đen trắng
    ADD COLUMN IF NOT EXISTS don_gia_mau NUMERIC(15,2) DEFAULT 0,       -- đơn giá / bản màu
    ADD COLUMN IF NOT EXISTS dinh_muc_mien_phi_bw INT DEFAULT 0,        -- số bản BW miễn phí, trừ trước khi tính tiền
    ADD COLUMN IF NOT EXISTS dinh_muc_mien_phi_mau INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cam_ket_toi_thieu_bw INT DEFAULT 0,        -- số bản BW cam kết tối thiểu (dùng ít vẫn tính đủ)
    ADD COLUMN IF NOT EXISTS cam_ket_toi_thieu_mau INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS vat_thue_cpc NUMERIC(5,2) DEFAULT 8,       -- % VAT riêng cho billing thuê/CPC
    ADD COLUMN IF NOT EXISTS trach_nhiem_ky_thuat TEXT DEFAULT 'Nội bộ',-- 'Nội bộ' | 'Đối tác ngoài' (chỉ phân loại, không có logic xác minh)
    ADD COLUMN IF NOT EXISTS ten_doi_tac_ky_thuat TEXT,                 -- chỉ dùng khi 'Đối tác ngoài' (VD: BVN)
    ADD COLUMN IF NOT EXISTS ngay_chot_so TEXT,                         -- VD '25' hoặc 'Cuối tháng' — free text tham khảo
    -- 4 field phục vụ in bảng kê (đã chốt: thêm cột thay vì để trống)
    ADD COLUMN IF NOT EXISTS vi_tri_dat_may TEXT,
    ADD COLUMN IF NOT EXISTS nguoi_lien_he TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS ngay_lap_may DATE,
    ADD COLUMN IF NOT EXISTS id_hop_dong_khung UUID;                    -- FK gắn ở bước 2 (sau khi bảng khung tồn tại)

-- CHECK cho trach_nhiem_ky_thuat (ADD CONSTRAINT không có IF NOT EXISTS -> bọc DO)
DO $$ BEGIN
    ALTER TABLE public.soct_khach_hang
        ADD CONSTRAINT chk_khach_hang_trach_nhiem_kt
        CHECK (trach_nhiem_ky_thuat IN ('Nội bộ', 'Đối tác ngoài'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Hợp đồng khung (nhiều máy gộp 1 bảng kê)
CREATE TABLE IF NOT EXISTS public.soct_thue_cpc_hop_dong_khung (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ten_hop_dong TEXT NOT NULL,
    phi_co_ban NUMERIC(15,2) NOT NULL DEFAULT 0,       -- phí cơ bản cố định ở cấp HĐ khung
    vat_thue_cpc NUMERIC(5,2) NOT NULL DEFAULT 8,
    ghi_chu TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- FK soct_khach_hang.id_hop_dong_khung -> soct_thue_cpc_hop_dong_khung (idempotent)
DO $$ BEGIN
    ALTER TABLE public.soct_khach_hang
        ADD CONSTRAINT fk_khach_hang_hop_dong_khung
        FOREIGN KEY (id_hop_dong_khung)
        REFERENCES public.soct_thue_cpc_hop_dong_khung(id)
        ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Counter hàng tháng — màn nhập riêng, độc lập Sổ công tác
CREATE TABLE IF NOT EXISTS public.soct_thue_cpc_counter (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_khach_hang UUID NOT NULL REFERENCES public.soct_khach_hang(id) ON DELETE CASCADE,
    thang_nam TEXT NOT NULL,           -- 'YYYY-MM', cùng format soct_bao_tri.thang_nam
    so_bw BIGINT,                      -- chỉ số công-tơ BW cuối kỳ tháng này
    so_mau BIGINT,                     -- chỉ số công-tơ màu cuối kỳ tháng này
    nguoi_nhap UUID REFERENCES public.soct_users(id) ON DELETE SET NULL,
    ghi_chu TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uniq_thue_cpc_counter UNIQUE (id_khach_hang, thang_nam)
);
CREATE INDEX IF NOT EXISTS idx_thue_cpc_counter_thang ON public.soct_thue_cpc_counter(thang_nam);
CREATE INDEX IF NOT EXISTS idx_thue_cpc_counter_kh ON public.soct_thue_cpc_counter(id_khach_hang);

-- 4. Bảng kê (header)
CREATE TABLE IF NOT EXISTS public.soct_thue_cpc_bk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thang_nam TEXT NOT NULL,
    loai TEXT NOT NULL DEFAULT 'rieng' CHECK (loai IN ('rieng', 'gop')),
    id_khach_hang UUID REFERENCES public.soct_khach_hang(id) ON DELETE SET NULL,                 -- dùng khi loai='rieng'
    id_hop_dong_khung UUID REFERENCES public.soct_thue_cpc_hop_dong_khung(id) ON DELETE SET NULL,-- dùng khi loai='gop'
    tong_truoc_vat NUMERIC(15,2) NOT NULL DEFAULT 0,
    vat_rate NUMERIC(5,2) NOT NULL DEFAULT 8,
    tong_sau_vat NUMERIC(15,2) NOT NULL DEFAULT 0,
    so_hoa_don_ke_toan TEXT,           -- nullable, kế toán ghi sau khi xuất hóa đơn thật
    created_by UUID REFERENCES public.soct_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT chk_bk_loai CHECK (
        (loai = 'rieng' AND id_khach_hang IS NOT NULL) OR
        (loai = 'gop' AND id_hop_dong_khung IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS idx_thue_cpc_bk_thang ON public.soct_thue_cpc_bk(thang_nam);

-- 5. Bảng kê (dòng chi tiết — 1 dòng / máy)
CREATE TABLE IF NOT EXISTS public.soct_thue_cpc_bk_ct (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_bk UUID NOT NULL REFERENCES public.soct_thue_cpc_bk(id) ON DELETE CASCADE,
    id_khach_hang UUID NOT NULL REFERENCES public.soct_khach_hang(id) ON DELETE CASCADE,
    so_bw_dau_ky BIGINT,
    so_bw_cuoi_ky BIGINT,
    so_mau_dau_ky BIGINT,
    so_mau_cuoi_ky BIGINT,
    so_bw_tinh_phi BIGINT NOT NULL DEFAULT 0,
    so_mau_tinh_phi BIGINT NOT NULL DEFAULT 0,
    tien_ban_in NUMERIC(15,2) NOT NULL DEFAULT 0,
    phi_thue_co_dinh NUMERIC(15,2) NOT NULL DEFAULT 0,
    thanh_tien NUMERIC(15,2) NOT NULL DEFAULT 0        -- = tien_ban_in + phi_thue_co_dinh (chưa VAT)
);
CREATE INDEX IF NOT EXISTS idx_thue_cpc_bk_ct_bk ON public.soct_thue_cpc_bk_ct(id_bk);
CREATE INDEX IF NOT EXISTS idx_thue_cpc_bk_ct_kh ON public.soct_thue_cpc_bk_ct(id_khach_hang);

-- 6. RLS: bật chặn anon, KHÔNG tạo policy (giống migration 07 — app chỉ vào qua service role)
ALTER TABLE public.soct_thue_cpc_hop_dong_khung ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_thue_cpc_counter        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_thue_cpc_bk             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_thue_cpc_bk_ct          ENABLE ROW LEVEL SECURITY;


-- MIGRATION 23: Thêm serial máy cho soct_khach_hang.
-- Đặc biệt cần cho máy thuê / CPC; máy thường có thể để trống.
-- Nullable, KHÔNG unique (nhiều máy có thể chưa nhập serial) -> không phá luồng hiện tại.
-- Idempotent.

ALTER TABLE public.soct_khach_hang ADD COLUMN IF NOT EXISTS serial TEXT;
