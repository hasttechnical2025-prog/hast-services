-- MIGRATION 78: Lệnh xuất hàng (phòng kinh doanh) — Pha 1 NỀN (data model + cờ quản lý).
-- An toàn/additive: chưa code nào đọc các cột/bảng này -> chạy trước, không ảnh hưởng app đang chạy.
-- Xem SPEC: docs/lenh-xuat-hang-spec.md
--
-- Thiết kế: BẢNG RIÊNG (không nhét vào soct_cong_viec) nhưng MIRROR lớp hóa đơn để Kanban
-- UNION 2 nguồn + PUT dispatch đúng bảng. Khách lưu SNAPSHOT trên lệnh (sales bán cho khách
-- có thể không phải điểm máy) + link tùy chọn id_khach_hang. Gán 1 NV (nguoi_kinh_doanh_id).
-- Tồn kho: Pha 1 CHƯA đụng (để sau, tránh rủi ro) — dòng hàng chỉ phục vụ hóa đơn/xuất Excel.

-- 1. Cờ "quản lý kinh doanh" (sale_admin) trên user. kinh_doanh + cờ = sale_admin; không cờ = NV.
ALTER TABLE public.soct_users
  ADD COLUMN IF NOT EXISTS kd_quan_ly BOOLEAN NOT NULL DEFAULT false;

-- 2. Master lệnh xuất
CREATE TABLE IF NOT EXISTS public.soct_lenh_xuat (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  so_lenh           TEXT,                                  -- số lệnh nội bộ (tùy chọn)
  ngay              DATE NOT NULL DEFAULT (timezone('Asia/Ho_Chi_Minh', now())::date),
  -- Khách (snapshot; link tùy chọn tới điểm máy nếu có)
  id_khach_hang     UUID REFERENCES public.soct_khach_hang(id) ON DELETE SET NULL,
  ten_khach_hang    TEXT NOT NULL,
  dia_chi           TEXT,
  ma_so_thue        TEXT,
  -- Gán NV kinh doanh + người lập
  nguoi_kinh_doanh_id UUID REFERENCES public.soct_users(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES public.soct_users(id) ON DELETE SET NULL,
  ghi_chu           TEXT,
  -- Lớp hóa đơn (mirror soct_cong_viec để dùng chung Kanban/công nợ)
  trang_thai_hd     TEXT NOT NULL DEFAULT 'Chờ xuất HĐ',
  so_hoa_don        TEXT,
  ngay_xuat_hd      DATE,
  nguoi_xuat_hd     UUID REFERENCES public.soct_users(id) ON DELETE SET NULL,
  ban_giao_kt_luc   TIMESTAMPTZ,
  thanh_toan_luc    TIMESTAMPTZ,
  tach_rieng        BOOLEAN NOT NULL DEFAULT false,
  lam_tron          NUMERIC,
  ten_khach_hd      TEXT,
  minvoice_luc      TIMESTAMPTZ,
  minvoice_lan      INT NOT NULL DEFAULT 0,
  dntt_luc          TIMESTAMPTZ,
  so_dntt           TEXT,
  dntt_lan          INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_lenh_xuat_nvkd    ON public.soct_lenh_xuat(nguoi_kinh_doanh_id);
CREATE INDEX IF NOT EXISTS idx_lenh_xuat_tthd    ON public.soct_lenh_xuat(trang_thai_hd);
CREATE INDEX IF NOT EXISTS idx_lenh_xuat_sohd    ON public.soct_lenh_xuat(so_hoa_don);

-- 3. Chi tiết dòng hàng của lệnh (đủ trường để dựng 32 cột M-invoice như vật tư kỹ thuật)
CREATE TABLE IF NOT EXISTS public.soct_lenh_xuat_ct (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lenh_id       UUID NOT NULL REFERENCES public.soct_lenh_xuat(id) ON DELETE CASCADE,
  stt           INT,
  ma_hang       TEXT,
  ten_hang      TEXT,
  ten_hang_hd   TEXT,                                      -- tên in trên hóa đơn (override)
  dvt           TEXT DEFAULT 'Cái',
  so_luong      NUMERIC(15,2) NOT NULL DEFAULT 0,
  don_gia       NUMERIC(15,2) NOT NULL DEFAULT 0,
  vat           NUMERIC(5,2)  NOT NULL DEFAULT 0,
  thanh_tien    NUMERIC(15,2) NOT NULL DEFAULT 0,          -- = don_gia * so_luong (chưa VAT)
  ghi_chu       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lenh_xuat_ct_lenh ON public.soct_lenh_xuat_ct(lenh_id);
