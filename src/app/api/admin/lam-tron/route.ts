import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { broadcastJobsChanged, broadcastCongNoChanged } from '@/lib/realtime'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// Ghi KHOẢN LÀM TRÒN tổng sau thuế cho một nhóm hóa đơn (chênh lệch làm tròn).
// Body: { ticket_ids: string[], lam_tron: number } (đồng, cho phép âm).
// Lưu toàn bộ delta lên phiếu ĐẠI DIỆN (ticket_ids[0]), các phiếu còn lại = 0
// -> tổng theo số HĐ = Σ lam_tron của các phiếu cùng số HĐ.
// Chỉ sửa khi phiếu CÒN ở "Chờ xuất HĐ" (khóa sau khi bàn giao kế toán, như tên/giá).

async function lockedTickets(ticketIds: string[]): Promise<string | null> {
  if (ticketIds.length === 0) return null
  const { data, error } = await supabaseAdmin
    .from('soct_cong_viec').select('id, report, trang_thai_hd').in('id', ticketIds)
  if (error) throw error
  const locked = (data || []).filter((t: any) => t.trang_thai_hd !== 'Chờ xuất HĐ')
  if (locked.length === 0) return null
  const rep = locked.map((t: any) => t.report || t.id).slice(0, 3).join(', ')
  return `Phiếu đã chuyển sang kế toán — không sửa được (${rep}${locked.length > 3 ? '…' : ''}). Kéo thẻ về cột "Chờ lên hóa đơn" trước khi sửa.`
}

export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff', 'kthc')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const body = await request.json()
    const ids: string[] = Array.isArray(body.ticket_ids) ? body.ticket_ids.filter(Boolean) : []
    if (ids.length === 0) return NextResponse.json({ error: 'Thiếu phiếu' }, { status: 400 })

    const delta = Math.round(Number(body.lam_tron))
    if (!Number.isFinite(delta)) return NextResponse.json({ error: 'Khoản làm tròn không hợp lệ' }, { status: 400 })
    // Chặn nhập nhầm số lớn: làm tròn hóa đơn chỉ vài đồng, tối đa cho 1000đ.
    if (Math.abs(delta) > 1000) return NextResponse.json({ error: 'Khoản làm tròn vượt quá ±1.000đ — kiểm tra lại.' }, { status: 400 })

    const lockMsg = await lockedTickets(ids)
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 409 })

    // Toàn bộ delta dồn vào phiếu đại diện; các phiếu còn lại = 0.
    const { error: e1 } = await supabaseAdmin.from('soct_cong_viec').update({ lam_tron: delta }).eq('id', ids[0])
    if (e1) throw e1
    if (ids.length > 1) {
      const { error: e2 } = await supabaseAdmin.from('soct_cong_viec').update({ lam_tron: 0 }).in('id', ids.slice(1))
      if (e2) throw e2
    }

    await logAudit(session, 'Đặt khoản làm tròn hóa đơn', `${delta}đ · ${ids.length} phiếu`)
    await broadcastJobsChanged()
    await broadcastCongNoChanged()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error lam-tron:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
