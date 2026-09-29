-- MIGRATION 86: "Báo cáo gửi khách" — KTV báo THÔ khi Hoàn thành việc Sửa máy, office gọt + copy gửi Zalo/Email.
-- KTV chỉ tạo bản thô (chips + ghi chú); office xem ở tab Sổ công tác › Báo cáo gửi khách, Copy rồi đánh dấu Đã gửi.
CREATE TABLE IF NOT EXISTS public.soct_bao_cao_khach (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_cong_viec  UUID NOT NULL REFERENCES public.soct_cong_viec(id) ON DELETE CASCADE,
  noi_dung      TEXT,                                  -- bản thô KTV: chips (câu đầy đủ) + ghi chú
  trang_thai    TEXT NOT NULL DEFAULT 'cho_gui',       -- 'cho_gui' | 'da_gui'
  nguoi_tao     UUID REFERENCES public.soct_users(id) ON DELETE SET NULL,   -- KTV
  nguoi_gui     UUID REFERENCES public.soct_users(id) ON DELETE SET NULL,   -- office đánh dấu đã gửi
  da_gui_luc    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 1 phiếu = 1 báo cáo (KTV bấm lại thì cập nhật nội dung).
CREATE UNIQUE INDEX IF NOT EXISTS uq_bao_cao_khach_cv ON public.soct_bao_cao_khach(id_cong_viec);
CREATE INDEX IF NOT EXISTS idx_bao_cao_khach_tt ON public.soct_bao_cao_khach(trang_thai);

ALTER TABLE public.soct_bao_cao_khach ENABLE ROW LEVEL SECURITY;
