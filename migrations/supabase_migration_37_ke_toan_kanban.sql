-- MIGRATION 37: Triển khai Kanban Kế Toán
-- Chạy trong Supabase SQL Editor. Idempotent.

-- 1. Cập nhật CHECK constraint cho cột role của bảng soct_users để chấp nhận 'kthc'
DO $$
DECLARE
    constraint_name text;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'soct_users'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%role%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.soct_users DROP CONSTRAINT ' || quote_ident(constraint_name);
    END IF;
END $$;

ALTER TABLE public.soct_users
    ADD CONSTRAINT soct_users_role_check CHECK (role IN ('admin', 'tech_admin', 'staff', 'ktv', 'kthc'));

-- 2. Thêm các cột cho soct_khach_hang
ALTER TABLE public.soct_khach_hang
    ADD COLUMN IF NOT EXISTS ma_so_thue TEXT,
    ADD COLUMN IF NOT EXISTS email_ke_toan TEXT;

-- 3. Thêm cột so_hoa_don cho soct_cong_viec
ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS so_hoa_don TEXT;
