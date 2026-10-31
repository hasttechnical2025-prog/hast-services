import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyPassword, hashPassword } from '@/lib/password'
import { setSessionCookie } from '@/lib/session'
import { getSessionMaxAge, isBaoTri, BAO_TRI_MSG } from '@/lib/config'
import { clientIp, isLoginBlocked, recordLoginAttempt, RATE_LIMIT_MSG } from '@/lib/rate-limit'

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json({ error: 'Thiếu tên đăng nhập hoặc mật khẩu' }, { status: 400 })
    }

    // Rate-limit: chặn brute-force (đếm lần SAI theo username/IP trong 15 phút). Fail-open.
    const ip = clientIp(request)
    if (await isLoginBlocked(ip, username)) {
      return NextResponse.json({ error: RATE_LIMIT_MSG }, { status: 429 })
    }

    // Tìm KTV theo username
    const { data, error } = await supabaseAdmin
      .from('soct_users')
      .select('id, full_name, role, telegram_id, password')
      .eq('username', username)
      .eq('role', 'ktv')
      .single()

    if (error || !data) {
      await recordLoginAttempt(ip, username, false)
      return NextResponse.json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác' }, { status: 401 })
    }

    const { valid, needsUpgrade } = verifyPassword(password, data.password)
    if (!valid) {
      await recordLoginAttempt(ip, username, false)
      return NextResponse.json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác' }, { status: 401 })
    }
    await recordLoginAttempt(ip, username, true) // mật khẩu đúng -> reset đếm của username

    // Chế độ bảo trì: KTV luôn bị chặn (chỉ admin được vào)
    if (await isBaoTri()) {
      return NextResponse.json({ error: BAO_TRI_MSG }, { status: 503 })
    }

    // Nâng cấp hash SHA-256 cũ lên scrypt có salt
    if (needsUpgrade) {
      await supabaseAdmin
        .from('soct_users')
        .update({ password: hashPassword(password) })
        .eq('id', data.id)
    }

    await setSessionCookie({ id: data.id, full_name: data.full_name, role: 'ktv' }, await getSessionMaxAge('ktv'))

    return NextResponse.json({
      data: {
        id: data.id,
        full_name: data.full_name,
        role: data.role,
        telegram_id: data.telegram_id,
      },
    })
  } catch (error: any) {
    console.error('Error logging in KTV:', error)
    return NextResponse.json({ error: 'Lỗi hệ thống khi đăng nhập' }, { status: 500 })
  }
}
