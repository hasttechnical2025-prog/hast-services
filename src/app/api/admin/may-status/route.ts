import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

// Trạng thái một máy phục vụ phù hiệu trong form giao việc:
// - đã bảo trì tháng này chưa
// - có biên bản giám định nào chưa thay (kèm vật tư đề xuất)
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const ma_may = searchParams.get('ma_may')
    if (!ma_may) {
      return NextResponse.json({ error: 'Thiếu mã máy' }, { status: 400 })
    }
    const thang_nam = searchParams.get('thang_nam') || new Date().toISOString().slice(0, 7)

    const [btRes, gdRes] = await Promise.all([
      supabaseAdmin
        .from('soct_bao_tri')
        .select('id')
        .eq('ma_may', ma_may)
        .eq('thang_nam', thang_nam)
        .limit(1),
      supabaseAdmin
        .from('soct_giam_dinh')
        .select(`
          id, ngay_giam_dinh, tinh_trang_may,
          soct_giam_dinh_vat_tu ( id, ma_hang, so_luong, soct_kho_hang ( ten_hang ) )
        `)
        .eq('ma_may', ma_may)
        .eq('da_thay', false)
        .order('ngay_giam_dinh', { ascending: false, nullsFirst: false }),
    ])

    if (btRes.error) throw btRes.error
    if (gdRes.error) throw gdRes.error

    return NextResponse.json({
      data: {
        bao_tri_thang: (btRes.data?.length || 0) > 0,
        thang_nam,
        giam_dinh: gdRes.data || [],
      }
    })
  } catch (error: any) {
    console.error('Error fetching may-status:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
