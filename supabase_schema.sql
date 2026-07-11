-- SUPABASE DDL SCHEMA FOR TECH-SERVICE APP (SỔ CÔNG TÁC & KHO HÀNG)
-- LƯU Ý QUAN TRỌNG: Tất cả các bảng, trigger, function đều có tiền tố `soct_` để tránh xung đột.

-- =========================================================================
-- 1. BẢNG DANH MỤC & HỆ THỐNG
-- =========================================================================

-- Bảng thông tin nhân viên (liên kết với auth.users)
CREATE TABLE IF NOT EXISTS public.soct_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'tech_admin', 'staff', 'ktv')),
    telegram_id TEXT,
    username TEXT UNIQUE,
    password TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Bảng thông tin khách hàng
CREATE TABLE IF NOT EXISTS public.soct_khach_hang (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ten_khach_hang TEXT NOT NULL,
    dia_chi TEXT NOT NULL,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    km_mac_dinh DOUBLE PRECISION,
    ma_may TEXT UNIQUE, -- Mã máy duy nhất đại diện cho từng điểm lắp đặt
    model TEXT,        -- Model của máy
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Bảng kho hàng
CREATE TABLE IF NOT EXISTS public.soct_kho_hang (
    ma_hang TEXT PRIMARY KEY, -- Ví dụ: AC7A09A, CT200647
    ten_hang TEXT NOT NULL,
    model TEXT,
    hang TEXT,
    ton_kho INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Bảng nhập hàng tháng (kế toán kiểm hóa đơn)
CREATE TABLE IF NOT EXISTS public.soct_nhap_hang_thang (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ma_hang TEXT NOT NULL REFERENCES public.soct_kho_hang(ma_hang) ON DELETE CASCADE,
    thang_nam TEXT NOT NULL, -- Định dạng: YYYY-MM
    so_luong_nhap INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_ma_hang_thang_nam UNIQUE (ma_hang, thang_nam)
);

-- =========================================================================
-- 2. BẢNG ĐẶT HÀNG & HÀNG VỀ
-- =========================================================================

-- ĐẶT HÀNG (model nhiều mã/đơn): soct_dat_hang (header) + soct_dat_hang_ct (dòng)
--   + soct_hang_ve_dot (id_dat_hang_ct) + trigger tồn kho — được tạo ở MIGRATION 06
--   (chạy supabase_migrations_ALL.sql SAU schema.sql). KHÔNG định nghĩa ở đây để tránh
--   tạo nhầm model cũ (1 mã/đơn) rồi bị IF NOT EXISTS bỏ qua bảng đúng.

-- =========================================================================
-- 3. BẢNG GIAO VIỆC & TIÊU HAO VẬT TƯ
-- =========================================================================

-- Bảng sổ công tác chính
CREATE TABLE IF NOT EXISTS public.soct_cong_viec (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ngay DATE NOT NULL DEFAULT CURRENT_DATE,
    ma_may TEXT,
    id_khach_hang UUID NOT NULL REFERENCES public.soct_khach_hang(id) ON DELETE CASCADE,
    loai_cong_viec TEXT NOT NULL,
    km DOUBLE PRECISION NOT NULL DEFAULT 0,
    report TEXT, -- Số phiếu
    so_tien NUMERIC(15, 2) DEFAULT 0, -- Số tiền
    loai_thanh_toan TEXT DEFAULT 'Hóa đơn' CHECK (loai_thanh_toan IN ('Hóa đơn', 'Chưa hóa đơn')),
    ktv_id UUID REFERENCES public.soct_users(id) ON DELETE SET NULL,
    ktv2_id UUID REFERENCES public.soct_users(id) ON DELETE SET NULL, -- kỹ thuật viên kèm (phụ)
    ket_qua TEXT NOT NULL DEFAULT 'Chờ nhận' CHECK (ket_qua IN ('Chờ nhận', 'Đã nhận', 'Đang làm', 'Hoàn thành', 'Lắp tiếp')),
    ghi_chu TEXT,
    counter INT, -- số đếm máy KTV điền
    ghi_chu_ktv TEXT, -- báo cáo tình trạng của KTV
    repeat_call BOOLEAN NOT NULL DEFAULT FALSE,
    telegram_sent BOOLEAN NOT NULL DEFAULT FALSE, -- Cờ báo đã gửi Telegram ở luồng ngoài (chặn Webhook DB bắn trùng)
    created_by UUID REFERENCES public.soct_users(id) ON DELETE SET NULL, -- người tạo phiếu
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Bảng chi tiết các vật tư sử dụng cho ca sửa chữa
CREATE TABLE IF NOT EXISTS public.soct_chi_tiet_vat_tu (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_cong_viec UUID NOT NULL REFERENCES public.soct_cong_viec(id) ON DELETE CASCADE,
    ma_hang TEXT NOT NULL REFERENCES public.soct_kho_hang(ma_hang) ON DELETE CASCADE,
    so_luong INT NOT NULL CHECK (so_luong > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =========================================================================
-- 4. DATABASE TRIGGERS & PL/pgSQL FUNCTIONS
-- =========================================================================

-- TRIGGER 1 (tồn kho khi hàng về) đã CHUYỂN sang MIGRATION 06 theo model nhiều
-- mã/đơn (soct_dat_hang_ct + soct_hang_ve_dot.id_dat_hang_ct). Không định nghĩa ở
-- đây để tránh dùng model cũ. Chạy supabase_migrations_ALL.sql sau schema.sql.

-- -------------------------------------------------------------------------
-- TRIGGER 2: Xử lý KTV hoàn thành công việc và tiêu hao kho
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soct_fn_handle_hoan_thanh_cong_viec()
RETURNS TRIGGER AS $$
DECLARE
    r_vat_tu RECORD;
BEGIN
    -- Chỉ thực hiện khi trạng thái kết quả chuyển sang 'Hoàn thành'
    IF NEW.ket_qua = 'Hoàn thành' AND (OLD.ket_qua IS NULL OR OLD.ket_qua <> 'Hoàn thành') THEN

        -- Duyệt qua tất cả các vật tư đã dùng cho công việc này
        FOR r_vat_tu IN
            SELECT ma_hang, so_luong
            FROM public.soct_chi_tiet_vat_tu
            WHERE id_cong_viec = NEW.id
        LOOP
            -- Trừ tồn kho tương ứng
            UPDATE public.soct_kho_hang
            SET ton_kho = ton_kho - r_vat_tu.so_luong
            WHERE ma_hang = r_vat_tu.ma_hang;
        END LOOP;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tạo trigger 2
CREATE OR REPLACE TRIGGER soct_tr_handle_hoan_thanh_cong_viec
AFTER UPDATE ON public.soct_cong_viec
FOR EACH ROW
EXECUTE FUNCTION public.soct_fn_handle_hoan_thanh_cong_viec();

-- =========================================================================
-- 5. BÁO CÁO NHẬT KÝ KTV & NGÀY NGHỈ LỄ
-- =========================================================================

-- Bảng lưu trữ ngày nghỉ lễ theo quy định (để loại trừ khỏi báo cáo & nhắc nhở)
CREATE TABLE IF NOT EXISTS public.soct_ngay_nghi (
    ngay DATE PRIMARY KEY,
    ghi_chu TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Bảng nhật ký công việc ngoài luồng (việc không tên) của KTV
CREATE TABLE IF NOT EXISTS public.soct_nhat_ky_ktv (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ktv_id UUID NOT NULL REFERENCES public.soct_users(id) ON DELETE CASCADE,
    ngay DATE NOT NULL DEFAULT CURRENT_DATE,
    noi_dung TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nhat_ky_ktv_date ON public.soct_nhat_ky_ktv(ktv_id, ngay);

-- Bảng chốt trạng thái báo cáo ngày của KTV
CREATE TABLE IF NOT EXISTS public.soct_trang_thai_bao_cao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ktv_id UUID NOT NULL REFERENCES public.soct_users(id) ON DELETE CASCADE,
    ngay_bao_cao DATE NOT NULL,
    da_nop BOOLEAN NOT NULL DEFAULT FALSE,
    thoi_gian_nop TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT soct_trang_thai_bao_cao_unique UNIQUE (ktv_id, ngay_bao_cao)
);
CREATE INDEX IF NOT EXISTS idx_tt_bao_cao ON public.soct_trang_thai_bao_cao(ktv_id, ngay_bao_cao);

-- Đăng nhập sinh trắc học (WebAuthn / Passkey - vân tay, Face ID)
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
