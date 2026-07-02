import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

// Lấy danh mục (tùy chọn lọc theo nhóm). Mọi role văn phòng đều đọc được (form cần).
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const nhom = searchParams.get('nhom')

    let query = supabaseAdmin
      .from('soct_danh_muc')
      .select('id, nhom, gia_tri, thu_tu, active')
      .order('nhom')
      .order('thu_tu')

    if (nhom) query = query.eq('nhom', nhom)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching danh_muc:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Thêm giá trị danh mục (admin)
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const { nhom, gia_tri, thu_tu } = await request.json()
    if (!nhom || !gia_tri || !String(gia_tri).trim()) {
      return NextResponse.json({ error: 'Thiếu nhóm hoặc giá trị' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('soct_danh_muc')
      .insert({ nhom, gia_tri: String(gia_tri).trim(), thu_tu: thu_tu ?? 999 })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Giá trị này đã tồn tại trong nhóm' }, { status: 400 })
      }
      throw error
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error creating danh_muc:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Sửa giá trị / thứ tự / bật-tắt (admin)
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const { id, gia_tri, thu_tu, active } = await request.json()
    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID' }, { status: 400 })
    }

    const updates: any = {}
    if (gia_tri !== undefined) updates.gia_tri = String(gia_tri).trim()
    if (thu_tu !== undefined) updates.thu_tu = thu_tu
    if (active !== undefined) updates.active = !!active

    const { data, error } = await supabaseAdmin
      .from('soct_danh_muc')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Giá trị này đã tồn tại trong nhóm' }, { status: 400 })
      }
      throw error
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error updating danh_muc:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Xóa giá trị danh mục (admin)
export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('soct_danh_muc').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting danh_muc:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
