import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

const THANG_RE = /^\d{4}-\d{2}$/

// Danh sách doanh số theo tháng (lọc theo năm nếu có ?nam=YYYY)
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const nam = new URL(request.url).searchParams.get('nam')
    let query = supabaseAdmin.from('soct_doanh_so_thang').select('*').order('thang_nam', { ascending: false })
    if (nam && /^\d{4}$/.test(nam)) query = query.like('thang_nam', `${nam}-%`)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching doanh so:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Thêm/sửa doanh số một tháng (upsert theo thang_nam)
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const body = await request.json()
    const { thang_nam, thuc_te, ke_hoach } = body
    if (!THANG_RE.test(thang_nam || '')) return NextResponse.json({ error: 'Thiếu hoặc sai tháng (YYYY-MM)' }, { status: 400 })

    const row = {
      thang_nam,
      thuc_te: Number(thuc_te) || 0,
      ke_hoach: Number(ke_hoach) || 0,
    }
    const { data, error } = await supabaseAdmin
      .from('soct_doanh_so_thang')
      .upsert(row, { onConflict: 'thang_nam' })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error saving doanh so:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Xóa doanh số một tháng
export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const thang = new URL(request.url).searchParams.get('thang_nam')
    if (!THANG_RE.test(thang || '')) return NextResponse.json({ error: 'Thiếu tháng' }, { status: 400 })

    const { error } = await supabaseAdmin.from('soct_doanh_so_thang').delete().eq('thang_nam', thang)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting doanh so:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
