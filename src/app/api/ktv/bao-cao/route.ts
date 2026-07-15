import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { expandNgayCaNgay } from '@/lib/nghi-phep'

// Ngày "hôm nay" theo giờ VN (UTC+7) — tránh lệch ngày do server chạy UTC
function vnTodayStr(): string { return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10) }
// Số ngày `ngay` cách hôm nay (VN): 0 = hôm nay, 1 = hôm qua, âm = tương lai
function daysAgo(ngay: string): number {
  return Math.round((Date.parse(vnTodayStr() + 'T00:00:00Z') - Date.parse(ngay + 'T00:00:00Z')) / 86400000)
}
function isWeekend(ngay: string): boolean { const d = new Date(ngay + 'T00:00:00Z').getUTCDay(); return d === 0 || d === 6 }
async function isHoliday(ngay: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('soct_ngay_nghi').select('ngay').eq('ngay', ngay).maybeSingle()
  return !!data
}

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

    // 1. Tính toán danh sách 6 ngày gần nhất để lấy trạng thái nộp báo cáo hàng loạt
    const datesToCheck: string[] = []
    const refDate = new Date()
    refDate.setHours(0,0,0,0)
    for (let i = 0; i < 6; i++) {
      const d = new Date(refDate.getTime() - i * 86400000)
      const ymdStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      datesToCheck.push(ymdStr)
    }

    // Lấy trạng thái chốt nộp của 6 ngày này + ngày đang xem (ngày cũ không nằm trong 6 ngày gần nhất)
    const datesToQuery = Array.from(new Set([...datesToCheck, ngay]))
    const { data: ttList } = await supabaseAdmin
      .from('soct_trang_thai_bao_cao')
      .select('ngay_bao_cao, da_nop, thoi_gian_nop')
      .eq('ktv_id', session.id)
      .in('ngay_bao_cao', datesToQuery)

    const statuses: Record<string, boolean> = {}
    datesToCheck.forEach(d => { statuses[d] = false })
    let ttReport: any = null
    if (ttList) {
      for (const t of ttList) {
        statuses[t.ngay_bao_cao] = !!t.da_nop
        if (t.ngay_bao_cao === ngay) {
          ttReport = t
        }
      }
    }

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

    // 4. Ngày nghỉ lễ (toàn cty) + nghỉ phép/ốm CẢ NGÀY đã duyệt của chính KTV này
    //    -> client coi là ngày nghỉ (không cần báo cáo).
    const { data: ngayNghi, error: nnErr } = await supabaseAdmin
      .from('soct_ngay_nghi')
      .select('ngay')
    if (nnErr) throw nnErr

    const { data: myLeaves } = await supabaseAdmin
      .from('soct_nghi_phep')
      .select('tu_ngay, den_ngay, buoi')
      .eq('user_id', session.id)
      .eq('trang_thai', 'da_duyet')
      .eq('buoi', 'ca_ngay')
    const leaveDays = (myLeaves || []).flatMap(l => expandNgayCaNgay(l.tu_ngay, l.den_ngay, 'ca_ngay'))
    const ngayNghiAll = Array.from(new Set([...(ngayNghi || []).map(n => n.ngay), ...leaveDays]))

    // 5. Danh mục "Tình trạng báo cáo KTV" (admin cấu hình) cho dropdown
    const { data: ttOptions } = await supabaseAdmin
      .from('soct_danh_muc')
      .select('gia_tri')
      .eq('nhom', 'tinh_trang_bao_cao')
      .eq('active', true)
      .order('thu_tu', { ascending: true })

    return NextResponse.json({
      data: {
        da_nop: ttReport?.da_nop || false,
        thoi_gian_nop: ttReport?.thoi_gian_nop || null,
        jobs: jobs || [],
        extraJobs: extraJobs || [],
        ngayNghi: ngayNghiAll,
        tinhTrangOptions: (ttOptions || []).map((o: any) => o.gia_tri),
        statuses
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
        counter: (() => { const n = parseInt(counter, 10); return counter === '' || counter == null || Number.isNaN(n) ? null : n })(),
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

    // Đọc body MỘT LẦN (request.json() chỉ gọi được 1 lần) — gồm cả `jobs` cho submit_daily
    const { action, ngay, noi_dung, id_extra, jobs } = await request.json()
    if (!ngay || !/^\d{4}-\d{2}-\d{2}$/.test(ngay)) {
      return NextResponse.json({ error: 'Thiếu ngày hoặc ngày không hợp lệ' }, { status: 400 })
    }

    // Chỉ cho GHI báo cáo (mở lại/thêm/xóa/chốt) ở HÔM NAY hoặc HÔM QUA, và KHÔNG phải ngày nghỉ.
    if (['open_daily', 'add_extra', 'delete_extra', 'submit_daily'].includes(action)) {
      const dd = daysAgo(ngay)
      if (dd < 0 || dd > 1) {
        return NextResponse.json({ error: 'Chỉ được sửa/nộp báo cáo của hôm nay hoặc hôm qua.' }, { status: 400 })
      }
      if (isWeekend(ngay) || await isHoliday(ngay)) {
        return NextResponse.json({ error: 'Ngày nghỉ (Thứ 7 / Chủ Nhật / lễ) — không phải làm báo cáo.' }, { status: 400 })
      }
    }

    // 0. Hành động mở lại báo cáo
    if (action === 'open_daily') {

      const { data, error } = await supabaseAdmin
        .from('soct_trang_thai_bao_cao')
        .update({ da_nop: false })
        .eq('ktv_id', session.id)
        .eq('ngay_bao_cao', ngay)
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ data })
    }

    // Kiểm tra xem ngày đó đã chốt chưa (chỉ áp cho ghi dữ liệu)
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
      // `jobs` đã đọc ở body phía trên (KHÔNG gọi request.json() lần nữa — sẽ lỗi & mất dữ liệu)
      if (Array.isArray(jobs) && jobs.length > 0) {
        // Cập nhật song song thông tin counter và ghi_chu_ktv cho từng ca
        const updatePromises = jobs.map((j: any) => {
          const n = parseInt(j.counter, 10)
          const countVal = j.counter === '' || j.counter == null || Number.isNaN(n) ? null : n // giữ được số đếm = 0
          return supabaseAdmin
            .from('soct_cong_viec')
            .update({
              counter: countVal,
              ghi_chu_ktv: j.ghi_chu_ktv || null
            })
            .eq('id', j.id)
        })
        const results = await Promise.all(updatePromises)
        const err = results.find(r => r.error)
        if (err && err.error) {
          console.error("Lỗi cập nhật ca máy khi chốt nộp:", err.error)
          return NextResponse.json({ error: 'Lỗi lưu thông tin ca máy: ' + err.error.message }, { status: 500 })
        }
      }

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
