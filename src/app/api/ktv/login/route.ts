import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import crypto from 'crypto'

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json({ error: 'Thiếu tên đăng nhập hoặc mật khẩu' }, { status: 400 })
    }

    // Mã hóa mật khẩu gửi lên để so khớp với DB
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex')

    // Tìm KTV trong DB
    const { data, error } = await supabaseAdmin
      .from('soct_users')
      .select('id, full_name, role, telegram_id')
      .eq('username', username)
      .eq('password', hashedPassword)
      .eq('role', 'ktv')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác' }, { status: 401 })
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error logging in KTV:', error)
    return NextResponse.json({ error: 'Lỗi hệ thống khi đăng nhập' }, { status: 500 })
  }
}
