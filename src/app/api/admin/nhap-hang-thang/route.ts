import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'

// Thống kê nhập hàng theo tháng (kế toán) — tùy chọn lọc theo tháng
export async function GET(request: Request) {
  try {
    const session = await requireTab('kho_hang', 'kho_hang.thong_ke')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const thang_nam = searchParams.get('thang_nam')

    let query = supabaseAdmin
      .from('soct_nhap_hang_thang')
      .select('id, ma_hang, thang_nam, so_luong_nhap, soct_kho_hang ( ten_hang )')
      .gt('so_luong_nhap', 0)
      .order('thang_nam', { ascending: false })
      .order('ma_hang')

    if (thang_nam) query = query.eq('thang_nam', thang_nam)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching nhap_hang_thang:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
