import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { broadcastJobsChanged } from '@/lib/realtime'

// POST: Khóa / mở khóa phiếu ở Cột 1 Kanban ("tôi đang làm dở, đừng động").
// Body: { ids: string[], action: 'khoa' | 'mo' }
// Chỉ thao tác trên phiếu đang ở Cột 1 (Chờ xuất HĐ). Mở khóa: chủ phiếu hoặc admin.
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff', 'kthc')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const { ids, action } = await request.json()
    if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: 'Thiếu phiếu' }, { status: 400 })
    if (action !== 'khoa' && action !== 'mo') return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 })

    // Chỉ khóa/mở phiếu CÒN ở Cột 1 (Chờ xuất HĐ).
    const { data: rows } = await supabaseAdmin
      .from('soct_cong_viec')
      .select('id, khoa_boi, trang_thai_hd')
      .in('id', ids)
    const col1 = (rows || []).filter((r: any) => r.trang_thai_hd === 'Chờ xuất HĐ')
    if (col1.length === 0) return NextResponse.json({ error: 'Phiếu không còn ở cột Chờ xuất HĐ.' }, { status: 400 })
    const col1Ids = col1.map((r: any) => r.id)

    // Phiếu đang bị người KHÁC khóa -> chỉ admin được chiếm/mở (chủ phiếu tự mở được của mình).
    const other = col1.find((r: any) => r.khoa_boi && r.khoa_boi !== session.id)
    if (other && session.role !== 'admin') {
      const { data: u } = await supabaseAdmin.from('soct_users').select('full_name').eq('id', other.khoa_boi).single()
      const ten = u?.full_name || 'người khác'
      return NextResponse.json({ error: `Phiếu đang được ${ten} khóa — chỉ ${ten} hoặc admin mới mở được.` }, { status: 403 })
    }

    if (action === 'khoa') {
      await supabaseAdmin
        .from('soct_cong_viec')
        .update({ khoa_boi: session.id, khoa_luc: new Date(Date.now() + 7 * 3600 * 1000).toISOString() })
        .in('id', col1Ids)
    } else {
      await supabaseAdmin
        .from('soct_cong_viec')
        .update({ khoa_boi: null, khoa_luc: null })
        .in('id', col1Ids)
    }

    await broadcastJobsChanged()
    return NextResponse.json({ success: true, count: col1Ids.length })
  } catch (error: any) {
    console.error('Error khoa/mo kanban:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
