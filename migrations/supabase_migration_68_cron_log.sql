-- MIGRATION 68: Nhật ký chạy cron -> KIỂM CHỨNG được cron có "nổ" đúng giờ hay không.
--
-- Trước đây 2 cron (cuon-ngay-phieu, nhac-trang-thai) KHÔNG ghi lại gì mỗi lần chạy nên
-- không có cách nào (ngoài Vercel Dashboard) biết nó đã nổ hay chưa. Bảng này ghi 1 dòng
-- MỖI LẦN endpoint cron được gọi (kể cả khi bỏ qua T7/CN/lễ/ngoài-khung-giờ, và khi lỗi).
--
-- Xem nhanh 20 lần chạy gần nhất của cuốn ngày:
--   SELECT ran_at, source, status, detail FROM soct_cron_log
--   WHERE job = 'cuon-ngay-phieu' ORDER BY ran_at DESC LIMIT 20;
--
-- Dọn log cũ (tuỳ chọn, chạy tay khi cần — bảng tự lớn ~16 dòng/ngày):
--   DELETE FROM soct_cron_log WHERE ran_at < now() - interval '90 days';
--
-- ⚠️ CHẠY SQL. Idempotent.

CREATE TABLE IF NOT EXISTS public.soct_cron_log (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job     text NOT NULL,                       -- 'cuon-ngay-phieu' | 'nhac-trang-thai'
  ran_at  timestamptz NOT NULL DEFAULT now(),  -- thời điểm chạy (so với lịch cron để biết có đúng giờ)
  source  text NOT NULL DEFAULT 'cron',        -- 'cron' (Vercel) | 'manual' (admin bấm nút)
  status  text NOT NULL,                       -- 'ok' | 'skipped' | 'error'
  detail  jsonb                                -- { today, cuon, ton_dong, force } | { reason } | { sent } | { error }
);

-- Tra cứu theo job + mới nhất trước.
CREATE INDEX IF NOT EXISTS idx_soct_cron_log_job_time
  ON public.soct_cron_log (job, ran_at DESC);
