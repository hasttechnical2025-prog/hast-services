import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

const fmtDate = (s: string) => {
  if (!s) return ''
  const d = new Date(s)
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

// GET ?tu=YYYY-MM-DD&den=YYYY-MM-DD : danh sách phiếu MIỄN PHÍ (MF) đã HOÀN THÀNH trong khoảng
// ngày phiếu, phục vụ kế toán (kthc) tự đối chiếu phần mềm kế toán. CHỈ admin + kthc.
// MF = mien_phi=true VÀ có ≥1 dòng vật tư (giống badge MF ở Sổ công tác). Cột khớp "Xuất DS giao việc".
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'kthc')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const tu = searchParams.get('tu') || ''
    const den = searchParams.get('den') || ''
    if (!tu || !den) return NextResponse.json({ error: 'Thiếu khoảng ngày (tu/den)' }, { status: 400 })
    if (tu > den) return NextResponse.json({ error: 'Từ ngày phải ≤ Đến ngày' }, { status: 400 })

    const data = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_cong_viec')
      .select(`
        id, ngay, report, ma_may, loai_cong_viec, km, ket_qua, ghi_chu, so_luong,
        soct_khach_hang ( ten_khach_hang, dia_chi, model, vi_tri_dat_may ),
        soct_users!ktv_id ( full_name ),
        soct_chi_tiet_vat_tu ( ma_hang, so_luong, soct_kho_hang ( ten_hang ) )
      `)
      .is('nguon', null)
      .eq('mien_phi', true)
      .eq('ket_qua', 'Hoàn thành')
      .gte('ngay', tu)
      .lte('ngay', den)
      .order('ngay', { ascending: true })
      .order('report', { ascending: true })
      .range(from, to))

    // MF thực = có ≥1 dòng vật tư (đồng bộ định nghĩa badge MF).
    const mf = (data || []).filter((j: any) => (j.soct_chi_tiet_vat_tu || []).length > 0)

    const headers = ['Ngày', 'Số phiếu', 'Khách hàng', 'Địa chỉ', 'Mã máy', 'Model', 'SL', 'Loại việc', 'Mã hàng', 'Tên hàng', 'SL hàng', 'KTV', 'KM', 'Trạng thái', 'Ghi chú']
    const rows = mf.map((j: any) => {
      const vt = j.soct_chi_tiet_vat_tu || []
      const kh = j.soct_khach_hang
      return [
        fmtDate(j.ngay), j.report || '', kh?.ten_khach_hang || '',
        kh?.vi_tri_dat_may || kh?.dia_chi || '', j.ma_may || '',
        kh?.model || '', j.so_luong || 1, j.loai_cong_viec || '',
        vt.map((v: any) => v.ma_hang).filter(Boolean).join(', '),
        vt.map((v: any) => v.soct_kho_hang?.ten_hang || v.ma_hang).filter(Boolean).join(', '),
        vt.filter((v: any) => v.ma_hang).map((v: any) => v.so_luong ?? '').join(', '),
        j.soct_users?.full_name || 'Chưa giao', j.km, j.ket_qua, j.ghi_chu || '',
      ]
    })

    await logAudit(session, 'Xuất DS phiếu MF', `${tu} → ${den} · ${rows.length} phiếu`)
    return NextResponse.json({ headers, rows })
  } catch (error: any) {
    console.error('Error GET kanban-hd/export-mf:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
