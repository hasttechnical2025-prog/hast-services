import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { broadcastJobsChanged } from '@/lib/realtime'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// Ghi nhận tiền khách thanh toán theo SỐ HÓA ĐƠN (cộng dồn). Nếu `chuyen` = true thì đồng thời
// chuyển tất cả phiếu của hóa đơn đó sang 'Đã thanh toán'. Admin có thể `reset` về 0.
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const so_hoa_don = String(body.so_hoa_don || '').trim()
    if (!so_hoa_don) return NextResponse.json({ error: 'Thiếu số hóa đơn' }, { status: 400 })

    // Đặt lại đã thu (chỉ admin) — cứu khi kế toán gõ nhầm (vì không lưu lịch sử).
    if (body.reset === true) {
      const session = await requireRole('admin')
      if (!session) return NextResponse.json({ error: 'Chỉ admin được đặt lại số đã thu' }, { status: 401 })
      await supabaseAdmin.from('soct_hd_thu').delete().eq('so_hoa_don', so_hoa_don)
      await logAudit(session, 'Đặt lại đã thu', `HĐ ${so_hoa_don}`)
      await broadcastJobsChanged()
      return NextResponse.json({ success: true, da_thu: 0 })
    }

    const session = await requireRole('admin', 'kthc')
    if (!session) return NextResponse.json({ error: 'Không có quyền ghi nhận thanh toán' }, { status: 401 })

    const themRaw = Number(body.so_tien_them)
    if (!Number.isFinite(themRaw) || themRaw <= 0) return NextResponse.json({ error: 'Số tiền không hợp lệ' }, { status: 400 })

    const { data: cur } = await supabaseAdmin.from('soct_hd_thu').select('so_tien_da_thu').eq('so_hoa_don', so_hoa_don).maybeSingle()
    const daThu = (Number(cur?.so_tien_da_thu) || 0) + themRaw

    const { error } = await supabaseAdmin.from('soct_hd_thu')
      .upsert({ so_hoa_don, so_tien_da_thu: daThu, updated_at: new Date().toISOString() }, { onConflict: 'so_hoa_don' })
    if (error) throw error

    // Đủ/dư -> chuyển tất cả phiếu của hóa đơn sang 'Đã thanh toán'.
    if (body.chuyen === true) {
      const { error: e2 } = await supabaseAdmin.from('soct_cong_viec')
        .update({ trang_thai_hd: 'Đã thanh toán' })
        .eq('so_hoa_don', so_hoa_don)
        .eq('trang_thai_hd', 'Đã lên hóa đơn')
      if (e2) throw e2
    }

    await logAudit(session, 'Ghi nhận thanh toán', `HĐ ${so_hoa_don}: +${themRaw.toLocaleString('vi-VN')} → ${daThu.toLocaleString('vi-VN')}${body.chuyen ? ' (đã đủ, chuyển Đã thanh toán)' : ''}`)
    await broadcastJobsChanged()
    return NextResponse.json({ success: true, da_thu: daThu })
  } catch (error: any) {
    console.error('Error hd-thu:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
