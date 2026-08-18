import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// Map "model máy thuê -> mã mực" phục vụ cảnh báo tồn mực dự phòng cho đội máy thuê.
// GET: đọc (admin/tech_admin/staff — để tính cảnh báo ở chuông). POST/DELETE: chỉ admin.

export async function GET() {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const data = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_muc_may_thue')
      .select('id, model_may, ma_hang')
      .order('model_may')
      .range(from, to))
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching muc-may-thue:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Chỉ admin được sửa map mực máy thuê' }, { status: 401 })

    const body = await request.json()
    const model_may = String(body.model_may || '').trim()
    const ma_hang = String(body.ma_hang || '').trim()
    if (!model_may || !ma_hang) return NextResponse.json({ error: 'Thiếu model máy hoặc mã mực' }, { status: 400 })

    const { error } = await supabaseAdmin
      .from('soct_muc_may_thue')
      .upsert({ model_may, ma_hang }, { onConflict: 'model_may,ma_hang', ignoreDuplicates: true })
    // Mã mực chưa có trong kho -> vi phạm FK
    if (error?.code === '23503') return NextResponse.json({ error: `Mã mực "${ma_hang}" chưa có trong kho.` }, { status: 400 })
    if (error) throw error

    await logAudit(session, 'Thêm mực máy thuê', `${model_may} ← ${ma_hang}`)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error adding muc-may-thue:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Chỉ admin được sửa map mực máy thuê' }, { status: 401 })

    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })

    const { error } = await supabaseAdmin.from('soct_muc_may_thue').delete().eq('id', id)
    if (error) throw error
    await logAudit(session, 'Xóa mực máy thuê', `id ${id}`)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting muc-may-thue:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
