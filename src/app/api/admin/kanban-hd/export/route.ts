import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

// GET: Nguồn DỮ LIỆU THÔ cho file Excel công nợ (kthc tự pivot).
//   ?phong_ban=tat_ca|ky_thuat|kinh_doanh
//   ?cutoff=YYYY-MM-DD   (sheet "chưa thu": nợ tính đến ngày — lũy kế, KHÔNG chặn dưới)
//   ?tu=YYYY-MM-DD&den=YYYY-MM-DD (sheet "đã thanh toán": range theo ngày xuất HĐ)
// Trả { chua_thu, da_thanh_toan } — client dựng .xlsx.
// Lọc theo số phiếu/khách/số HĐ (q) làm ở CLIENT (dùng lại matchSearch của KanbanHdTool).

const SELECT = `
  id, ngay, id_khach_hang, report, mien_phi, trang_thai_hd, so_hoa_don, ngay_xuat_hd, nguoi_xuat_hd, dntt_luc, so_dntt, lam_tron,
  nguoi_xuat:soct_users!nguoi_xuat_hd ( full_name ),
  soct_khach_hang (
    id, ten_khach_hang, loai_hd, dia_chi, ma_so_thue, ma_khach_cum,
    soct_khach_cum ( ma_khach_hang, ten_khach_hang, dia_chi, ma_so_thue )
  ),
  soct_chi_tiet_vat_tu (
    id, ma_hang, so_luong, don_gia, vat, thanh_tien, hoa_don, da_tra, ten_hang_hd,
    soct_kho_hang ( ten_hang )
  )
`

export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff', 'kthc')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const phongBan = searchParams.get('phong_ban') || 'tat_ca'
    const cutoff = searchParams.get('cutoff') || ''
    const tu = searchParams.get('tu') || ''
    const den = searchParams.get('den') || ''

    const isoDay = /^\d{4}-\d{2}-\d{2}$/

    // Chỉ có nguồn KỸ THUẬT (soct_cong_viec). Nguồn KINH DOANH (soct_lenh_xuat) chưa code
    // -> phong_ban=kinh_doanh trả rỗng; tat_ca / ky_thuat = như nhau (chỉ kỹ thuật).
    if (phongBan === 'kinh_doanh') {
      return NextResponse.json({ chua_thu: [], da_thanh_toan: [] })
    }

    // Sheet "chưa thu": Đã lên hóa đơn, đã có ngày xuất, <= cutoff (nếu có).
    const chuaThu = await selectAll<any>((from, to) => {
      let q = supabaseAdmin
        .from('soct_cong_viec')
        .select(SELECT)
        .eq('trang_thai_hd', 'Đã lên hóa đơn')
        .not('ngay_xuat_hd', 'is', null)
      if (isoDay.test(cutoff)) q = q.lte('ngay_xuat_hd', cutoff)
      return q.order('ngay_xuat_hd', { ascending: false }).range(from, to)
    })

    // Sheet "đã thanh toán": Đã thanh toán, ngày xuất trong [tu, den].
    const daThanhToan = await selectAll<any>((from, to) => {
      let q = supabaseAdmin
        .from('soct_cong_viec')
        .select(SELECT)
        .eq('trang_thai_hd', 'Đã thanh toán')
        .not('ngay_xuat_hd', 'is', null)
      if (isoDay.test(tu)) q = q.gte('ngay_xuat_hd', tu)
      if (isoDay.test(den)) q = q.lte('ngay_xuat_hd', den)
      return q.order('ngay_xuat_hd', { ascending: false }).range(from, to)
    })

    // Gắn số tiền đã thu theo số hóa đơn (soct_hd_thu) + tên hàng hiển thị (giống GET chính).
    const { data: thuRows } = await supabaseAdmin.from('soct_hd_thu').select('so_hoa_don, so_tien_da_thu')
    const thuMap = new Map<string, number>()
    for (const r of (thuRows || []) as any[]) thuMap.set(r.so_hoa_don, Number(r.so_tien_da_thu) || 0)

    const attach = (rows: any[]) => {
      for (const t of rows) {
        t.so_tien_da_thu = t.so_hoa_don ? (thuMap.get(t.so_hoa_don) || 0) : 0
        for (const v of (t.soct_chi_tiet_vat_tu || [])) {
          v.ten_hd = v.ten_hang_hd || v.soct_kho_hang?.ten_hang || v.ma_hang
        }
      }
    }
    attach(chuaThu || [])
    attach(daThanhToan || [])

    return NextResponse.json({ chua_thu: chuaThu || [], da_thanh_toan: daThanhToan || [] })
  } catch (error: any) {
    console.error('Error exporting kanban cong no:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
