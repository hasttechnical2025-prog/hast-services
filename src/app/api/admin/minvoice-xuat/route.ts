import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { broadcastJobsChanged } from '@/lib/realtime'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// PUT { ticket_ids: string[] }: đóng dấu "đã xuất M-invoice" cho các phiếu (sau khi kthc bấm
// Xuất M-invoice). CHỈ kế toán (admin/kthc). Hàm SQL stamp_minvoice ghi now() + tăng minvoice_lan,
// và CHỈ đụng phiếu đang ở cột KT-HC ('Đang xử lý HĐ') -> an toàn, không đóng dấu nhầm.
// Cờ này chống xuất TRÙNG (nút hàng loạt bỏ qua phiếu đã có cờ) + nuôi banner đếm "chưa có số HĐ".
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin', 'kthc')
    if (!session) return NextResponse.json({ error: 'Chỉ kế toán (KT-HC) được đóng dấu xuất M-invoice' }, { status: 401 })

    const body = await request.json()
    const ids: string[] = Array.isArray(body.ticket_ids) ? body.ticket_ids.filter(Boolean) : []
    if (ids.length === 0) return NextResponse.json({ error: 'Thiếu danh sách phiếu' }, { status: 400 })

    const { error } = await supabaseAdmin.rpc('stamp_minvoice', { p_ids: ids })
    if (error) throw error

    await logAudit(session, 'Đóng dấu xuất M-invoice', `${ids.length} phiếu`)
    await broadcastJobsChanged()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error stamp minvoice:', error)
    return NextResponse.json({ error: error?.message || 'Lỗi đóng dấu M-invoice' }, { status: 500 })
  }
}
