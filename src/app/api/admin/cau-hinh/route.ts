import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { clearCauHinhCache } from '@/lib/config'

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

    const body = await request.json()

    // Lưu nhiều khóa một lần: { items: { khoa: gia_tri, ... } }
    if (body.items && typeof body.items === 'object') {
      const rows = Object.entries(body.items).map(([khoa, gia_tri]) => ({ khoa, gia_tri: String(gia_tri) }))
      if (rows.length === 0) return NextResponse.json({ data: {} })
      const { error } = await supabaseAdmin.from('soct_cau_hinh').upsert(rows, { onConflict: 'khoa' })
      if (error) throw error
      clearCauHinhCache() // đổi cấu hình (VD cờ bảo trì) có hiệu lực ngay, khỏi chờ hết TTL
      return NextResponse.json({ success: true, count: rows.length })
    }

    const { khoa, gia_tri } = body
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
