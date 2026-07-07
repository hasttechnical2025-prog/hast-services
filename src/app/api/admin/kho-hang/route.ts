import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole, requireTab } from '@/lib/session'

// Lấy danh sách hàng hóa trong kho
export async function GET() {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    }

    // Lấy toàn bộ (kho hàng có thể vượt 1000 mã)
    const data = await selectAll((from, to) => supabaseAdmin
      .from('soct_kho_hang')
      .select('*')
      .order('ma_hang')
      .range(from, to))

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching inventory:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Thêm hàng hóa mới hoặc cập nhật tồn kho (nếu cần cho dropdown tùy biến)
export async function POST(request: Request) {
  try {
    const session = await requireTab('kho_hang', 'kho_hang.ton_kho')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const body = await request.json()
    const { ma_hang, ten_hang, model, hang, ton_kho } = body

    if (!ma_hang || !ten_hang) {
      return NextResponse.json({ error: 'Thiếu mã hàng hoặc tên hàng' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('soct_kho_hang')
      .upsert({
        ma_hang,
        ten_hang,
        model: model || null,
        hang: hang || null,
        ton_kho: ton_kho || 0
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error updating inventory item:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Xóa hàng hóa khỏi kho hàng
export async function DELETE(request: Request) {
  try {
    const session = await requireTab('kho_hang', 'kho_hang.ton_kho')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const ma_hang = searchParams.get('ma_hang')
    const all = searchParams.get('all') === '1'

    if (!all && !ma_hang) {
      return NextResponse.json({ error: 'Thiếu mã hàng' }, { status: 400 })
    }

    // Xóa cứng: toàn bộ (khi nhập lại dữ liệu) hoặc theo một mã
    const query = supabaseAdmin.from('soct_kho_hang').delete()
    const { error } = all
      ? await query.not('ma_hang', 'is', null)
      : await query.eq('ma_hang', ma_hang)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting inventory item:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
