-- Migration 102: Bật RLS (deny-all) trên MỌI bảng soct_ chưa bật.
--
-- LÝ DO: NEXT_PUBLIC_SUPABASE_ANON_KEY lộ công khai trong bundle trình duyệt. Bảng nào
-- CHƯA bật RLS thì bất kỳ ai có anon key đều query thẳng được qua PostgREST (đọc/ghi dữ
-- liệu khách, tài chính...). RLS bật mà KHÔNG có policy = TỪ CHỐI TOÀN BỘ với vai trò
-- anon + authenticated (deny-all).
--
-- AN TOÀN: app CHỈ truy cập DB bằng service_role (bỏ qua RLS) qua các route /api/*; client
-- chỉ dùng anon key để NGHE realtime broadcast (không đọc bảng). Nên bật RLS KHÔNG ảnh hưởng
-- app. Realtime broadcast cũng không phụ thuộc RLS bảng.
--
-- IDEMPOTENT: chỉ đụng bảng relrowsecurity=false; chạy lại nhiều lần vô hại. KHÔNG tạo/xóa
-- policy nào -> không đụng các cấp quyền đã cố ý cấu hình trước đó.

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'                    -- chỉ bảng thường (không view)
      AND c.relname LIKE 'soct\_%'
      AND c.relrowsecurity = false           -- chỉ bảng CHƯA bật
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t.relname);
    RAISE NOTICE 'RLS da bat (deny-all): %', t.relname;
  END LOOP;
END $$;

-- Kiểm tra sau khi chạy (phải trả về 0 dòng = đã phủ hết):
--   SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--   WHERE n.nspname='public' AND c.relkind='r' AND relname LIKE 'soct\_%' AND relrowsecurity=false;
