import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { verifyPassword, hashPassword } from '@/lib/password'
import { logAudit } from '@/lib/audit'

// Người dùng tự đổi mật khẩu: nhập mật khẩu cũ -> mật khẩu mới -> xác nhận
export async function POST(request: Request) {
  try {
    const session = await requireRole() // bất kỳ ai đã đăng nhập
    if (!session) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const { old_password, new_password } = await request.json()
    if (!old_password || !new_password) {
      return NextResponse.json({ error: 'Thiếu mật khẩu cũ hoặc mới' }, { status: 400 })
    }
    if (String(new_password).length < 6) {
      return NextResponse.json({ error: 'Mật khẩu mới tối thiểu 6 ký tự' }, { status: 400 })
    }

    const { data: user } = await supabaseAdmin
      .from('soct_users')
      .select('password')
      .eq('id', session.id)
      .single()

    const { valid } = verifyPassword(old_password, user?.password)
    if (!valid) return NextResponse.json({ error: 'Mật khẩu cũ không đúng' }, { status: 400 })

    const { error } = await supabaseAdmin
      .from('soct_users')
      .update({ password: hashPassword(new_password) })
      .eq('id', session.id)

    if (error) throw error
    await logAudit(session, 'Đổi mật khẩu')
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error changing password:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
