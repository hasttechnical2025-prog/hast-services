import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

// GET: Lấy danh sách toàn bộ ngày nghỉ lễ
export async function GET() {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const { data, error } = await supabaseAdmin
      .from('soct_ngay_nghi')
      .select('ngay, ghi_chu')
      .order('ngay', { ascending: false })

    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching ngay_nghi:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: Khai báo ngày nghỉ lễ mới (Chỉ Admin)
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) {
      return NextResponse.json({ error: 'Chỉ Admin mới được cấu hình nghỉ lễ' }, { status: 403 })
    }

    const { ngay, ghi_chu } = await request.json()
    if (!ngay) {
      return NextResponse.json({ error: 'Thiếu thông tin ngày' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('soct_ngay_nghi')
      .insert({ ngay, ghi_chu: ghi_chu || null })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ngày này đã được khai báo nghỉ lễ từ trước' }, { status: 400 })
      }
      throw error
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error creating ngay_nghi:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE: Xóa ngày nghỉ lễ (Chỉ Admin)
export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) {
      return NextResponse.json({ error: 'Chỉ Admin mới được thay đổi cấu hình này' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const ngay = searchParams.get('ngay')
    if (!ngay) {
      return NextResponse.json({ error: 'Thiếu ngày cần xóa' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('soct_ngay_nghi')
      .delete()
      .eq('ngay', ngay)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting ngay_nghi:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
