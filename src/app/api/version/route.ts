import { NextResponse } from 'next/server'

// Trả về mã build hiện tại để client phát hiện có bản deploy mới -> gợi ý tải lại.
// KHÔNG cache (mỗi deploy trên Vercel có VERCEL_GIT_COMMIT_SHA khác nhau).
export const dynamic = 'force-dynamic'

export async function GET() {
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    'dev'
  return NextResponse.json(
    { version },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
