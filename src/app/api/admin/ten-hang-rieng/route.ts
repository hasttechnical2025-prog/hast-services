import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { broadcastJobsChanged, broadcastCongNoChanged } from '@/lib/realtime'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// Đổi tên hàng hóa hiển thị trên hóa đơn (2 phạm vi). Tên rỗng => xóa ghi đè (trả mặc định).
//  - pham_vi 'hoa_don': ghi ten_hang_hd cho các dòng (theo ma_hang) của các phiếu chỉ định.
//  - pham_vi 'khach'  : upsert soct_ten_hang_rieng theo scope_key + ma_hang (mặc định cho khách).
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'kthc')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const body = await request.json()
    const pham_vi = body.pham_vi
    const ma_hang = String(body.ma_hang || '').trim()
    const ten = String(body.ten_hang || '').trim()
    if (!ma_hang) return NextResponse.json({ error: 'Thiếu mã hàng' }, { status: 400 })

    if (pham_vi === 'hoa_don') {
      const ids: string[] = Array.isArray(body.ticket_ids) ? body.ticket_ids : []
      if (ids.length === 0) return NextResponse.json({ error: 'Thiếu phiếu cần đổi tên' }, { status: 400 })
      const { error } = await supabaseAdmin
        .from('soct_chi_tiet_vat_tu')
        .update({ ten_hang_hd: ten || null })
        .in('id_cong_viec', ids)
        .eq('ma_hang', ma_hang)
      if (error) throw error
      await logAudit(session, 'Đổi tên hàng (hóa đơn này)', `${ma_hang} → ${ten || '(mặc định)'}`)
    } else if (pham_vi === 'khach') {
      const scope_key = String(body.scope_key || '').trim()
      if (!scope_key) return NextResponse.json({ error: 'Thiếu khách hàng' }, { status: 400 })
      if (!ten) {
        const { error } = await supabaseAdmin.from('soct_ten_hang_rieng')
          .delete().eq('scope_key', scope_key).eq('ma_hang', ma_hang)
        if (error) throw error
      } else {
        const { error } = await supabaseAdmin.from('soct_ten_hang_rieng')
          .upsert({ scope_key, ma_hang, ten_hang: ten, updated_at: new Date().toISOString() }, { onConflict: 'scope_key,ma_hang' })
        if (error) throw error
      }
      await logAudit(session, 'Đổi tên hàng (mặc định khách)', `${scope_key} · ${ma_hang} → ${ten || '(xóa)'}`)
    } else {
      return NextResponse.json({ error: 'Phạm vi không hợp lệ' }, { status: 400 })
    }

    await broadcastJobsChanged()
    await broadcastCongNoChanged()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error ten-hang-rieng:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
