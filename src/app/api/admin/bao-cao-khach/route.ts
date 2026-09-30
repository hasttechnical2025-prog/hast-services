import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { broadcastJobsChanged } from '@/lib/realtime'

export const runtime = 'nodejs'

// Tab Sổ công tác › Báo cáo gửi khách (office). Quyền theo tab 'cong_viec.bao_cao_khach'
// (mặc định CHỈ admin; admin mở cho role office khác sau qua Phân quyền tab).

// GET ?count=1 -> số báo cáo CHỜ GỬI (badge). GET thường -> danh sách (mặc định chờ gửi).
export async function GET(request: Request) {
  try {
    const session = await requireTab('cong_viec', 'cong_viec.bao_cao_khach')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    if (searchParams.get('count') === '1') {
      const { count } = await supabaseAdmin.from('soct_bao_cao_khach').select('id', { count: 'exact', head: true }).eq('trang_thai', 'cho_gui')
      return NextResponse.json({ count: count || 0 })
    }

    const trang_thai = searchParams.get('trang_thai') || 'cho_gui'
    const rows = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_bao_cao_khach')
      .select(`
        id, noi_dung, trang_thai, da_gui_luc, created_at,
        nguoi_tao_u:soct_users!nguoi_tao ( full_name ),
        soct_cong_viec (
          id, ngay, ma_may, loai_cong_viec,
          soct_khach_hang ( ten_khach_hang, model, vi_tri_dat_may, dia_chi ),
          soct_chi_tiet_vat_tu ( ma_hang, so_luong, ten_hang_hd, da_tra, soct_kho_hang ( ten_hang ) )
        )
      `)
      .eq('trang_thai', trang_thai)
      .order('created_at', { ascending: false })
      .range(from, to))
    return NextResponse.json({ data: rows || [] })
  } catch (error: any) {
    console.error('Error GET bao-cao-khach:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT { id, action: 'da_gui' | 'cho_gui' } -> đánh dấu đã gửi / trả lại chờ gửi.
export async function PUT(request: Request) {
  try {
    const session = await requireTab('cong_viec', 'cong_viec.bao_cao_khach')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    const { id, action } = await request.json()
    if (!id || !['da_gui', 'cho_gui'].includes(action)) return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 })
    const upd = action === 'da_gui'
      ? { trang_thai: 'da_gui', nguoi_gui: session.id, da_gui_luc: new Date().toISOString() }
      : { trang_thai: 'cho_gui', nguoi_gui: null, da_gui_luc: null }
    const { error } = await supabaseAdmin.from('soct_bao_cao_khach').update(upd).eq('id', id)
    if (error) throw error
    await logAudit(session, 'Báo cáo sửa chữa', action === 'da_gui' ? `đánh dấu đã gửi ${id}` : `trả lại chờ gửi ${id}`)
    await broadcastJobsChanged()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error PUT bao-cao-khach:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE ?id= -> bỏ báo cáo (không gửi nữa).
export async function DELETE(request: Request) {
  try {
    const session = await requireTab('cong_viec', 'cong_viec.bao_cao_khach')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })
    const { error } = await supabaseAdmin.from('soct_bao_cao_khach').delete().eq('id', id)
    if (error) throw error
    await logAudit(session, 'Báo cáo sửa chữa', `xóa ${id}`)
    await broadcastJobsChanged()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error DELETE bao-cao-khach:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
