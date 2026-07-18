-- MIGRATION 09: Doanh số theo tháng (nhập từ kế toán) cho Báo cáo tháng
-- Chạy trong Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS public.soct_doanh_so_thang (
    thang_nam TEXT PRIMARY KEY,               -- YYYY-MM
    thuc_te   NUMERIC(15, 2) NOT NULL DEFAULT 0,  -- Doanh số thực tế (kế toán)
    ke_hoach  NUMERIC(15, 2) NOT NULL DEFAULT 0,  -- Doanh số kế hoạch
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS: chặn anon như các bảng khác (chỉ truy cập qua service role ở API)
ALTER TABLE public.soct_doanh_so_thang ENABLE ROW LEVEL SECURITY;
