import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab, requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// Cột giá role được XEM. admin: cả 3. tech_admin: cả 3. staff: niêm yết + nhân viên. kthc/kinh_doanh: chỉ niêm yết.
function priceCols(role: string) {
  if (role === 'admin' || role === 'tech_admin') return { niem_yet: true, nhan_vien: true, quan_ly: true }
  if (role === 'staff') return { niem_yet: true, nhan_vien: true, quan_ly: false }
  return { niem_yet: true, nhan_vien: false, quan_ly: false }   // kthc / kinh_doanh (khi được mở)
}

// GET: danh sách vật tư + giá (đã lọc cột theo role). Non-admin chỉ trả mã CÓ giá (cột role xem được ≠ null).
export async function GET() {
  try {
    const session = await requireTab('kho_hang', 'kho_hang.gia_niem_yet')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    const isAdmin = session.role === 'admin'
    const cols = priceCols(session.role)

    const rows = await selectAll<any>((from, to) =>
      supabaseAdmin
        .from('soct_kho_hang')
        .select('ma_hang, ten_hang, model, hang, ton_kho, gia_niem_yet, gia_nhan_vien, gia_quan_ly')
        .order('ma_hang', { ascending: true })
        .range(from, to))

    const list = (rows || []).map((r: any) => {
      const o: any = { ma_hang: r.ma_hang, ten_hang: r.ten_hang, model: r.model, hang: r.hang, ton_kho: r.ton_kho }
      if (cols.niem_yet) o.gia_niem_yet = r.gia_niem_yet
      if (cols.nhan_vien) o.gia_nhan_vien = r.gia_nhan_vien
      if (cols.quan_ly) o.gia_quan_ly = r.gia_quan_ly
      return o
    }).filter((o: any) => {
      if (isAdmin) return true   // admin thấy TOÀN BỘ kho (để nhập giá)
      // non-admin: chỉ mã có ≥1 giá role được xem
      return (cols.niem_yet && o.gia_niem_yet != null) || (cols.nhan_vien && o.gia_nhan_vien != null) || (cols.quan_ly && o.gia_quan_ly != null)
    })

    return NextResponse.json({ data: list, cols, canEdit: isAdmin })
  } catch (error: any) {
    console.error('Error GET gia-niem-yet:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT: nhập/sửa giá — CHỈ admin. Body: { ma_hang, gia_niem_yet?, gia_nhan_vien?, gia_quan_ly? } ('' -> null)
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Chỉ admin được nhập giá niêm yết' }, { status: 401 })
    const b = await request.json()
    const ma = String(b.ma_hang || '').trim()
    if (!ma) return NextResponse.json({ error: 'Thiếu mã hàng' }, { status: 400 })
    const num = (v: any) => (v === '' || v == null) ? null : (Number(String(v).replace(/\D/g, '')) || 0)
    const updates: any = {}
    if (b.gia_niem_yet !== undefined) updates.gia_niem_yet = num(b.gia_niem_yet)
    if (b.gia_nhan_vien !== undefined) updates.gia_nhan_vien = num(b.gia_nhan_vien)
    if (b.gia_quan_ly !== undefined) updates.gia_quan_ly = num(b.gia_quan_ly)
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Không có giá để cập nhật' }, { status: 400 })
    const { error } = await supabaseAdmin.from('soct_kho_hang').update(updates).eq('ma_hang', ma)
    if (error) throw error
    await logAudit(session, 'Sửa giá niêm yết', ma)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error PUT gia-niem-yet:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
