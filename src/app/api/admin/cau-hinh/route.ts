import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

// Lấy toàn bộ cấu hình dưới dạng object { khoa: gia_tri }
export async function GET() {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    }

    const { data, error } = await supabaseAdmin.from('soct_cau_hinh').select('khoa, gia_tri')
    if (error) throw error

    const config: Record<string, string> = {}
    for (const row of data) config[row.khoa] = row.gia_tri
    return NextResponse.json({ data: config })
  } catch (error: any) {
    console.error('Error fetching cau_hinh:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Cập nhật một cấu hình (admin)
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const { khoa, gia_tri } = await request.json()
    if (!khoa) {
      return NextResponse.json({ error: 'Thiếu khóa cấu hình' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('soct_cau_hinh')
      .upsert({ khoa, gia_tri: String(gia_tri) }, { onConflict: 'khoa' })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error updating cau_hinh:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
