import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

// Ghi một đợt hàng về cho một dòng đơn (trigger tự cộng tồn kho + đánh dấu hoàn thành)
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) {
      return NextResponse.json({ error: 'Chỉ Admin mới có quyền thực hiện thao tác này' }, { status: 403 })
    }

    const { id_dat_hang_ct, ngay_nhan, so_luong_nhan } = await request.json()
    const sl = parseInt(so_luong_nhan, 10)
    if (!id_dat_hang_ct || !(sl > 0)) {
      return NextResponse.json({ error: 'Thiếu dòng hàng hoặc số lượng nhận không hợp lệ' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('soct_hang_ve_dot')
      .insert({
        id_dat_hang_ct,
        ngay_nhan: ngay_nhan || new Date().toISOString().split('T')[0],
        so_luong_nhan: sl,
      })
      .select()
      .single()

    if (error) throw error
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

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting hang_ve:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
