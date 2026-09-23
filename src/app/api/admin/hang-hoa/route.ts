import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// Danh mục MÁY & HÀNG HÓA (dùng chung Lệnh xuất + BM38). KHÁC kho vật tư soct_kho_hang.
// Đọc: mọi vai trò nghiệp vụ (để vlookup). Quản lý (thêm/sửa/xóa): admin hoặc sale_admin (kinh_doanh + kd_quan_ly).

async function canManage(session: any): Promise<boolean> {
  if (session.role === 'admin') return true
  if (session.role !== 'kinh_doanh') return false
  const { data } = await supabaseAdmin.from('soct_users').select('kd_quan_ly').eq('id', session.id).maybeSingle()
  return !!data?.kd_quan_ly
}

// GET: danh sách toàn bộ (bảng nhỏ, dùng để vlookup ở form).
export async function GET() {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff', 'kthc', 'kinh_doanh')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    const data = await selectAll<any>((from, to) =>
      supabaseAdmin.from('soct_hang_hoa').select('*').order('ma_hang', { ascending: true }).range(from, to))
    return NextResponse.json({ data: data || [] })
  } catch (error: any) {
    console.error('Error GET hang-hoa:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: thêm mã mới
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'kinh_doanh')
    if (!session || !(await canManage(session))) {
      return NextResponse.json({ error: 'Chỉ quản lý kinh doanh / admin được sửa danh mục' }, { status: 403 })
    }
    const b = await request.json()
    const ma = String(b.ma_hang || '').trim().toUpperCase()
    if (!ma) return NextResponse.json({ error: 'Vui lòng nhập mã hàng' }, { status: 400 })
    if (!String(b.ten_hang || '').trim()) return NextResponse.json({ error: 'Vui lòng nhập tên hàng' }, { status: 400 })

    const { error } = await supabaseAdmin.from('soct_hang_hoa').insert({
      ma_hang: ma,
      ten_hang: String(b.ten_hang).trim(),
      dvt: (b.dvt || '').trim() || 'Cái',
      don_gia_niem_yet: Number(b.don_gia_niem_yet) || 0,
      hang: (b.hang || '').trim() || null,
      model: (b.model || '').trim() || null,
      ghi_chu: (b.ghi_chu || '').trim() || null,
    })
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: `Mã ${ma} đã tồn tại` }, { status: 400 })
      throw error
    }
    await logAudit(session, 'Thêm hàng hóa/máy', ma)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error POST hang-hoa:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT: sửa (theo ma_hang, không đổi mã)
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin', 'kinh_doanh')
    if (!session || !(await canManage(session))) {
      return NextResponse.json({ error: 'Chỉ quản lý kinh doanh / admin được sửa danh mục' }, { status: 403 })
    }
    const b = await request.json()
    const ma = String(b.ma_hang || '').trim().toUpperCase()
    if (!ma) return NextResponse.json({ error: 'Thiếu mã hàng' }, { status: 400 })
    const updates: any = { updated_at: new Date().toISOString() }
    if (b.ten_hang !== undefined) updates.ten_hang = String(b.ten_hang || '').trim()
    if (b.dvt !== undefined) updates.dvt = (b.dvt || '').trim() || 'Cái'
    if (b.don_gia_niem_yet !== undefined) updates.don_gia_niem_yet = Number(b.don_gia_niem_yet) || 0
    if (b.hang !== undefined) updates.hang = (b.hang || '').trim() || null
    if (b.model !== undefined) updates.model = (b.model || '').trim() || null
    if (b.ghi_chu !== undefined) updates.ghi_chu = (b.ghi_chu || '').trim() || null
    const { error } = await supabaseAdmin.from('soct_hang_hoa').update(updates).eq('ma_hang', ma)
    if (error) throw error
    await logAudit(session, 'Sửa hàng hóa/máy', ma)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error PUT hang-hoa:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE: xóa 1 mã (?ma=)
export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin', 'kinh_doanh')
    if (!session || !(await canManage(session))) {
      return NextResponse.json({ error: 'Chỉ quản lý kinh doanh / admin được sửa danh mục' }, { status: 403 })
    }
    const ma = String(new URL(request.url).searchParams.get('ma') || '').trim().toUpperCase()
    if (!ma) return NextResponse.json({ error: 'Thiếu mã hàng' }, { status: 400 })
    const { error } = await supabaseAdmin.from('soct_hang_hoa').delete().eq('ma_hang', ma)
    if (error) throw error
    await logAudit(session, 'Xóa hàng hóa/máy', ma)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error DELETE hang-hoa:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
