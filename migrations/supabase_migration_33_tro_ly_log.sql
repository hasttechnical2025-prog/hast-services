-- MIGRATION 33: Nhật ký câu hỏi Trợ lý AI — để admin biết user hỏi gì, và tìm các
-- câu "trượt" (không ra kết quả / none) mà bổ sung biệt danh hoặc tool.
-- Chạy trong Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS public.soct_tro_ly_log (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cau_hoi    TEXT NOT NULL,
    tool       TEXT,                -- tool được chọn: tonKho/datHang/congNo/giamDinh/baoTri/thueCpc/none
    so_ket_qua INT,                 -- số dòng kết quả (0 = trượt / không tìm thấy)
    nguoi_hoi  TEXT,                -- tên người hỏi
    role       TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tro_ly_log_created ON public.soct_tro_ly_log(created_at DESC);
