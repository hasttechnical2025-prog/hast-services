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
