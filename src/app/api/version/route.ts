import { NextResponse } from 'next/server'
import { getCauHinh } from '@/lib/config'

// Trả về mã build hiện tại để client phát hiện có bản deploy mới -> gợi ý tải lại.
// KHÔNG cache (mỗi deploy trên Vercel có VERCEL_GIT_COMMIT_SHA khác nhau).
// cap_nhat_off: admin tắt thông báo "có bản cập nhật" (khi deploy liên tục) ở Hệ thống.
export const dynamic = 'force-dynamic'

export async function GET() {
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    'dev'
  let cap_nhat_off = false
  try { const cfg = await getCauHinh(); cap_nhat_off = (cfg.thong_bao_cap_nhat ?? '1') === '0' } catch { /* lỗi DB -> coi như bật */ }
  return NextResponse.json(
    { version, cap_nhat_off },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
