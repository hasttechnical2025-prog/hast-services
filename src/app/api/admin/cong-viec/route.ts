import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

// Lấy danh sách công việc kèm thông tin khách hàng, kỹ thuật viên và vật tư liên quan
// KTV chỉ được xem các công việc gán cho chính mình
export async function GET(request: Request) {
  try {
    const session = await requireRole()
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dateStr = searchParams.get('date') // Định dạng YYYY-MM-DD nếu lọc theo ngày

    let query = supabaseAdmin
      .from('soct_cong_viec')
      .select(`
        *,
        soct_khach_hang (
          ten_khach_hang,
          dia_chi,
          lat,
          lng,
          km_mac_dinh
        ),
        soct_users (
          full_name,
          telegram_id
        ),
        soct_chi_tiet_vat_tu (
          id,
          ma_hang,
          so_luong,
          soct_kho_hang (
            ten_hang
          )
        )
      `)
      .order('created_at', { ascending: false })

    if (session.role === 'ktv') {
      query = query.eq('ktv_id', session.id)
    }

    if (dateStr) {
      query = query.eq('ngay', dateStr)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching jobs:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Tạo công việc mới (admin/tech_admin/staff đều được giao việc cho KTV)
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const body = await request.json()
    const {
      ngay,
      ma_may,
      id_khach_hang,
      loai_cong_viec,
      km,
      ktv_id,
      report,
      so_tien,
      loai_thanh_toan,
      ghi_chu,
      vat_tu // mảng: [{ ma_hang, so_luong }]
    } = body

    if (!id_khach_hang || !loai_cong_viec) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }

    // Kiểm tra và đánh dấu repeat call tự động (nếu máy này sửa gần đây: 15-30 ngày)
    let repeat_call = false
    if (ma_may) {
      const dateLimit = new Date()
      dateLimit.setDate(dateLimit.getDate() - 30)
      const dateLimitStr = dateLimit.toISOString().split('T')[0]

      const { data: recentJobs } = await supabaseAdmin
        .from('soct_cong_viec')
        .select('id')
        .eq('ma_may', ma_may)
        .gte('ngay', dateLimitStr)
        .eq('ket_qua', 'Hoàn thành')
        .limit(1)

      if (recentJobs && recentJobs.length > 0) {
        repeat_call = true
      }
    }

    // Insert công việc mới
    const { data, error } = await supabaseAdmin
      .from('soct_cong_viec')
      .insert({
        ngay: ngay || new Date().toISOString().split('T')[0],
        ma_may,
        id_khach_hang,
        loai_cong_viec,
        km: km || 0,
        ktv_id: ktv_id || null,
        report: report || null,
        so_tien: parseFloat(so_tien) || 0,
        loai_thanh_toan: loai_thanh_toan || 'Hóa đơn',
        ghi_chu,
        repeat_call,
        ket_qua: 'Chờ nhận'
      })
      .select()
      .single()

    if (error) throw error

    // Insert vật tư nếu có
    if (vat_tu && Array.isArray(vat_tu) && vat_tu.length > 0) {
      const validVatTu = vat_tu.filter(v => v.ma_hang && v.so_luong > 0)
      if (validVatTu.length > 0) {
        const vatTuInserts = validVatTu.map(v => ({
          id_cong_viec: data.id,
          ma_hang: v.ma_hang,
          so_luong: parseInt(v.so_luong, 10)
        }))

        const { error: vtError } = await supabaseAdmin
          .from('soct_chi_tiet_vat_tu')
          .insert(vatTuInserts)

        if (vtError) console.error("Lỗi thêm vật tư:", vtError)
      }
    }

    // Sau khi insert, cơ chế Database Webhook trên Supabase sẽ tự bắn REST API
    // đến /api/webhook/supabase để gửi thông báo Telegram cho KTV

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error creating job:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Thay đổi trạng thái/kết quả công việc hoặc cập nhật thông tin
// KTV chỉ được cập nhật ket_qua trên công việc của chính mình
export async function PUT(request: Request) {
  try {
    const session = await requireRole()
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const body = await request.json()
    const { id, ket_qua, ktv_id, report, so_tien, loai_thanh_toan, ghi_chu } = body

    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID công việc' }, { status: 400 })
    }

    if (session.role === 'staff') {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 403 })
    }

    const updates: any = {}

    if (session.role === 'ktv') {
      // KTV chỉ được đổi trạng thái công việc
      if (ket_qua === undefined) {
        return NextResponse.json({ error: 'Thiếu trạng thái cần cập nhật' }, { status: 400 })
      }
      updates.ket_qua = ket_qua
    } else {
      if (ket_qua !== undefined) updates.ket_qua = ket_qua
      if (ktv_id !== undefined) updates.ktv_id = ktv_id || null
      if (report !== undefined) updates.report = report
      if (so_tien !== undefined) updates.so_tien = parseFloat(so_tien) || 0
      if (loai_thanh_toan !== undefined) updates.loai_thanh_toan = loai_thanh_toan
      if (ghi_chu !== undefined) updates.ghi_chu = ghi_chu
    }

    let query = supabaseAdmin
      .from('soct_cong_viec')
      .update(updates)
      .eq('id', id)

    // KTV chỉ được cập nhật công việc gán cho chính mình
    if (session.role === 'ktv') {
      query = query.eq('ktv_id', session.id)
    }

    const { data, error } = await query.select().single()

    if (error) {
      // Không tìm thấy bản ghi (VD: KTV cố cập nhật việc của người khác)
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Không tìm thấy công việc hoặc không có quyền cập nhật' }, { status: 403 })
      }
      throw error
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error updating job:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Xóa công việc (chỉ admin/tech_admin)
export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID công việc' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('soct_cong_viec')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting job:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
