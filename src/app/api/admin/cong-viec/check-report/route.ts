import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { normReport } from '@/lib/report'

export const runtime = 'nodejs'

// Kiểm tra TRƯỚC KHI LƯU: số phiếu (report) đã tồn tại chưa — để cảnh báo office ngay khi
// nhập PDF / trước khi bấm Lưu, thay vì chỉ 1 toast cộc lốc lúc DB chặn (409).
// Chuẩn hóa bằng normReport (CHUNG với server lúc insert) nên khớp đúng điều kiện unique index.
// Trả về thông tin phiếu đang tồn (ngày, khách, KTV, trạng thái) để báo rõ "đây là trùng thật".
// Nhẹ egress: chỉ lấy 1 dòng, vài cột.
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const norm = normReport(searchParams.get('report'))
    const excludeId = (searchParams.get('excludeId') || '').trim() // đang SỬA -> bỏ chính nó ra

    // Rỗng -> không tính trùng
    if (!norm) return NextResponse.json({ exists: false })

    let query = supabaseAdmin
      .from('soct_cong_viec')
      .select('id, ngay, ma_may, ket_qua, report, soct_khach_hang ( ten_khach_hang ), ktv:soct_users!ktv_id ( full_name )')
      .eq('report', norm)
      .limit(1)
    if (excludeId) query = query.neq('id', excludeId)

    const { data, error } = await query.maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ exists: false })

    const kh: any = data.soct_khach_hang
    const ktv: any = data.ktv
    return NextResponse.json({
      exists: true,
      job: {
        id: data.id,
        ngay: data.ngay,
        ma_may: data.ma_may || '',
        report: data.report || '',
        ket_qua: data.ket_qua || '',
        khach: kh?.ten_khach_hang || '',
        ktv: ktv?.full_name || '',
      },
    })
  } catch (e: any) {
    console.error('Error checking duplicate report:', e)
    return NextResponse.json({ error: e?.message || 'Lỗi kiểm tra số phiếu' }, { status: 500 })
  }
}
