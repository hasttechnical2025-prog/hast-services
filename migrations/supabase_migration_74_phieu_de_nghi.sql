-- MIGRATION 74: Module Phiếu đề nghị chuyển đổi - tháo vật tư - hoàn thiện máy (BM38-NC ĐT.01)
--
-- Quản lý biểu mẫu đề nghị chuyển đổi / tháo vật tư / hoàn thiện máy giữa kho và kỹ thuật.
-- Bảng Master: soct_phieu_de_nghi (thông tin máy, kho, lý do, người ký)
-- Bảng Detail: soct_phieu_de_nghi_ct (hàng xuất ra & hàng nhập lại, tối thiểu 6 dòng khi in)
--
-- Idempotent: chạy lại an toàn trong Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.soct_phieu_de_nghi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    so_phieu TEXT NOT NULL UNIQUE,          -- VD: '5757', '5757A', '5757B', '5758'
    so_phieu_num INT NOT NULL,              -- Phần số nguyên để tự tăng & sort
    so_phieu_sub TEXT DEFAULT '',           -- Hậu tố chữ cái (nếu có: A, B, C...)
    ngay_lap DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Thông tin máy / đối tượng thực hiện
    ten_may TEXT,                           -- Tên hàng / Model
    ma_may TEXT,                            -- Mã hàng / Mã máy
    serial TEXT,                            -- Serial máy
    kho_may TEXT,                           -- Kho máy
    so_px TEXT,                             -- Số phiếu xuất (Số PX)
    ma_kho TEXT,                            -- Mã kho
    so_report TEXT,                         -- Số report
    the_kho TEXT,                           -- Thẻ kho
    ly_do TEXT,                             -- Lý do & Diễn giải

    -- Chữ ký 4 bên (in trên phiếu)
    ky_bgd TEXT DEFAULT 'Nguyễn Nhân',      -- Ban Tổng Giám đốc
    ky_ktt TEXT DEFAULT 'Phạm Thị Phương',  -- Kế toán trưởng
    ky_pkt TEXT DEFAULT 'Trần Kiên',        -- Phòng Kỹ thuật
    nguoi_lap TEXT,                         -- Người lập phiếu

    created_by UUID REFERENCES public.soct_users(id),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phieu_de_nghi_ngay ON public.soct_phieu_de_nghi(ngay_lap DESC);
CREATE INDEX IF NOT EXISTS idx_phieu_de_nghi_so_num ON public.soct_phieu_de_nghi(so_phieu_num DESC, so_phieu_sub DESC);

CREATE TABLE IF NOT EXISTS public.soct_phieu_de_nghi_ct (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phieu_id UUID NOT NULL REFERENCES public.soct_phieu_de_nghi(id) ON DELETE CASCADE,
    loai_hang TEXT NOT NULL CHECK (loai_hang IN ('xuat_ra', 'nhap_lai')),
    stt INT NOT NULL,                       -- Thứ tự dòng 1, 2, 3...
    ten_hang TEXT,
    ma_hang TEXT,
    dvt TEXT DEFAULT 'Cái',
    so_luong INT,
    ghi_chu TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phieu_de_nghi_ct_phieu ON public.soct_phieu_de_nghi_ct(phieu_id, loai_hang, stt);

-- Bật RLS
ALTER TABLE public.soct_phieu_de_nghi    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_phieu_de_nghi_ct ENABLE ROW LEVEL SECURITY;
