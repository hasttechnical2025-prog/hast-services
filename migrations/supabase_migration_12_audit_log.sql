-- MIGRATION 12: Audit log (nhật ký thao tác) cho admin theo dõi
-- Chạy trong Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS public.soct_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id   UUID,
    user_name TEXT,
    user_role TEXT,
    action    TEXT NOT NULL,
    detail    TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.soct_audit_log(created_at DESC);

-- RLS: chặn anon như các bảng khác
ALTER TABLE public.soct_audit_log ENABLE ROW LEVEL SECURITY;
