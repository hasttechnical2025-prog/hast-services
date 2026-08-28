import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { hashPassword } from '@/lib/password'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'

// GET: Lấy danh sách toàn bộ nhân viên (phục vụ quản lý của Admin)
// Các role không phải admin chỉ nhận id/full_name/role (đủ cho dropdown giao việc)
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff', 'kthc')
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
    if (String(password).length < 6) {
      return NextResponse.json({ error: 'Mật khẩu phải từ 6 ký tự trở lên.' }, { status: 400 })
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

    await logAudit(session, 'Tạo tài khoản', `${full_name} (@${username}, ${role})`)
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
    if (password && String(password).trim() !== '' && String(password).length < 6) {
      return NextResponse.json({ error: 'Mật khẩu phải từ 6 ký tự trở lên.' }, { status: 400 })
    }

    // Rào chống KHÓA QUYỀN: đọc trạng thái hiện tại của tài khoản đích.
    const { data: target } = await supabaseAdmin.from('soct_users').select('role, is_active').eq('id', id).single()
    if (!target) return NextResponse.json({ error: 'Không tìm thấy tài khoản' }, { status: 404 })
    const willBeRole = role !== undefined ? role : target.role
    const willBeActive = is_active !== undefined ? !!is_active : (target.is_active !== false)

    // (1) KHÔNG cho tự hạ quyền / tự ngừng tài khoản đang đăng nhập -> tránh tự khóa mình ra ngoài.
    if (id === session.id) {
      if (willBeRole !== 'admin') return NextResponse.json({ error: 'Không thể tự bỏ quyền admin của tài khoản đang đăng nhập.' }, { status: 400 })
      if (!willBeActive) return NextResponse.json({ error: 'Không thể tự ngừng tài khoản đang đăng nhập.' }, { status: 400 })
    }
    // (2) Bảo vệ ADMIN CUỐI: nếu đang hạ quyền/ngừng một admin active mà làm còn 0 admin -> chặn.
    const targetIsAdminActive = target.role === 'admin' && target.is_active !== false
    const stillAdminActive = willBeRole === 'admin' && willBeActive
    if (targetIsAdminActive && !stillAdminActive) {
      const { data: admins } = await supabaseAdmin.from('soct_users').select('id, is_active').eq('role', 'admin')
      const activeCount = (admins || []).filter((a: any) => a.is_active !== false).length
      if (activeCount <= 1) return NextResponse.json({ error: 'Phải còn ít nhất 1 admin đang hoạt động — không thể hạ quyền/ngừng admin cuối cùng.' }, { status: 400 })
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

    await logAudit(session, 'Sửa tài khoản', `${data.full_name} (@${data.username})${password ? ' — đổi mật khẩu' : ''}${is_active !== undefined ? (is_active ? ' — kích hoạt' : ' — ngừng') : ''}`)
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

    // Bảo vệ ADMIN CUỐI: không cho xóa admin nếu đang là admin active duy nhất còn lại.
    const { data: target } = await supabaseAdmin.from('soct_users').select('role, is_active').eq('id', id).single()
    if (target?.role === 'admin' && target.is_active !== false) {
      const { data: admins } = await supabaseAdmin.from('soct_users').select('id, is_active').eq('role', 'admin')
      const activeCount = (admins || []).filter((a: any) => a.is_active !== false).length
      if (activeCount <= 1) return NextResponse.json({ error: 'Phải còn ít nhất 1 admin đang hoạt động — không thể xóa admin cuối cùng.' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('soct_users')
      .delete()
      .eq('id', id)

    if (error) throw error

    await logAudit(session, 'Xóa tài khoản', `id ${id}`)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting user:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
