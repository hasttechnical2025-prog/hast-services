-- Migration 103: Rate-limit đăng nhập (chống dò mật khẩu brute-force).
-- Bảng đếm số lần thử; route login đếm lần SAI trong 15 phút -> vượt ngưỡng thì trả 429.
-- Chỉ service_role dùng (qua /api/*/login) -> bật RLS deny-all như các bảng khác.

CREATE TABLE IF NOT EXISTS public.soct_login_attempts (
  id          bigserial PRIMARY KEY,
  ip          text,
  username    text,
  thanh_cong  boolean NOT NULL DEFAULT false,   -- true = đăng nhập đúng (không tính vào ngưỡng)
  tao_luc     timestamptz NOT NULL DEFAULT now()
);

-- Index phục vụ đếm theo username / ip trong cửa sổ thời gian.
CREATE INDEX IF NOT EXISTS idx_login_attempts_user ON public.soct_login_attempts (username, tao_luc);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip   ON public.soct_login_attempts (ip, tao_luc);

ALTER TABLE public.soct_login_attempts ENABLE ROW LEVEL SECURITY;  -- deny-all (service_role bỏ qua)
