-- MIGRATION 87: Danh mục KHÁCH HÀNG của phòng Kinh doanh (Lệnh xuất hàng).
-- Additive/an toàn. Tách RIÊNG khỏi khách kỹ thuật (soct_khach_hang) để không làm bẩn
-- luồng máy/cụm/bảo trì. Lệnh xuất vẫn lưu SNAPSHOT khách (tên/địa chỉ/MST/email) + link tùy chọn.
--
-- Chính sách phân quyền do ADMIN cấu hình (soct_cau_hinh):
--   kd_khach_pham_vi  = rieng (mặc định) | saleadmin_all | chung
--   kd_khach_quyen_sua = chu_so_huu (mặc định) | chi_sale_admin
-- MST là DUY NHẤT toàn hệ thống (1 khách = 1 chủ KD); trừ MST trống (khách lẻ) — kiểm ở tầng API.

-- 1. Bảng danh mục khách KD
CREATE TABLE IF NOT EXISTS public.soct_kh_kinh_doanh (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ten_khach_hang TEXT NOT NULL,
  dia_chi        TEXT,
  ma_so_thue     TEXT,                                   -- duy nhất toàn hệ thống (kiểm ở API, trừ trống)
  email_nhan_hd  TEXT,                                   -- email nhận hóa đơn điện tử (kế toán gửi)
  so_hop_dong    TEXT,
  ghi_chu        TEXT,
  nguoi_tao_id   UUID REFERENCES public.soct_users(id) ON DELETE SET NULL,  -- chủ sở hữu (cho phạm vi "riêng")
  nguon_cum_ma   TEXT,                                   -- nếu copy từ khách CỤM kỹ thuật -> mã cụm nguồn (truy vết)
  an             BOOLEAN NOT NULL DEFAULT false,         -- soft-delete: true = ẩn khỏi ô chọn (lệnh cũ vẫn giữ snapshot)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_kh_kd_nguoi_tao ON public.soct_kh_kinh_doanh(nguoi_tao_id);
CREATE INDEX IF NOT EXISTS idx_kh_kd_mst       ON public.soct_kh_kinh_doanh(ma_so_thue);
CREATE INDEX IF NOT EXISTS idx_kh_kd_an        ON public.soct_kh_kinh_doanh(an);

-- 2. Liên kết lệnh xuất -> khách KD + email snapshot
ALTER TABLE public.soct_lenh_xuat
  ADD COLUMN IF NOT EXISTS id_kh_kinh_doanh UUID REFERENCES public.soct_kh_kinh_doanh(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_nhan_hd    TEXT;

-- 3. Cấu hình chính sách mặc định (không ghi đè nếu đã có)
INSERT INTO public.soct_cau_hinh (khoa, gia_tri) VALUES
  ('kd_khach_pham_vi', 'rieng'),
  ('kd_khach_quyen_sua', 'chu_so_huu')
ON CONFLICT (khoa) DO NOTHING;
