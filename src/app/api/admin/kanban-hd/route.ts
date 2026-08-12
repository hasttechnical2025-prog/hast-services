import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { broadcastJobsChanged } from '@/lib/realtime'

// GET: Lấy danh sách phiếu phục vụ Kanban Hóa đơn
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff', 'kthc')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const reqThang = searchParams.get('thang_nam')

    let startOfMonth = ''
    let endOfMonth = ''

    if (reqThang && /^\d{4}-\d{2}$/.test(reqThang)) {
      const [y, m] = reqThang.split('-')
      startOfMonth = `${reqThang}-01`
      const lastDay = new Date(Number(y), Number(m), 0).getDate()
      endOfMonth = `${reqThang}-${String(lastDay).padStart(2, '0')}`
    } else {
      const today = new Date()
      const y = today.getFullYear()
      const m = today.getMonth() + 1
      startOfMonth = `${y}-${String(m).padStart(2, '0')}-01`
      const lastDay = new Date(y, m, 0).getDate()
      endOfMonth = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    }

    // Load tất cả các phiếu thuộc 4 trạng thái Kanban
    const data = await selectAll<any>((from, to) => {
      return supabaseAdmin
        .from('soct_cong_viec')
        .select(`
          id, ngay, ma_may, id_khach_hang, loai_cong_viec, km, ket_qua, report, ghi_chu, ktv_id, ktv2_id, so_luong, created_by, da_nop_phieu, trang_thai_hd, so_hoa_don, ngay_xuat_hd,
          soct_khach_hang (
            id,
            ten_khach_hang,
            dia_chi,
            ma_so_thue,
            email_ke_toan,
            ma_khach_cum,
            soct_khach_cum (
              ma_khach_hang,
              ten_khach_hang,
              dia_chi,
              ma_so_thue,
              email_ke_toan
            )
          ),
          soct_users!ktv_id (
            full_name
          ),
          soct_chi_tiet_vat_tu (
            id,
            ma_hang,
            so_luong,
            don_gia,
            vat,
            thanh_tien,
            hoa_don,
            da_tra,
            ten_hang_hd,
            soct_kho_hang (
              ten_hang
            )
          )
        `)
        .in('trang_thai_hd', ['Chờ xuất HĐ', 'Đang xử lý HĐ', 'Đã lên hóa đơn', 'Đã thanh toán'])
        .order('ngay', { ascending: false })
        .range(from, to)
    })

    // Lọc lại phía server:
    // - Cột 3 (Đã lên hóa đơn / Chờ thanh toán): Lũy kế toàn bộ, nhưng loại bỏ các phiếu
    //   cũ trong lịch sử chưa qua luồng Kanban (chưa có ngày xuất hóa đơn ngay_xuat_hd).
    // - Cột 4 (Đã thanh toán): Chỉ lấy trong kỳ đối chiếu đang chọn dựa trên ngay_xuat_hd.
    const filtered = (data || []).filter((j: any) => {
      if (j.trang_thai_hd === 'Đã lên hóa đơn') {
        return j.ngay_xuat_hd !== null
      }
      if (j.trang_thai_hd === 'Đã thanh toán') {
        return j.ngay_xuat_hd && j.ngay_xuat_hd >= startOfMonth && j.ngay_xuat_hd <= endOfMonth
      }
      return true
    })

    // Gắn tên hàng hiển thị (ten_hd) theo ưu tiên: ten_hang_hd (dòng) > tên riêng theo
    // khách (soct_ten_hang_rieng) > tên kho > mã hàng. scope_key khớp cách gom khách.
    const { data: overrides } = await supabaseAdmin.from('soct_ten_hang_rieng').select('scope_key, ma_hang, ten_hang')
    const ovMap = new Map<string, string>()
    for (const o of (overrides || []) as any[]) ovMap.set(`${o.scope_key}::${o.ma_hang}`, o.ten_hang)
    for (const t of filtered as any[]) {
      const kh = t.soct_khach_hang
      const scopeKey = kh?.ma_khach_cum ? `cum:${kh.ma_khach_cum}` : `may:${t.id_khach_hang}`
      for (const v of (t.soct_chi_tiet_vat_tu || [])) {
        v.ten_hd = v.ten_hang_hd || ovMap.get(`${scopeKey}::${v.ma_hang}`) || v.soct_kho_hang?.ten_hang || v.ma_hang
      }
    }

    return NextResponse.json({ data: filtered })
  } catch (error: any) {
    console.error('Error fetching kanban data:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT: Cập nhật trạng thái kéo thả hoặc hoàn tất xuất hóa đơn
// Body: { id, ids?, trang_thai_hd, so_hoa_don? }
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'kthc')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const body = await request.json()
    const { id, ids, trang_thai_hd, so_hoa_don, ngay_xuat_hd } = body

    if (!id && (!Array.isArray(ids) || ids.length === 0)) {
      return NextResponse.json({ error: 'Thiếu ID công việc' }, { status: 400 })
    }

    const targetIds = ids || [id]

    // Validate trạng thái
    const allowedStates = ['Chờ xuất HĐ', 'Đang xử lý HĐ', 'Đã lên hóa đơn', 'Đã thanh toán', 'Chưa hóa đơn']
    if (!allowedStates.includes(trang_thai_hd)) {
      return NextResponse.json({ error: 'Trạng thái không hợp lệ' }, { status: 400 })
    }

    // Nếu hoàn tất xuất hóa đơn (chuyển sang 'Đã lên hóa đơn') -> Yêu cầu bắt buộc số hóa đơn
    if (trang_thai_hd === 'Đã lên hóa đơn') {
      if (!so_hoa_don || !String(so_hoa_don).trim()) {
        return NextResponse.json({ error: 'Yêu cầu điền số hóa đơn trước khi hoàn thành.' }, { status: 400 })
      }
    }

    const updates: any = {
      trang_thai_hd
    }

    if (trang_thai_hd === 'Đã lên hóa đơn' || trang_thai_hd === 'Đã thanh toán') {
      if (so_hoa_don !== undefined) {
         updates.so_hoa_don = String(so_hoa_don).trim()
      }
      if (ngay_xuat_hd !== undefined) {
         updates.ngay_xuat_hd = ngay_xuat_hd || null
      }
    } else {
       // Kéo ngược lại cột 1 hoặc cột 2 -> xóa số hóa đơn và ngày xuất hóa đơn
       updates.so_hoa_don = null
       updates.ngay_xuat_hd = null
    }

    // Cập nhật Database
    const { error: upErr } = await supabaseAdmin
      .from('soct_cong_viec')
      .update(updates)
      .in('id', targetIds)

    if (upErr) throw upErr

    // Nếu là hoàn tất hóa đơn, ta cũng đồng bộ tick cờ hoa_don = true cho tất cả vật tư
    // của các phiếu này (để khớp logic công nợ hiện hành của app)
    if (trang_thai_hd === 'Đã lên hóa đơn' || trang_thai_hd === 'Đã thanh toán') {
      const { error: vtErr } = await supabaseAdmin
        .from('soct_chi_tiet_vat_tu')
        .update({ hoa_don: true })
        .in('id_cong_viec', targetIds)
        .eq('da_tra', false)

      if (vtErr) console.error('Lỗi đồng bộ cờ hoa_don cho vật tư:', vtErr)
    } else {
      // Nếu kế toán kéo ngược lại (hủy hóa đơn), ta cũng gỡ cờ hoa_don = false
      const { error: vtErr } = await supabaseAdmin
        .from('soct_chi_tiet_vat_tu')
        .update({ hoa_don: false })
        .in('id_cong_viec', targetIds)

      if (vtErr) console.error('Lỗi hủy cờ hoa_don cho vật tư:', vtErr)
    }

    // Gửi realtime thông báo cho các máy khác
    await broadcastJobsChanged()

    return NextResponse.json({ success: true, count: targetIds.length })
  } catch (error: any) {
    console.error('Error updating kanban:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
