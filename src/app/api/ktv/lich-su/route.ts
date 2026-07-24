import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

// GET /api/ktv/lich-su?ma_may=<mã>&exclude=<id ca hiện tại>
// Trả LẦN GẦN NHẤT trước đó của mã máy (last call):
// { ngay, loai_cong_viec, ghi_chu_ktv, ghi_chu, vat_tu }
// Mục đích: KTV bấm "Đang làm" là thấy ngay lần trước làm gì / thay vật tư gì.
export async function GET(request: Request) {
  try {
    const session = await requireRole('ktv')
    if (!session) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const maMay = (searchParams.get('ma_may') || '').trim()
    const exclude = searchParams.get('exclude') || ''
    if (!maMay) return NextResponse.json({ data: null })

    // Lấy dư 1 dòng để loại trừ chính ca hiện tại (nếu nó là dòng đầu)
    const { data, error } = await supabaseAdmin
      .from('soct_cong_viec')
      .select('id, ngay, loai_cong_viec, ghi_chu_ktv, ghi_chu, soct_chi_tiet_vat_tu ( so_luong, ma_hang, soct_kho_hang ( ten_hang ) )')
      .eq('ma_may', maMay)
      .order('ngay', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(2)

    if (error) throw error
    const row: any = (data || []).filter((r: any) => r.id !== exclude)[0]
    if (!row) return NextResponse.json({ data: null })

    // Gộp vật tư lần trước thành 1 chuỗi gọn để hiện trên điện thoại
    const vat_tu = (row.soct_chi_tiet_vat_tu || [])
      .map((v: any) => `${v.soct_kho_hang?.ten_hang || v.ma_hang}${(Number(v.so_luong) || 0) > 1 ? ` x${v.so_luong}` : ''}`)
      .join(', ')

    return NextResponse.json({
      data: {
        ngay: row.ngay, loai_cong_viec: row.loai_cong_viec,
        ghi_chu_ktv: row.ghi_chu_ktv, ghi_chu: row.ghi_chu, vat_tu,
      },
    })
  } catch (error: any) {
    console.error('Error getting machine history:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
