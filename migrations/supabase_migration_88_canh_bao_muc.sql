-- MIGRATION 88: Cảnh báo máy thuê SẮP HẾT MỰC (ước lượng theo counter / định lượng).
-- Additive/an toàn. Mô hình "chia dư": còn lại = định lượng - (counter MOD định lượng);
-- cảnh báo khi còn lại <= ngưỡng (config muc_canh_bao_con_trang, mặc định 2000 trang).

-- 1. Định lượng (số trang/hộp) + loại (BW/Màu) cho từng mã mực trong map model->mực.
--    loai: 'bw' -> tính theo counter so_bw; 'mau' -> theo so_mau.
ALTER TABLE public.soct_muc_may_thue
  ADD COLUMN IF NOT EXISTS dinh_luong INT,
  ADD COLUMN IF NOT EXISTS loai TEXT NOT NULL DEFAULT 'bw';

-- 2. Đánh dấu "đã gửi mực" (ack) theo chu kỳ hộp. so_hop = floor(counter/định lượng).
--    Tắt cảnh báo cho máy+mực ở chu kỳ đó tới khi sang hộp kế (so_hop tăng).
CREATE TABLE IF NOT EXISTS public.soct_muc_canh_bao_ack (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ma_may      TEXT NOT NULL,
  ma_muc      TEXT NOT NULL,
  so_hop      INT  NOT NULL,                              -- chu kỳ hộp đã xử lý
  nguoi_ack   UUID REFERENCES public.soct_users(id) ON DELETE SET NULL,
  acked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ma_may, ma_muc, so_hop)
);
CREATE INDEX IF NOT EXISTS idx_muc_ack_may ON public.soct_muc_canh_bao_ack(ma_may);

-- 3. Ngưỡng cảnh báo (số trang còn lại của hộp hiện tại).
INSERT INTO public.soct_cau_hinh (khoa, gia_tri) VALUES
  ('muc_canh_bao_con_trang', '2000')
ON CONFLICT (khoa) DO NOTHING;
