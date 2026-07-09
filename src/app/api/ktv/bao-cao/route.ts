import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

// GET: Lấy dữ liệu báo cáo của KTV trong 1 ngày cụ thể
// Query params: ?ngay=YYYY-MM-DD
export async function GET(request: Request) {
  try {
    const session = await requireRole('ktv')
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const ngay = searchParams.get('ngay')
    if (!ngay || !/^\d{4}-\d{2}-\d{2}$/.test(ngay)) {
      return NextResponse.json({ error: 'Ngày không hợp lệ (YYYY-MM-DD)' }, { status: 400 })
    }

    // 1. Lấy trạng thái nộp báo cáo của KTV trong ngày đó
    const { data: ttReport } = await supabaseAdmin
      .from('soct_trang_thai_bao_cao')
      .select('da_nop, thoi_gian_nop')
      .eq('ktv_id', session.id)
      .eq('ngay_bao_cao', ngay)
      .single()

    // 2. Lấy danh sách việc trong Sổ công tác của KTV trong ngày (KTV chính OR KTV kèm)
    // Lấy trạng thái Đang làm, Hoàn thành, Lắp tiếp, Đã nhận
    const { data: jobs, error: jobsErr } = await supabaseAdmin
      .from('soct_cong_viec')
      .select(`
        id, ngay, ma_may, loai_cong_viec, report, ket_qua, counter, ghi_chu_ktv,
        soct_khach_hang ( ten_khach_hang, dia_chi )
      `)
      .eq('ngay', ngay)
      .or(`ktv_id.eq.${session.id},ktv2_id.eq.${session.id}`)
      .order('created_at', { ascending: true })

    if (jobsErr) throw jobsErr

    // 3. Lấy danh sách việc ngoài luồng
    const { data: extraJobs, error: extraErr } = await supabaseAdmin
      .from('soct_nhat_ky_ktv')
      .select('id, noi_dung')
      .eq('ktv_id', session.id)
      .eq('ngay', ngay)
      .order('created_at', { ascending: true })

    if (extraErr) throw extraErr

    // 4. Lấy danh sách ngày nghỉ lễ (để client block chọn ngày)
    const { data: ngayNghi, error: nnErr } = await supabaseAdmin
      .from('soct_ngay_nghi')
      .select('ngay')

    if (nnErr) throw nnErr

    return NextResponse.json({
      data: {
        da_nop: ttReport?.da_nop || false,
        thoi_gian_nop: ttReport?.thoi_gian_nop || null,
        jobs: jobs || [],
        extraJobs: extraJobs || [],
        ngayNghi: (ngayNghi || []).map(n => n.ngay)
      }
    })
  } catch (error: any) {
    console.error('Error getting KTV daily report:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT: Cập nhật thông tin phiếu công việc (KTV cập nhật counter và ghi_chu_ktv)
export async function PUT(request: Request) {
  try {
    const session = await requireRole('ktv')
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const { id, counter, ghi_chu_ktv } = await request.json()
    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID công việc' }, { status: 400 })
    }

    // Kiểm tra xem phiếu này có đúng của KTV đó không và ngày thực hiện
    const { data: job, error: getErr } = await supabaseAdmin
      .from('soct_cong_viec')
      .select('ngay, ktv_id, ktv2_id')
      .eq('id', id)
      .single()

    if (getErr || !job) {
      return NextResponse.json({ error: 'Không tìm thấy công việc' }, { status: 404 })
    }
    if (job.ktv_id !== session.id && job.ktv2_id !== session.id) {
      return NextResponse.json({ error: 'Không có quyền cập nhật công việc này' }, { status: 403 })
    }

    // Kiểm tra xem ngày đó đã chốt nộp báo cáo chưa
    const { data: tt } = await supabaseAdmin
      .from('soct_trang_thai_bao_cao')
      .select('da_nop')
      .eq('ktv_id', session.id)
      .eq('ngay_bao_cao', job.ngay)
      .single()

    if (tt?.da_nop) {
      return NextResponse.json({ error: 'Báo cáo ngày này đã chốt. Không thể chỉnh sửa.' }, { status: 400 })
    }

    // Tiến hành cập nhật
    const { data, error } = await supabaseAdmin
      .from('soct_cong_viec')
      .update({
        counter: counter === '' ? null : (parseInt(counter, 10) || null),
        ghi_chu_ktv: ghi_chu_ktv || null
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error updating KTV job details:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: Thêm việc ngoài luồng HOẶC chốt báo cáo ngày
export async function POST(request: Request) {
  try {
    const session = await requireRole('ktv')
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const { action, ngay, noi_dung, id_extra } = await request.json()
    if (!ngay || !/^\d{4}-\d{2}-\d{2}$/.test(ngay)) {
      return NextResponse.json({ error: 'Thiếu ngày hoặc ngày không hợp lệ' }, { status: 400 })
    }

    // Kiểm tra xem ngày đó đã chốt chưa
    const { data: tt } = await supabaseAdmin
      .from('soct_trang_thai_bao_cao')
      .select('da_nop')
      .eq('ktv_id', session.id)
      .eq('ngay_bao_cao', ngay)
      .single()

    if (tt?.da_nop) {
      return NextResponse.json({ error: 'Báo cáo ngày này đã chốt. Không thể thực hiện.' }, { status: 400 })
    }

    // 1. Thao tác thêm việc ngoài luồng
    if (action === 'add_extra') {
      if (!noi_dung || !noi_dung.trim()) {
        return NextResponse.json({ error: 'Nội dung công việc không được rỗng' }, { status: 400 })
      }

      const { data, error } = await supabaseAdmin
        .from('soct_nhat_ky_ktv')
        .insert({
          ktv_id: session.id,
          ngay,
          noi_dung: noi_dung.trim()
        })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ data })
    }

    // 2. Thao tác xóa việc ngoài luồng
    if (action === 'delete_extra') {
      if (!id_extra) {
        return NextResponse.json({ error: 'Thiếu ID công việc cần xóa' }, { status: 400 })
      }

      const { error } = await supabaseAdmin
        .from('soct_nhat_ky_ktv')
        .delete()
        .eq('id', id_extra)
        .eq('ktv_id', session.id) // bảo mật

      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // 3. Thao tác chốt nộp báo cáo ngày
    if (action === 'submit_daily') {
      // Xác nhận chốt báo cáo cho KTV
      const { data, error } = await supabaseAdmin
        .from('soct_trang_thai_bao_cao')
        .upsert({
          ktv_id: session.id,
          ngay_bao_cao: ngay,
          da_nop: true,
          thoi_gian_nop: new Date().toISOString()
        }, { onConflict: 'ktv_id,ngay_bao_cao' })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ data })
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 })
  } catch (error: any) {
    console.error('Error handling KTV daily report post:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
