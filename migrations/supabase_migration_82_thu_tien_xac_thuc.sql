-- MIGRATION 82: Thu tiền + XÁC THỰC (chống biển thủ) — Pha 2 Lệnh xuất hàng.
-- Bảng ghi TỪNG KHOẢN thu (khác soct_hd_thu cộng dồn). NV kinh doanh khai khoản thu/đặt cọc
-- -> kthc DUYỆT (đã cầm cash nộp quỹ) -> mới tính vào "đã thu"/công nợ.
-- An toàn/additive: CHỈ phục vụ luồng KINH DOANH (soct_lenh_xuat). Luồng KỸ THUẬT (soct_cong_viec)
-- GIỮ NGUYÊN soct_hd_thu — KHÔNG đụng cách tính công nợ kỹ thuật đang chạy.
--
-- QUAN TRỌNG: đặt cọc xác nhận từ CỘT 2 (Đang xử lý HĐ) — lúc đó CHƯA có số HĐ (số HĐ chỉ cấp
-- khi sang cột 3). Nên bảng NEO theo lenh_id (không thể chỉ neo so_hoa_don như soct_hd_thu).
-- so_hoa_don để trống lúc đặt cọc, điền sau khi lên HĐ (đối chiếu/gom báo cáo).

CREATE TABLE IF NOT EXISTS public.soct_thu_tien (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Neo theo lệnh (nguồn kinh doanh). Xóa lệnh -> xóa khoản thu kèm.
  lenh_id       UUID REFERENCES public.soct_lenh_xuat(id) ON DELETE CASCADE,
  nguon         TEXT NOT NULL DEFAULT 'lenh_xuat',        -- 'lenh_xuat' (Pha 2); để mở cho 'cong_viec' sau
  so_hoa_don    TEXT,                                     -- điền khi đã lên HĐ (đối chiếu), NULL lúc đặt cọc
  so_tien       NUMERIC(15,2) NOT NULL DEFAULT 0,
  loai          TEXT NOT NULL DEFAULT 'thanh_toan',       -- 'dat_coc' | 'thanh_toan'
  trang_thai    TEXT NOT NULL DEFAULT 'cho_duyet',        -- 'cho_duyet' | 'da_duyet'
  nguoi_ghi     UUID REFERENCES public.soct_users(id) ON DELETE SET NULL,   -- NV kinh doanh khai
  nguoi_duyet   UUID REFERENCES public.soct_users(id) ON DELETE SET NULL,   -- kthc duyệt
  duyet_luc     TIMESTAMPTZ,
  ghi_chu       TEXT,
  thoi_diem     TIMESTAMPTZ NOT NULL DEFAULT now(),       -- thời điểm khai/thu
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_thu_tien_lenh   ON public.soct_thu_tien(lenh_id);
CREATE INDEX IF NOT EXISTS idx_thu_tien_tthai  ON public.soct_thu_tien(trang_thai);
CREATE INDEX IF NOT EXISTS idx_thu_tien_sohd   ON public.soct_thu_tien(so_hoa_don);

ALTER TABLE public.soct_thu_tien ENABLE ROW LEVEL SECURITY;
