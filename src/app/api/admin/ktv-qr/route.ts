import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

// Sinh / lấy / tạo lại token đăng nhập QR cho một KTV (chỉ admin).
// - Chưa có token và regenerate không đặt -> sinh token mới.
// - regenerate = true -> luôn sinh token mới (thu hồi QR cũ).
// - Đã có token và không regenerate -> trả token hiện tại.
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const { id, regenerate } = await request.json()
    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID nhân viên' }, { status: 400 })
    }

    const { data: user, error: findErr } = await supabaseAdmin
      .from('soct_users')
      .select('id, role, login_token')
      .eq('id', id)
      .single()

    if (findErr || !user) {
      return NextResponse.json({ error: 'Không tìm thấy nhân viên' }, { status: 404 })
    }
    if (user.role !== 'ktv') {
      return NextResponse.json({ error: 'Chỉ tạo QR đăng nhập cho tài khoản KTV' }, { status: 400 })
    }

    let token = user.login_token
    if (!token || regenerate) {
      token = crypto.randomBytes(24).toString('hex')
      const { error: updErr } = await supabaseAdmin
        .from('soct_users')
        .update({ login_token: token })
        .eq('id', id)
      if (updErr) throw updErr
    }

    // Dùng đúng origin mà admin đang truy cập (localhost / IP LAN / domain prod)
    // để QR trỏ về đúng nơi -> test được ở local mà không cần đổi env.
    const appUrl = new URL(request.url).origin
    const enrollUrl = `${appUrl}/api/ktv/enroll?token=${token}`

    return NextResponse.json({ data: { token, enrollUrl } })
  } catch (error: any) {
    console.error('Error generating KTV QR token:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
