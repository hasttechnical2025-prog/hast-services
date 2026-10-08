import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

export const runtime = 'nodejs'

// Lưu đăng ký Web Push của user hiện tại (chỉ kthc — người nhận thông báo hóa đơn).
export async function POST(request: Request) {
  try {
    const session = await requireRole('kthc', 'admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const b = await request.json()
    const sub = b?.subscription
    const endpoint = sub?.endpoint
    const p256dh = sub?.keys?.p256dh
    const auth = sub?.keys?.auth
    if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: 'Thiếu dữ liệu đăng ký' }, { status: 400 })
    const { error } = await supabaseAdmin
      .from('soct_push_sub')
      .upsert({ endpoint, user_id: session.id, p256dh, auth }, { onConflict: 'endpoint' })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error POST push/subscribe:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Hủy đăng ký (theo endpoint).
export async function DELETE(request: Request) {
  try {
    const session = await requireRole('kthc', 'admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const b = await request.json().catch(() => ({}))
    const endpoint = b?.endpoint
    if (!endpoint) return NextResponse.json({ error: 'Thiếu endpoint' }, { status: 400 })
    await supabaseAdmin.from('soct_push_sub').delete().eq('endpoint', endpoint).eq('user_id', session.id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error DELETE push/subscribe:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
