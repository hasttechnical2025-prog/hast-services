import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// Danh sách phiếu công nợ: có số phiếu + chưa lên hóa đơn (Chưa hóa đơn / Đã báo giá)
export async function GET() {
  try {
    const session = await requireTab('cong_no')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const data = await selectAll((from, to) => supabaseAdmin
      .from('soct_cong_viec')
      .select(`id, ngay, report, loai_cong_viec, trang_thai_hd, id_khach_hang,
        soct_khach_hang ( ten_khach_hang, dia_chi, ma_khach_cum, soct_khach_cum ( ma_khach_hang, ten_khach_hang, dia_chi ) ),
        soct_chi_tiet_vat_tu ( ma_hang, so_luong, don_gia, vat, soct_kho_hang ( ten_hang ) )`)
      .not('report', 'is', null)
      .neq('report', '')
      .neq('trang_thai_hd', 'Đã lên hóa đơn')
      .order('ngay', { ascending: true })
      .range(from, to))

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching cong no:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Cập nhật trạng thái hóa đơn hàng loạt. 'Đã lên hóa đơn' -> đồng bộ cờ hoa_don các dòng vật tư.
export async function PUT(request: Request) {
  try {
    const session = await requireTab('cong_no')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const { ids, trang_thai_hd } = await request.json()
    if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: 'Chưa chọn phiếu' }, { status: 400 })
    if (!['Chưa hóa đơn', 'Đã báo giá', 'Đã lên hóa đơn'].includes(trang_thai_hd)) {
      return NextResponse.json({ error: 'Trạng thái không hợp lệ' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('soct_cong_viec').update({ trang_thai_hd }).in('id', ids)
    if (error) throw error

    // Đồng bộ cờ hoa_don ở cấp dòng vật tư để Sổ công tác khớp với công nợ (2 chiều):
    //  - 'Đã lên hóa đơn'      -> hoa_don = true  (Sổ công tác hiện "Có HĐ")
    //  - 'Chưa hóa đơn'/'Đã báo giá' -> hoa_don = false (quay lại "Chưa HĐ", vào công nợ)
    await supabaseAdmin
      .from('soct_chi_tiet_vat_tu')
      .update({ hoa_don: trang_thai_hd === 'Đã lên hóa đơn' })
      .in('id_cong_viec', ids)

    await logAudit(session, 'Cập nhật trạng thái hóa đơn', `${ids.length} phiếu → ${trang_thai_hd}`)
    return NextResponse.json({ success: true, count: ids.length })
  } catch (error: any) {
    console.error('Error updating cong no status:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
