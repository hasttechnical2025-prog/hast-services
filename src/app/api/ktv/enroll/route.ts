import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { setSessionCookie, KTV_LONG_MAX_AGE_SECONDS } from '@/lib/session'

// KTV quét QR -> mở URL này -> đổi login_token lấy phiên dài hạn rồi chuyển sang /ktv.
// Token cố định, dùng lại được; thu hồi bằng is_active=false hoặc tạo lại token.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token = searchParams.get('token')

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/ktv?enroll_error=${encodeURIComponent(reason)}`, origin))

  if (!token) return fail('Thiếu mã QR')

  try {
    const { data: user, error } = await supabaseAdmin
      .from('soct_users')
      .select('id, full_name, role, is_active')
      .eq('login_token', token)
      .single()

    if (error || !user || user.role !== 'ktv') {
      return fail('Mã QR không hợp lệ')
    }
    if (user.is_active === false) {
      return fail('Tài khoản đã ngừng hoạt động')
    }

    // Đặt cookie phiên dài hạn rồi chuyển vào app KTV
    await setSessionCookie(
      { id: user.id, full_name: user.full_name, role: 'ktv' },
      KTV_LONG_MAX_AGE_SECONDS
    )

    return NextResponse.redirect(new URL('/ktv', origin))
  } catch (err: any) {
    console.error('Error enrolling KTV via QR:', err)
    return fail('Lỗi hệ thống khi đăng nhập')
  }
}
