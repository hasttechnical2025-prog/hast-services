import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/session'

// Đăng xuất: xóa cookie phiên
export async function POST() {
  await clearSessionCookie()
  return NextResponse.json({ success: true })
}
