import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/session'
import { sendPushToKthc } from '@/lib/push'

export const runtime = 'nodejs'

// Gửi THỬ thông báo hóa đơn tới các máy kthc đã bật (giả lập bàn giao Kanban). CHỈ admin.
export async function POST() {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Chỉ admin được gửi thử' }, { status: 401 })
    const sent = await sendPushToKthc('Có hóa đơn cần xuất', 'Thử nghiệm thông báo · Công ty ABC', '/admin')
    return NextResponse.json({ success: true, sent })
  } catch (error: any) {
    console.error('Error POST push/test:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
