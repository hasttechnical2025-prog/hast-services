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
    const wantTech = phongBan === 'tat_ca' || phongBan === 'ky_thuat'
    const wantKd = phongBan === 'tat_ca' || phongBan === 'kinh_doanh'

    // Sheet "chưa thu": Đã lên hóa đơn, đã có ngày xuất, <= cutoff (nếu có).
    const chuaThu = !wantTech ? [] : await selectAll<any>((from, to) => {
      let q = supabaseAdmin
        .from('soct_cong_viec')
        .select(SELECT)
        .eq('trang_thai_hd', 'Đã lên hóa đơn')
        .not('ngay_xuat_hd', 'is', null)
      if (isoDay.test(cutoff)) q = q.lte('ngay_xuat_hd', cutoff)
      return q.order('ngay_xuat_hd', { ascending: false }).range(from, to)
    })

    // Sheet "đã thanh toán": Đã thanh toán, ngày xuất trong [tu, den].
    const daThanhToan = !wantTech ? [] : await selectAll<any>((from, to) => {
      let q = supabaseAdmin
        .from('soct_cong_viec')
        .select(SELECT)
        .eq('trang_thai_hd', 'Đã thanh toán')
        .not('ngay_xuat_hd', 'is', null)
      if (isoDay.test(tu)) q = q.gte('ngay_xuat_hd', tu)
      if (isoDay.test(den)) q = q.lte('ngay_xuat_hd', den)
      return q.order('ngay_xuat_hd', { ascending: false }).range(from, to)
    })

    // ===== Nguồn KINH DOANH (soct_lenh_xuat) — dựng SẴN dòng phẳng để client chỉ việc append.
    // Đã thu = SUM soct_thu_tien da_duyet (KHÔNG dùng soct_hd_thu — đó là luồng kỹ thuật).
    const LX_SELECT = `id, so_lenh, ngay, ngay_xuat_hd, so_hoa_don, so_dntt, lam_tron, ten_khach_hang, ten_khach_hd, dia_chi, ma_so_thue,
      nguoi_kd:soct_users!nguoi_kinh_doanh_id ( full_name ), nguoi_xuat:soct_users!nguoi_xuat_hd ( full_name ),
      soct_lenh_xuat_ct ( so_luong, don_gia, vat )`
    const buildKdRows = (rows: any[], daThuMap: Map<string, number>) => rows.map((r: any) => {
      const lines = r.soct_lenh_xuat_ct || []
      const truoc = Math.round(lines.reduce((s: number, l: any) => s + (Number(l.so_luong) || 0) * (Number(l.don_gia) || 0), 0))
      const tong = Math.round(lines.reduce((s: number, l: any) => { const tt = (Number(l.so_luong) || 0) * (Number(l.don_gia) || 0); return s + tt * (1 + (Number(l.vat) || 0) / 100) }, 0)) + (Number(r.lam_tron) || 0)
      const rates: number[] = [...new Set<number>(lines.map((l: any) => Number(l.vat) || 0))]
      const vatRate: number | string = rates.length === 0 ? '' : rates.length === 1 ? rates[0] : 'mix'
      return {
        so_hoa_don: r.so_hoa_don || '', ngay_xuat_hd: r.ngay_xuat_hd || null,
        ten_khach: r.ten_khach_hd || r.ten_khach_hang || 'Khách hàng lẻ', mst: r.ma_so_thue || '', dia_chi: r.dia_chi || '',
        so_lenh: r.so_lenh || '', truoc_vat: truoc, vat_rate: vatRate, tien_vat: tong - truoc, tong_sau_vat: tong,
        da_thu: Math.round(daThuMap.get(r.id) || 0), nguoi_lap: r.nguoi_xuat?.full_name || '',
        so_dntt: r.so_dntt || '', nv_kinh_doanh: r.nguoi_kd?.full_name || '',
      }
    })
    const daThuDuyetMap = async (lenhIds: string[]) => {
      const m = new Map<string, number>()
      if (!lenhIds.length) return m
      const thu = await selectAll<any>((from, to) => supabaseAdmin
        .from('soct_thu_tien').select('lenh_id, so_tien, trang_thai').eq('trang_thai', 'da_duyet').in('lenh_id', lenhIds).range(from, to))
      for (const t of (thu || [])) m.set(t.lenh_id, (m.get(t.lenh_id) || 0) + (Number(t.so_tien) || 0))
      return m
    }

    let kdChuaThu: any[] = [], kdDaThanhToan: any[] = []
    if (wantKd) {
      const kdCt = await selectAll<any>((from, to) => {
        let q = supabaseAdmin.from('soct_lenh_xuat').select(LX_SELECT)
          .eq('tren_kanban', true).eq('trang_thai_hd', 'Đã lên hóa đơn').not('ngay_xuat_hd', 'is', null)
        if (isoDay.test(cutoff)) q = q.lte('ngay_xuat_hd', cutoff)
        return q.order('ngay_xuat_hd', { ascending: false }).range(from, to)
      })
      const kdTt = await selectAll<any>((from, to) => {
        let q = supabaseAdmin.from('soct_lenh_xuat').select(LX_SELECT)
          .eq('tren_kanban', true).eq('trang_thai_hd', 'Đã thanh toán').not('ngay_xuat_hd', 'is', null)
        if (isoDay.test(tu)) q = q.gte('ngay_xuat_hd', tu)
        if (isoDay.test(den)) q = q.lte('ngay_xuat_hd', den)
        return q.order('ngay_xuat_hd', { ascending: false }).range(from, to)
      })
      const map = await daThuDuyetMap([...(kdCt || []), ...(kdTt || [])].map((r: any) => r.id))
      kdChuaThu = buildKdRows(kdCt || [], map)
      kdDaThanhToan = buildKdRows(kdTt || [], map)
    }

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

    return NextResponse.json({ chua_thu: chuaThu || [], da_thanh_toan: daThanhToan || [], kd_chua_thu: kdChuaThu, kd_da_thanh_toan: kdDaThanhToan })
  } catch (error: any) {
    console.error('Error exporting kanban cong no:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
