import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { broadcastJobsChanged, broadcastCongNoChanged } from '@/lib/realtime'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// PUT: lưu THỨ TỰ dòng vật tư (kéo-thả ở modal cột "Chờ lên hóa đơn").
// Body: { ticket_ids: string[], order: string[] } — order = danh sách khóa nhóm `${ma_hang}_${don_gia}`
// theo thứ tự MỚI (danh sách modal đã gộp dòng trùng mã+giá). Ghi thu_tu = vị trí nhóm cho mọi dòng gốc.
// Chỉ khi phiếu CÒN ở "Chờ xuất HĐ" (khóa sau khi bàn giao kế toán, như sửa tên/giá).

const keyOf = (ma: any, gia: any) => `${String(ma ?? '')}_${Number(gia) || 0}`

async function lockedTickets(ticketIds: string[]): Promise<string | null> {
  if (ticketIds.length === 0) return null
  const { data, error } = await supabaseAdmin
    .from('soct_cong_viec').select('id, report, trang_thai_hd').in('id', ticketIds)
  if (error) throw error
  const locked = (data || []).filter((t: any) => t.trang_thai_hd !== 'Chờ xuất HĐ')
  if (locked.length === 0) return null
  const rep = locked.map((t: any) => t.report || t.id).slice(0, 3).join(', ')
  return `Phiếu đã chuyển sang kế toán — không đổi thứ tự được (${rep}${locked.length > 3 ? '…' : ''}). Kéo thẻ về cột "Chờ lên hóa đơn" trước.`
}

export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const body = await request.json()
    const ids: string[] = Array.isArray(body.ticket_ids) ? body.ticket_ids.filter(Boolean) : []
    const order: string[] = Array.isArray(body.order) ? body.order.map(String) : []
    if (ids.length === 0 || order.length === 0) return NextResponse.json({ error: 'Thiếu phiếu / thứ tự' }, { status: 400 })

    const lockMsg = await lockedTickets(ids)
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 409 })

    const { data: lines, error } = await supabaseAdmin
      .from('soct_chi_tiet_vat_tu').select('id, ma_hang, don_gia').in('id_cong_viec', ids)
    if (error) throw error

    for (const l of (lines || []) as any[]) {
      let ord = order.indexOf(keyOf(l.ma_hang, l.don_gia))
      if (ord < 0) ord = order.length // nhóm lạ (nếu có) đẩy xuống cuối
      const { error: e2 } = await supabaseAdmin.from('soct_chi_tiet_vat_tu').update({ thu_tu: ord }).eq('id', l.id)
      if (e2) throw e2
    }

    await logAudit(session, 'Đổi thứ tự vật tư', `${ids.length} phiếu`)
    await broadcastJobsChanged()
    await broadcastCongNoChanged()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error vat-tu-thu-tu:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
