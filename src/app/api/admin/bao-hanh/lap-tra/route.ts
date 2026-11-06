import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// POST { id, ma, sl }  -> đánh dấu ca ĐÃ LẮP TRẢ (con mượn về kho, con lắp vào máy trừ kho).
// POST { id, undo:true } -> HỦY lắp trả (mở lại trạng thái đang mượn).
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Chỉ admin được lắp trả' }, { status: 401 })
    const b = await request.json()
    if (!b.id) return NextResponse.json({ error: 'Thiếu id ca' }, { status: 400 })

    if (b.undo) {
      const { error } = await supabaseAdmin.from('soct_bh_fbvn')
        .update({ lap_tra: false, lap_tra_luc: null, lap_tra_ma: null, lap_tra_sl: null })
        .eq('id', b.id)
      if (error) throw error
      await logAudit(session, 'Hủy lắp trả BH', String(b.id))
      return NextResponse.json({ success: true })
    }

    const ma = String(b.ma || '').trim().toUpperCase()
    const sl = parseInt(String(b.sl)) || 0
    if (!ma) return NextResponse.json({ error: 'Thiếu mã con lắp vào máy' }, { status: 400 })
    if (sl <= 0) return NextResponse.json({ error: 'Số lượng phải > 0' }, { status: 400 })

    const { error } = await supabaseAdmin.from('soct_bh_fbvn')
      .update({ lap_tra: true, lap_tra_luc: new Date().toISOString(), lap_tra_ma: ma, lap_tra_sl: sl })
      .eq('id', b.id)
    if (error) throw error
    await logAudit(session, 'Lắp trả BH', `${ma} ×${sl}`)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error POST bh/lap-tra:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
