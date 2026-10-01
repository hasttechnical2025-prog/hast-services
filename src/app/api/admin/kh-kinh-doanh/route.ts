import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { getCauHinh } from '@/lib/config'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// Danh mục KHÁCH HÀNG của phòng Kinh doanh (Lệnh xuất hàng). Bảng riêng soct_kh_kinh_doanh.
// Phân quyền do ADMIN cấu hình: kd_khach_pham_vi (rieng|saleadmin_all|chung) + kd_khach_quyen_sua
// (chu_so_huu|chi_sale_admin). MST duy nhất toàn hệ thống (trừ trống). Soft-delete bằng cột `an`.

async function ctx(session: any) {
  const isAdmin = session.role === 'admin'
  let isManager = isAdmin
  if (!isAdmin) {
    const { data } = await supabaseAdmin.from('soct_users').select('kd_quan_ly').eq('id', session.id).maybeSingle()
    isManager = !!data?.kd_quan_ly
  }
  const cfg = await getCauHinh()
  const phamVi = String(cfg.kd_khach_pham_vi || 'rieng')     // rieng | saleadmin_all | chung
  const quyen = String(cfg.kd_khach_quyen_sua || 'chu_so_huu') // chu_so_huu | chi_sale_admin
  return { isAdmin, isManager, phamVi, quyen }
}

// Có được THẤY khách này không (theo phạm vi + quyền).
function canSee(row: any, session: any, c: { isAdmin: boolean; isManager: boolean; phamVi: string; quyen: string }) {
  if (c.isAdmin) return true
  if (c.isManager) return c.phamVi === 'rieng' ? row.nguoi_tao_id === session.id : true
  // NV kinh doanh thường:
  if (c.quyen === 'chi_sale_admin') return true // không tạo được -> phải thấy toàn bộ để chọn
  return c.phamVi === 'chung' ? true : row.nguoi_tao_id === session.id
}
// Có được SỬA/XÓA khách này không.
function canEdit(row: any, session: any, c: { isAdmin: boolean; isManager: boolean; phamVi: string; quyen: string }) {
  if (c.isAdmin) return true
  if (c.isManager) return canSee(row, session, c)
  if (c.quyen === 'chi_sale_admin') return false
  return row.nguoi_tao_id === session.id
}
function canCreate(c: { isAdmin: boolean; isManager: boolean; quyen: string }) {
  return c.isAdmin || c.isManager || c.quyen === 'chu_so_huu'
}

// GET: ?cum=1 -> danh sách khách CỤM kỹ thuật (để "Lấy từ khách Kỹ thuật"); mặc định -> danh mục khách KD.
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'kinh_doanh')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    const { searchParams } = new URL(request.url)

    if (searchParams.get('cum') === '1') {
      const rows = await selectAll<any>((from, to) => supabaseAdmin
        .from('soct_khach_cum')
        .select('ma_khach_hang, ten_khach_hang, dia_chi, ma_so_thue, email_ke_toan')
        .order('ten_khach_hang').range(from, to))
      return NextResponse.json({ data: rows || [] })
    }

    const c = await ctx(session)
    const all = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_kh_kinh_doanh')
      .select('*, nguoi_tao:soct_users!nguoi_tao_id(full_name)')
      .eq('an', false)
      .order('ten_khach_hang').range(from, to))
    const data = (all || []).filter(r => canSee(r, session, c))
    return NextResponse.json({
      data,
      caps: { isAdmin: c.isAdmin, isManager: c.isManager, phamVi: c.phamVi, quyen: c.quyen, canCreate: canCreate(c), myId: session.id },
    })
  } catch (error: any) {
    console.error('Error GET kh-kinh-doanh:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Kiểm trùng MST toàn hệ thống (chỉ khách đang hoạt động, bỏ qua MST trống). excludeId để bỏ chính nó khi sửa.
async function mstConflict(mst: string, excludeId: string | null, session: any, c: any): Promise<NextResponse | null> {
  const m = String(mst || '').trim()
  if (!m) return null
  let q = supabaseAdmin.from('soct_kh_kinh_doanh').select('id, ten_khach_hang, nguoi_tao_id, an').eq('ma_so_thue', m).eq('an', false)
  if (excludeId) q = q.neq('id', excludeId)
  const { data } = await q
  const hit = (data || [])[0]
  if (!hit) return null
  // Trùng -> chặn. Thông điệp tùy quyền xem: thấy được thì nêu tên; không thì báo chung.
  if (canSee(hit, session, c)) {
    return NextResponse.json({ error: `MST này đã có: ${hit.ten_khach_hang}` }, { status: 409 })
  }
  return NextResponse.json({ error: 'MST vừa nhập đã có trên hệ thống. Vui lòng kiểm tra lại.' }, { status: 409 })
}

// POST: tạo khách mới (hoặc copy từ cụm — client gửi kèm nguon_cum_ma).
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'kinh_doanh')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    const c = await ctx(session)
    if (!canCreate(c)) return NextResponse.json({ error: 'Chỉ quản lý kinh doanh (sale_admin) mới được thêm khách.' }, { status: 403 })
    const b = await request.json()
    const ten = String(b.ten_khach_hang || '').trim()
    if (!ten) return NextResponse.json({ error: 'Vui lòng nhập tên khách hàng' }, { status: 400 })

    const conflict = await mstConflict(b.ma_so_thue, null, session, c)
    if (conflict) return conflict

    const { data, error } = await supabaseAdmin.from('soct_kh_kinh_doanh').insert({
      ten_khach_hang: ten,
      dia_chi: (b.dia_chi || '').trim() || null,
      ma_so_thue: (b.ma_so_thue || '').trim() || null,
      email_nhan_hd: (b.email_nhan_hd || '').trim() || null,
      so_hop_dong: (b.so_hop_dong || '').trim() || null,
      ghi_chu: (b.ghi_chu || '').trim() || null,
      nguon_cum_ma: (b.nguon_cum_ma || '').trim() || null,
      nguoi_tao_id: session.id,
    }).select('*, nguoi_tao:soct_users!nguoi_tao_id(full_name)').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit(session, 'Thêm khách KD', ten)
    return NextResponse.json({ data, success: true })
  } catch (error: any) {
    console.error('Error POST kh-kinh-doanh:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT: sửa khách.
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin', 'kinh_doanh')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    const c = await ctx(session)
    const b = await request.json()
    if (!b.id) return NextResponse.json({ error: 'Thiếu id khách' }, { status: 400 })
    const { data: cur } = await supabaseAdmin.from('soct_kh_kinh_doanh').select('*').eq('id', b.id).maybeSingle()
    if (!cur) return NextResponse.json({ error: 'Không tìm thấy khách' }, { status: 404 })
    if (!canEdit(cur, session, c)) return NextResponse.json({ error: 'Không có quyền sửa khách này' }, { status: 403 })

    if (b.ma_so_thue !== undefined) {
      const conflict = await mstConflict(b.ma_so_thue, b.id, session, c)
      if (conflict) return conflict
    }
    const updates: any = { updated_at: new Date().toISOString() }
    if (b.ten_khach_hang !== undefined) {
      const ten = String(b.ten_khach_hang || '').trim()
      if (!ten) return NextResponse.json({ error: 'Tên khách không được trống' }, { status: 400 })
      updates.ten_khach_hang = ten
    }
    if (b.dia_chi !== undefined) updates.dia_chi = (b.dia_chi || '').trim() || null
    if (b.ma_so_thue !== undefined) updates.ma_so_thue = (b.ma_so_thue || '').trim() || null
    if (b.email_nhan_hd !== undefined) updates.email_nhan_hd = (b.email_nhan_hd || '').trim() || null
    if (b.so_hop_dong !== undefined) updates.so_hop_dong = (b.so_hop_dong || '').trim() || null
    if (b.ghi_chu !== undefined) updates.ghi_chu = (b.ghi_chu || '').trim() || null

    const { data, error } = await supabaseAdmin.from('soct_kh_kinh_doanh').update(updates).eq('id', b.id)
      .select('*, nguoi_tao:soct_users!nguoi_tao_id(full_name)').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit(session, 'Sửa khách KD', cur.ten_khach_hang)
    return NextResponse.json({ data, success: true })
  } catch (error: any) {
    console.error('Error PUT kh-kinh-doanh:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE ?id= -> soft-delete (ẩn). Lệnh cũ vẫn giữ snapshot.
export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin', 'kinh_doanh')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    const c = await ctx(session)
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })
    const { data: cur } = await supabaseAdmin.from('soct_kh_kinh_doanh').select('*').eq('id', id).maybeSingle()
    if (!cur) return NextResponse.json({ error: 'Không tìm thấy khách' }, { status: 404 })
    if (!canEdit(cur, session, c)) return NextResponse.json({ error: 'Không có quyền xóa khách này' }, { status: 403 })
    const { error } = await supabaseAdmin.from('soct_kh_kinh_doanh').update({ an: true, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit(session, 'Ẩn khách KD', cur.ten_khach_hang)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error DELETE kh-kinh-doanh:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
