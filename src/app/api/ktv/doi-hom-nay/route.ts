import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

export const runtime = 'nodejs'

// GET /api/ktv/doi-hom-nay — "Việc cả đội HÔM NAY" (minh bạch đội, read-only).
// CHỈ field an toàn: khách + khu vực + loại việc + trạng thái + KTV phụ trách.
// KHÔNG trả km/giá/số phiếu/nội dung/vật tư. Chỉ việc NGÀY HÔM NAY (không quá khứ/tương lai).
// Loại phiếu TỔNG HỢP (nguon != null: billing/tách HĐ) vì không phải việc KTV.
export async function GET() {
  try {
    const session = await requireRole('ktv')
    if (!session) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10) // ngày VN

    const rows = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_cong_viec')
      .select(`
        id, ket_qua, loai_cong_viec, ktv_id, ktv2_id,
        soct_khach_hang ( ten_khach_hang, dia_chi, vi_tri_dat_may ),
        ktv:soct_users!ktv_id ( full_name ),
        ktv2:soct_users!ktv2_id ( full_name )
      `)
      .eq('ngay', today)
      .is('nguon', null)
      .range(from, to))

    const data = (rows || []).map((r: any) => ({
      id: r.id,
      khach: r.soct_khach_hang?.ten_khach_hang || 'Khách lẻ',
      khu_vuc: r.soct_khach_hang?.vi_tri_dat_may || r.soct_khach_hang?.dia_chi || '',
      loai_cong_viec: r.loai_cong_viec || '',
      ket_qua: r.ket_qua || '',
      ktv_id: r.ktv_id || null,
      ktv_ten: r.ktv?.full_name || '',
      ktv2_ten: r.ktv2?.full_name || '',
    }))

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error GET doi-hom-nay:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
