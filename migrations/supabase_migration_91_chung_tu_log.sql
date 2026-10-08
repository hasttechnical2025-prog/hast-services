-- MIGRATION 91: Nhật ký xuất chứng từ theo phiếu (BBBG / BBGĐ) — để biết đã xuất mẫu nào, ai, lúc nào.
-- Mỗi lần xuất 1 chứng từ ghi 1 dòng. Hiển thị ✓ (mẫu đã xuất) + lịch sử trong menu xuất của từng phiếu.
-- Additive/an toàn. Xóa phiếu -> xóa log kèm (ON DELETE CASCADE).

CREATE TABLE IF NOT EXISTS public.soct_chung_tu_log (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id     UUID NOT NULL REFERENCES public.soct_cong_viec(id) ON DELETE CASCADE,
  loai       TEXT NOT NULL,            -- 'BBBG' | 'BBGD'
  mau        TEXT,                     -- key mẫu (vd 'chung_co_gia', 'bm26')
  mau_label  TEXT,                     -- nhãn hiển thị
  nguoi_id   UUID,
  nguoi_ten  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chung_tu_log_job ON public.soct_chung_tu_log (job_id, created_at DESC);
