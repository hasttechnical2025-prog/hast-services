import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Lấy danh sách hàng hóa trong kho
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('soct_kho_hang')
      .select('*')
      .order('ma_hang')

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching inventory:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Thêm hàng hóa mới hoặc cập nhật tồn kho (nếu cần cho dropdown tùy biến)
export async function POST(request: Request) {
  try {
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
