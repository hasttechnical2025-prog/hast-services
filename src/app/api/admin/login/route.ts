import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyPassword, hashPassword } from '@/lib/password'
import { setSessionCookie, type Role } from '@/lib/session'
import { getSessionMaxAge } from '@/lib/config'
import { logAudit } from '@/lib/audit'

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json({ error: 'Thiếu tên đăng nhập hoặc mật khẩu' }, { status: 400 })
    }

    // Tìm user theo username với quyền admin/tech_admin/staff
    const { data, error } = await supabaseAdmin
      .from('soct_users')
      .select('id, full_name, role, password')
      .eq('username', username)
      .in('role', ['admin', 'tech_admin', 'staff'])
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác' }, { status: 401 })
    }

    const { valid, needsUpgrade } = verifyPassword(password, data.password)
    if (!valid) {
      return NextResponse.json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác' }, { status: 401 })
    }

    // Nâng cấp hash SHA-256 cũ lên scrypt có salt
    if (needsUpgrade) {
      await supabaseAdmin
        .from('soct_users')
        .update({ password: hashPassword(password) })
        .eq('id', data.id)
    }

    const user = { id: data.id, full_name: data.full_name, role: data.role as Role }
    await setSessionCookie(user, await getSessionMaxAge('van_phong'))
    await logAudit(user, 'Đăng nhập', `@${username}`)

    return NextResponse.json({ data: user })
  } catch (error: any) {
    console.error('Error logging in admin:', error)
    return NextResponse.json({ error: 'Lỗi hệ thống khi đăng nhập' }, { status: 500 })
  }
}
