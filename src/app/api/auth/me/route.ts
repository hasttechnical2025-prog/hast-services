import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'

// Trả về thông tin user của phiên đăng nhập hiện tại (đọc từ cookie httpOnly).
// Đọc lại từ DB để user bị xóa/đổi quyền sẽ mất hiệu lực phiên ngay.
export async function GET() {
  try {
    const session = await getSession()

    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const { data, error } = await supabaseAdmin
      .from('soct_users')
      .select('id, full_name, role, telegram_id, is_active')
      .eq('id', session.id)
      .single()

    if (error || !data || data.role !== session.role || data.is_active === false) {
      return NextResponse.json({ error: 'Phiên đăng nhập không còn hợp lệ' }, { status: 401 })
    }

    const { is_active, ...user } = data
    void is_active
    return NextResponse.json({ data: user })
  } catch (error: any) {
    console.error('Error fetching session user:', error)
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 })
  }
}
