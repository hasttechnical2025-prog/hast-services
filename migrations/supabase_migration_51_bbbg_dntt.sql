-- MIGRATION 51: Xuất Biên bản bàn giao (BBBG) + Đề nghị thanh toán (ĐNTT) từ app.
--
-- Badge "đã xuất": bbbg_luc / dntt_luc (timestamptz, mốc lần xuất gần nhất). so_dntt: số ĐNTT
-- đã cấp cho phiếu (giữ nguyên khi xuất lại). Số ĐNTT tự tăng theo NĂM: dạng "{YY}-{seq}/ĐNTT-ST".
--
-- Idempotent. Chạy trong Supabase SQL Editor.

ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS bbbg_luc TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS dntt_luc TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS so_dntt  TEXT;

-- Bộ đếm số ĐNTT theo năm (mỗi năm 1 dãy, tăng dần).
CREATE TABLE IF NOT EXISTS public.soct_dntt_seq (
    nam INT PRIMARY KEY,
    seq INT NOT NULL DEFAULT 0
);

-- Cấp số kế tiếp cho năm (atomic). Trả về seq mới.
CREATE OR REPLACE FUNCTION public.next_dntt_seq(p_nam INT) RETURNS INT AS $$
    INSERT INTO public.soct_dntt_seq (nam, seq) VALUES (p_nam, 1)
    ON CONFLICT (nam) DO UPDATE SET seq = soct_dntt_seq.seq + 1
    RETURNING seq;
$$ LANGUAGE sql;
