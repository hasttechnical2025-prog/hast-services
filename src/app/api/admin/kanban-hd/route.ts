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
          id, ngay, ma_may, id_khach_hang, loai_cong_viec, km, ket_qua, report, ghi_chu, mien_phi, ktv_id, ktv2_id, so_luong, created_by, da_nop_phieu, trang_thai_hd, so_hoa_don, ngay_xuat_hd, nguoi_xuat_hd, dntt_luc, so_dntt, lam_tron, ten_khach_hd, nguon,
          nguoi_xuat:soct_users!nguoi_xuat_hd ( full_name ),
          soct_khach_hang (
            id,
            ten_khach_hang,
            loai_hd,
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
            thu_tu,
            don_vi_tinh,
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

    // Tên hàng hiển thị = ten_hang_hd (đã ghi vào dòng) > tên kho > mã hàng. Mẫu "riêng theo
    // khách" KHÔNG tự áp ở đây nữa — chỉ áp khi bấm nút (ghi vào dòng) để buộc rà soát.
    // _co_mau: khách (theo scope) đã lưu mẫu tên/giá -> client hiện nút "Áp mẫu khách".
    const { data: tplScopes } = await supabaseAdmin.from('soct_ten_hang_rieng').select('scope_key')
    const scopeSet = new Set((tplScopes || []).map((s: any) => s.scope_key))
    // Số tiền đã thu theo số hóa đơn (công nợ phải thu) -> gắn vào từng phiếu để hiện badge/thu tiền.
    const { data: thuRows } = await supabaseAdmin.from('soct_hd_thu').select('so_hoa_don, so_tien_da_thu')
    const thuMap = new Map<string, number>()
    for (const r of (thuRows || []) as any[]) thuMap.set(r.so_hoa_don, Number(r.so_tien_da_thu) || 0)
    for (const t of filtered as any[]) {
      const kh = t.soct_khach_hang
      const scopeKey = kh?.ma_khach_cum ? `cum:${kh.ma_khach_cum}` : `may:${t.id_khach_hang}`
      t._co_mau = scopeSet.has(scopeKey)
      t.so_tien_da_thu = t.so_hoa_don ? (thuMap.get(t.so_hoa_don) || 0) : 0
      for (const v of (t.soct_chi_tiet_vat_tu || [])) {
        v.ten_hd = v.ten_hang_hd || v.soct_kho_hang?.ten_hang || v.ma_hang
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
    const session = await requireRole('admin', 'tech_admin', 'staff', 'kthc')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const body = await request.json()
    const { id, ids, trang_thai_hd, so_hoa_don, ngay_xuat_hd } = body

    if (!id && (!Array.isArray(ids) || ids.length === 0)) {
      return NextResponse.json({ error: 'Thiếu ID công việc' }, { status: 400 })
    }

    let targetIds = ids || [id]

    // Validate trạng thái
    const allowedStates = ['Chờ xuất HĐ', 'Đang xử lý HĐ', 'Đã lên hóa đơn', 'Đã thanh toán', 'Chưa hóa đơn']
    if (!allowedStates.includes(trang_thai_hd)) {
      return NextResponse.json({ error: 'Trạng thái không hợp lệ' }, { status: 400 })
    }

    // THU HỒI phiếu Thuê/CPC (nguon='thue_cpc'): KHÔNG có Công nợ -> GỠ KHỎI KANBAN (xóa phiếu).
    // Bảng kê tự bỏ liên kết (bk.id_cong_viec ON DELETE SET NULL) -> "Đẩy Kanban" lại được.
    if (trang_thai_hd === 'Chưa hóa đơn') {
      const { data: srcs } = await supabaseAdmin.from('soct_cong_viec').select('id, nguon, so_hoa_don').in('id', targetIds)
      const rental = (srcs || []).filter((s: any) => s.nguon === 'thue_cpc')
      if (rental.length > 0) {
        const rIds = rental.map((s: any) => s.id)
        const rHds = [...new Set(rental.map((s: any) => s.so_hoa_don).filter(Boolean))]
        if (rHds.length) await supabaseAdmin.from('soct_hd_thu').delete().in('so_hoa_don', rHds)
        await supabaseAdmin.from('soct_chi_tiet_vat_tu').delete().in('id_cong_viec', rIds)
        await supabaseAdmin.from('soct_cong_viec').delete().in('id', rIds)
        targetIds = targetIds.filter((x: string) => !rIds.includes(x))
        if (targetIds.length === 0) {
          await broadcastJobsChanged()
          return NextResponse.json({ success: true, count: rIds.length, removed_thue_cpc: rIds.length })
        }
      }
    }

    // Chỉ KẾ TOÁN (admin/kthc) mới được LÊN HÓA ĐƠN / XÁC NHẬN THANH TOÁN.
    // tech_admin/staff chỉ bàn giao (cột 1 -> 2) và thu hồi — chặn ở server để bịt kẽ hở
    // gọi API trực tiếp / nút modal chưa gate. (Khớp luật kéo thả phía client.)
    const isKeToan = session.role === 'admin' || session.role === 'kthc'
    if (!isKeToan && (trang_thai_hd === 'Đã lên hóa đơn' || trang_thai_hd === 'Đã thanh toán')) {
      return NextResponse.json({ error: 'Chỉ kế toán (KT-HC) mới được lên hóa đơn / xác nhận thanh toán.' }, { status: 403 })
    }

    // Nếu hoàn tất xuất hóa đơn (chuyển sang 'Đã lên hóa đơn') -> Yêu cầu bắt buộc số hóa đơn
    if (trang_thai_hd === 'Đã lên hóa đơn') {
      if (!so_hoa_don || !String(so_hoa_don).trim()) {
        return NextResponse.json({ error: 'Yêu cầu điền số hóa đơn trước khi hoàn thành.' }, { status: 400 })
      }
    }

    // Về "Chờ xuất HĐ"/"Chưa hóa đơn" = KHỞI ĐỘNG LẠI vòng hóa đơn -> reset TOÀN BỘ trạng thái:
    // số HĐ, ngày xuất, người lập, ĐNTT + XÓA bản ghi thu tiền (soct_hd_thu theo số HĐ cũ).
    // Trước đó chỉ null số HĐ/người lập -> "đã thu" cũ vẫn dính khi nhập lại đúng số HĐ.
    const isReset = trang_thai_hd === 'Chờ xuất HĐ' || trang_thai_hd === 'Chưa hóa đơn'
    let oldSoHds: string[] = []
    if (isReset) {
      const { data: cur } = await supabaseAdmin.from('soct_cong_viec').select('so_hoa_don').in('id', targetIds)
      oldSoHds = [...new Set((cur || []).map((r: any) => r.so_hoa_don).filter(Boolean))]
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
      } else if (trang_thai_hd === 'Đã lên hóa đơn') {
        // CHỐT ngày xuất hóa đơn = hôm nay (giờ VN) nếu client không gửi. Thiếu dòng này thì
        // ngay_xuat_hd = NULL -> GET lọc mất thẻ ở cột "Chờ thanh toán" (thẻ biến mất khỏi board).
        updates.ngay_xuat_hd = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
      }
      // Lưu người lập hóa đơn (ai bấm Hoàn tất) để hiển thị + đối chiếu.
      if (trang_thai_hd === 'Đã lên hóa đơn') updates.nguoi_xuat_hd = session.id
    } else {
      // Trả về "Đang xử lý HĐ" (kéo ngược để sửa): GIỮ số hóa đơn để re-complete khỏi gõ lại,
      // chỉ xóa ngày xuất. Về hẳn Chờ xuất/Công nợ mới xóa số HĐ + người lập.
      updates.ngay_xuat_hd = null
      if (isReset) {
        updates.so_hoa_don = null
        updates.nguoi_xuat_hd = null
        updates.dntt_luc = null   // gỡ cờ "đã xuất ĐNTT"
        updates.so_dntt = null
      }
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

    // Khởi động lại vòng hóa đơn -> XÓA bản ghi thu tiền theo số HĐ cũ (tránh "đã thu" cũ hiện lại
    // khi kế toán nhập lại đúng số HĐ). Cả nhóm cùng số HĐ được thu hồi nên xóa theo số HĐ là đúng.
    if (isReset && oldSoHds.length > 0) {
      const { error: thuErr } = await supabaseAdmin.from('soct_hd_thu').delete().in('so_hoa_don', oldSoHds)
      if (thuErr) console.error('Lỗi xóa thu tiền khi thu hồi:', thuErr)
    }

    // Gửi realtime thông báo cho các máy khác
    await broadcastJobsChanged()

    return NextResponse.json({ success: true, count: targetIds.length })
  } catch (error: any) {
    console.error('Error updating kanban:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
