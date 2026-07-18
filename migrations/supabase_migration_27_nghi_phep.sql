-- MIGRATION 27: Đăng ký nghỉ phép / ốm của KTV (và office role kiêm KTV).
-- KTV tự đăng ký trên app -> tech_admin/admin duyệt. Khác soct_ngay_nghi (nghỉ lễ toàn cty).
-- Chạy trong Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS public.soct_nghi_phep (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.soct_users(id) ON DELETE CASCADE,
    loai TEXT NOT NULL DEFAULT 'phep' CHECK (loai IN ('phep', 'om', 'viec_rieng')),
    tu_ngay DATE NOT NULL,
    den_ngay DATE NOT NULL,
    buoi TEXT NOT NULL DEFAULT 'ca_ngay' CHECK (buoi IN ('ca_ngay', 'sang', 'chieu')),
    so_ngay NUMERIC(4,1) NOT NULL DEFAULT 1,
    ly_do TEXT,
    trang_thai TEXT NOT NULL DEFAULT 'cho_duyet' CHECK (trang_thai IN ('cho_duyet', 'da_duyet', 'tu_choi')),
    nguoi_duyet_id UUID REFERENCES public.soct_users(id) ON DELETE SET NULL,
    ghi_chu_duyet TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    decided_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_nghi_phep_user     ON public.soct_nghi_phep(user_id);
CREATE INDEX IF NOT EXISTS idx_nghi_phep_trang    ON public.soct_nghi_phep(trang_thai);
CREATE INDEX IF NOT EXISTS idx_nghi_phep_khoang   ON public.soct_nghi_phep(tu_ngay, den_ngay);

-- RLS: bật chặn anon, KHÔNG tạo policy (app chỉ vào qua service role)
ALTER TABLE public.soct_nghi_phep ENABLE ROW LEVEL SECURITY;
