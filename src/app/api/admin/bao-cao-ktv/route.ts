import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'

// Lấy danh sách báo cáo nhật ký KTV cho Admin
export async function GET(request: Request) {
  try {
    const session = await requireTab('quan_ly', 'quan_ly.nhat_ky')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const ktv_id = searchParams.get('ktv_id') || ''
    const tuNgay = searchParams.get('tu_ngay')
    const denNgay = searchParams.get('den_ngay')

    // 1. Lấy danh sách các bản khai trạng thái nộp báo cáo (đã nộp hay chưa)
    let ttQuery = supabaseAdmin.from('soct_trang_thai_bao_cao').select('ktv_id, ngay_bao_cao, da_nop, thoi_gian_nop')
    if (ktv_id) ttQuery = ttQuery.eq('ktv_id', ktv_id)
    if (tuNgay) ttQuery = ttQuery.gte('ngay_bao_cao', tuNgay)
    if (denNgay) ttQuery = ttQuery.lte('ngay_bao_cao', denNgay)
    const { data: ttList, error: ttErr } = await ttQuery
    if (ttErr) throw ttErr

    // 2. Lấy danh sách việc sổ công tác (những việc đã hoàn thành hoặc đang làm)
    const jobs = await selectAll((from, to) => {
      let q = supabaseAdmin
        .from('soct_cong_viec')
        .select(`
          id, ngay, ktv_id, ktv2_id, ma_may, loai_cong_viec, ket_qua, counter, ghi_chu_ktv,
          soct_khach_hang ( ten_khach_hang )
        `)
        .in('ket_qua', ['Hoàn thành', 'Đang làm', 'Lắp tiếp'])
        .order('ngay', { ascending: false })
        .range(from, to)

      if (ktv_id) {
        // Có thể là KTV chính hoặc KTV kèm
        q = q.or(`ktv_id.eq.${ktv_id},ktv2_id.eq.${ktv_id}`)
      }
      if (tuNgay) q = q.gte('ngay', tuNgay)
      if (denNgay) q = q.lte('ngay', denNgay)
      return q
    })

    // 3. Lấy việc ngoài luồng
    const extras = await selectAll((from, to) => {
      let q = supabaseAdmin
        .from('soct_nhat_ky_ktv')
        .select('id, ktv_id, ngay, noi_dung, created_at')
        .order('ngay', { ascending: false })
        .order('created_at', { ascending: true })
        .range(from, to)

      if (ktv_id) q = q.eq('ktv_id', ktv_id)
      if (tuNgay) q = q.gte('ngay', tuNgay)
      if (denNgay) q = q.lte('ngay', denNgay)
      return q
    })

    // Phân quyền trả về dữ liệu (nhóm theo Ngày và KTV) sẽ được xử lý phía Client để tạo UI
    return NextResponse.json({
      data: {
        trang_thai: ttList || [],
        jobs: jobs || [],
        extras: extras || []
      }
    })
  } catch (error: any) {
    console.error('Error fetching admin KTV report:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
