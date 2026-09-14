import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { LOAI_HD_BAO_TRI } from '@/lib/bao-tri'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET ?ma_may=... : tra SỐNG 1 mã máy quét từ Sổ bảo trì (dữ liệu tươi, không dùng snapshot client).
// status: 'ok'      = có & còn HĐ bảo trì (HĐBT/MF) -> tạo phiếu được
//         'khac_hd' = có trong hệ thống nhưng KHÔNG còn HĐ bảo trì -> không tạo phiếu bảo trì
//         'khong_co'= không tìm thấy mã máy
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const raw = (searchParams.get('ma_may') || '').trim()
    if (!raw) return NextResponse.json({ error: 'Thiếu mã máy' }, { status: 400 })

    // Khớp không phân biệt hoa/thường; escape ký tự wildcard của ilike để tránh sai lệch.
    const pattern = raw.replace(/[%_\\]/g, (m) => '\\' + m)
    const { data, error } = await supabaseAdmin
      .from('soct_khach_hang')
      .select('id, ma_may, ten_khach_hang, dia_chi, model, loai_hd, km_mac_dinh')
      .ilike('ma_may', pattern)
      .limit(10)
    if (error) throw error

    const rows = data || []
    if (rows.length === 0) return NextResponse.json({ status: 'khong_co' })
    // Ưu tiên bản ghi còn HĐ bảo trì (một mã hiếm khi trùng, nhưng chọn đúng loại cho chắc).
    const bt = rows.find((r: any) => LOAI_HD_BAO_TRI.includes(String(r.loai_hd || '').trim()))
    if (bt) return NextResponse.json({ status: 'ok', customer: bt })
    return NextResponse.json({ status: 'khac_hd', customer: rows[0] })
  } catch (error: any) {
    console.error('Error scan-lookup:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
