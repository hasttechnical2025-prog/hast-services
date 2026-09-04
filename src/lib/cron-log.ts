import { supabaseAdmin } from './supabase-admin'

// Ghi 1 dòng nhật ký mỗi lần một endpoint cron chạy (migration 68). BEST-EFFORT: nuốt mọi lỗi
// -> việc ghi log KHÔNG bao giờ được làm hỏng cron. Dùng để kiểm chứng cron có nổ đúng giờ.
export async function logCronRun(
  job: 'cuon-ngay-phieu' | 'nhac-trang-thai',
  status: 'ok' | 'skipped' | 'error',
  source: 'cron' | 'manual',
  detail?: Record<string, any>,
): Promise<void> {
  try {
    await supabaseAdmin.from('soct_cron_log').insert({ job, status, source, detail: detail ?? null })
  } catch (e) {
    console.error('logCronRun failed', e)
  }
}
