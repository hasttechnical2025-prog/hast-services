import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { broadcastKhoChanged, broadcastDatHangChanged } from '@/lib/realtime'

// Ghi một đợt hàng về cho một dòng đơn (trigger tự cộng tồn kho + đánh dấu hoàn thành)
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) {
      return NextResponse.json({ error: 'Chỉ Admin mới có quyền thực hiện thao tác này' }, { status: 403 })
    }

    const { id_dat_hang_ct, ngay_nhan, so_luong_nhan, ma_hang } = await request.json()
    const sl = parseInt(so_luong_nhan, 10)
    if (!id_dat_hang_ct || !(sl > 0)) {
      return NextResponse.json({ error: 'Thiếu dòng hàng hoặc số lượng nhận không hợp lệ' }, { status: 400 })
    }

    // Mã THỰC nhận: mặc định = mã của dòng đặt; cho khai mã khác (NCC giao thay thế).
    const { data: ct } = await supabaseAdmin.from('soct_dat_hang_ct').select('ma_hang').eq('id', id_dat_hang_ct).single()
    if (!ct) return NextResponse.json({ error: 'Không tìm thấy dòng đặt hàng' }, { status: 404 })
    const maThuc = String(ma_hang || '').trim() || ct.ma_hang
    // Mã thực phải có trong kho thì tồn kho mới được cộng đúng chỗ.
    const { data: khoItem } = await supabaseAdmin.from('soct_kho_hang').select('ma_hang').eq('ma_hang', maThuc).maybeSingle()
    if (!khoItem) {
      return NextResponse.json({ error: `Mã thực nhận "${maThuc}" chưa có trong Kho hàng — hãy thêm mã này vào kho trước khi ghi hàng về.` }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('soct_hang_ve_dot')
      .insert({
        id_dat_hang_ct,
        ngay_nhan: ngay_nhan || new Date().toISOString().split('T')[0],
        so_luong_nhan: sl,
        ma_hang: maThuc,
      })
      .select()
      .single()

    if (error) throw error
    await broadcastKhoChanged(); await broadcastDatHangChanged()
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error creating hang_ve:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Xóa một đợt hàng về (trigger tự hoàn tồn kho)
export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) {
      return NextResponse.json({ error: 'Chỉ Admin mới có quyền thực hiện thao tác này' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu ID đợt hàng về' }, { status: 400 })

    const { error } = await supabaseAdmin.from('soct_hang_ve_dot').delete().eq('id', id)
    if (error) throw error

    await broadcastKhoChanged(); await broadcastDatHangChanged()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting hang_ve:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
