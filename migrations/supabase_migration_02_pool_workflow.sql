-- MIGRATION 02: Workflow "pool + nhận việc" cho KTV và đăng nhập QR
-- Chạy trong Supabase SQL Editor. Tất cả đều idempotent (chạy lại không lỗi).

-- 1. Trạng thái hoạt động của nhân viên (dùng để vô hiệu hóa KTV nghỉ việc)
ALTER TABLE public.soct_users
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Token đăng nhập cố định cho QR (mỗi KTV một token; NULL = chưa tạo QR)
--    Token được sinh & thu hồi từ phía ứng dụng (Node crypto), không sinh ở đây.
ALTER TABLE public.soct_users
    ADD COLUMN IF NOT EXISTS login_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS soct_users_login_token_key
    ON public.soct_users (login_token)
    WHERE login_token IS NOT NULL;

-- 3. (Realtime) Không cần bật RLS/publication cho client vì app dùng cơ chế
--    Supabase Realtime "Broadcast" phát từ server sau mỗi thay đổi công việc,
--    client chỉ lắng nghe tín hiệu rồi refetch qua API đã xác thực. Không mở
--    quyền đọc trực tiếp bảng cho anon key -> dữ liệu vẫn kín.
