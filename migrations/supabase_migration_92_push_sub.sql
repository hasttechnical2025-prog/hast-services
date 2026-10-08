-- MIGRATION 92: Lưu đăng ký Web Push (thông báo trình duyệt) — để báo kthc "có hóa đơn cần xuất".
-- Mỗi trình duyệt/thiết bị 1 dòng (endpoint duy nhất). Xóa user -> xóa đăng ký kèm.
-- Additive/an toàn.

CREATE TABLE IF NOT EXISTS public.soct_push_sub (
  endpoint   TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES public.soct_users(id) ON DELETE CASCADE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_sub_user ON public.soct_push_sub (user_id);
