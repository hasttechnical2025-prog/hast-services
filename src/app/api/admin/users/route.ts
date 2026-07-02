import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { hashPassword } from '@/lib/password'
import { requireRole } from '@/lib/session'

// GET: Lấy danh sách toàn bộ nhân viên (phục vụ quản lý của Admin)
// Các role không phải admin chỉ nhận id/full_name/role (đủ cho dropdown giao việc)
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const onlyKtv = searchParams.get('ktv') === 'true'

    const columns = session.role === 'admin'
      ? 'id, full_name, role, username, telegram_id, is_active'
      : 'id, full_name, role'

    let query = supabaseAdmin.from('soct_users').select(columns)

    if (onlyKtv) {
      query = query.eq('role', 'ktv')
    }

    const { data, error } = await query.order('full_name')

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: Tạo nhân viên mới kèm mã hóa mật khẩu (chỉ admin)
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const body = await request.json()
    const { full_name, role, username, password, telegram_id } = body

    if (!full_name || !role || !username || !password) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('soct_users')
      .insert({
        full_name,
        role,
        username,
        password: hashPassword(password),
        telegram_id: telegram_id || null
      })
      .select('id, full_name, role, username, telegram_id')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Tên đăng nhập này đã tồn tại trên hệ thống' }, { status: 400 })
      }
      throw error
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error creating user:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT: Cập nhật thông tin nhân viên hoặc đổi mật khẩu (chỉ admin)
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const body = await request.json()
    const { id, full_name, role, username, password, telegram_id, is_active } = body

    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID nhân viên' }, { status: 400 })
    }

    const updates: any = {}
    if (full_name !== undefined) updates.full_name = full_name
    if (role !== undefined) updates.role = role
    if (username !== undefined) updates.username = username
    if (telegram_id !== undefined) updates.telegram_id = telegram_id || null
    if (is_active !== undefined) updates.is_active = !!is_active

    // Nếu có mật khẩu mới, băm mật khẩu
    if (password && password.trim() !== '') {
      updates.password = hashPassword(password)
    }

    const { data, error } = await supabaseAdmin
      .from('soct_users')
      .update(updates)
      .eq('id', id)
      .select('id, full_name, role, username, telegram_id, is_active')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Tên đăng nhập này đã tồn tại trên hệ thống' }, { status: 400 })
      }
      throw error
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error updating user:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE: Xóa nhân viên (chỉ admin, không cho tự xóa chính mình)
export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID nhân viên' }, { status: 400 })
    }

    if (id === session.id) {
      return NextResponse.json({ error: 'Không thể xóa tài khoản đang đăng nhập' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('soct_users')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting user:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
