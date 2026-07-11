import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'

// Trạng thái sinh trắc học của tài khoản đang đăng nhập: đã đăng ký bao nhiêu khóa.
export async function GET() {
  try {
    const session = await requireRole()
    if (!session) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    const { count } = await supabaseAdmin
      .from('soct_webauthn_credentials')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.id)
    return NextResponse.json({ count: count || 0 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Gỡ TOÀN BỘ khóa sinh trắc học của tài khoản (tắt đăng nhập vân tay/Face ID cho account này).
export async function DELETE() {
  try {
    const session = await requireRole()
    if (!session) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    const { error } = await supabaseAdmin.from('soct_webauthn_credentials').delete().eq('user_id', session.id)
    if (error) throw error
    await logAudit(session, 'Gỡ đăng nhập sinh trắc học (Passkey)')
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
