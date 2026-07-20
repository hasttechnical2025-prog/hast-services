import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { broadcastKhachChanged } from '@/lib/realtime'

// Khách hàng cụm (một khách - nhiều máy). Chỉ ADMIN (dữ liệu gom công nợ, nhạy cảm) —
// chặn cả API, không chỉ ẩn giao diện.

// Danh sách cụm + số điểm máy mỗi cụm.
export async function GET() {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const clusters = await selectAll((from, to) => supabaseAdmin
      .from('soct_khach_cum')
      .select('ma_khach_hang, ten_khach_hang, dia_chi')
      .order('ten_khach_hang')
      .range(from, to))

    // Các điểm máy đã gán cụm (kèm để client dựng danh sách thành viên + suy ra máy lẻ)
    const members = await selectAll((from, to) => supabaseAdmin
      .from('soct_khach_hang')
      .select('id, ma_may, ten_khach_hang, ma_khach_cum')
      .not('ma_khach_cum', 'is', null)
      .range(from, to))

    const byCum = new Map<string, any[]>()
    for (const m of members as any[]) {
      if (!byCum.has(m.ma_khach_cum)) byCum.set(m.ma_khach_cum, [])
      byCum.get(m.ma_khach_cum)!.push({ id: m.id, ma_may: m.ma_may, ten_khach_hang: m.ten_khach_hang })
    }

    const data = (clusters as any[]).map(c => {
      const mem = byCum.get(c.ma_khach_hang) || []
      return { ...c, so_may: mem.length, members: mem }
    })
    // Toàn bộ id điểm máy đã gán (client suy ra "máy lẻ" = khách còn lại)
    const assignedIds = (members as any[]).map(m => m.id)
    return NextResponse.json({ data, assignedIds })
  } catch (error: any) {
    console.error('Error fetching khach cum:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Tạo cụm mới (nhập tay).
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const body = await request.json()
    const ma = String(body.ma_khach_hang ?? '').trim()
    const ten = String(body.ten_khach_hang ?? '').trim()
    const dia_chi = String(body.dia_chi ?? '').trim()
    if (!ma || !ten) return NextResponse.json({ error: 'Thiếu mã hoặc tên khách hàng' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('soct_khach_cum')
      .insert({ ma_khach_hang: ma, ten_khach_hang: ten, dia_chi: dia_chi || null })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: `Mã khách hàng ${ma} đã tồn tại` }, { status: 400 })
      throw error
    }

    await logAudit(session, 'Tạo khách hàng cụm', `${ma} — ${ten}`)
    await broadcastKhachChanged()
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error creating khach cum:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Sửa tên/địa chỉ cụm (không đổi mã — mã là khóa; muốn đổi mã thì xóa & tạo lại).
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const body = await request.json()
    const ma = String(body.ma_khach_hang ?? '').trim()
    if (!ma) return NextResponse.json({ error: 'Thiếu mã khách hàng' }, { status: 400 })

    const updates: any = {}
    if (body.ten_khach_hang !== undefined) {
      const ten = String(body.ten_khach_hang).trim()
      if (!ten) return NextResponse.json({ error: 'Tên khách hàng không được để trống' }, { status: 400 })
      updates.ten_khach_hang = ten
    }
    if (body.dia_chi !== undefined) updates.dia_chi = String(body.dia_chi).trim() || null
    // Đổi mã cụm: cột FK soct_khach_hang.ma_khach_cum có ON UPDATE CASCADE -> các máy
    // trong cụm tự cập nhật theo, không thất lạc.
    if (body.ma_moi !== undefined) {
      const maMoi = String(body.ma_moi).trim()
      if (!maMoi) return NextResponse.json({ error: 'Mã khách hàng không được để trống' }, { status: 400 })
      if (maMoi !== ma) updates.ma_khach_hang = maMoi
    }

    const { data, error } = await supabaseAdmin
      .from('soct_khach_cum')
      .update(updates)
      .eq('ma_khach_hang', ma)
      .select()
      .single()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: `Mã khách hàng ${updates.ma_khach_hang} đã tồn tại` }, { status: 400 })
      throw error
    }

    await broadcastKhachChanged()
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error updating khach cum:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Gán / gỡ điểm máy vào cụm. body: { ma_khach_cum: string|null, ids: string[] }
// ma_khach_cum = null -> gỡ khỏi cụm (máy về "lẻ").
export async function PATCH(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const { ma_khach_cum, ids } = await request.json()
    if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: 'Chưa chọn điểm máy' }, { status: 400 })

    const target = ma_khach_cum ? String(ma_khach_cum).trim() : null
    const { error } = await supabaseAdmin
      .from('soct_khach_hang')
      .update({ ma_khach_cum: target })
      .in('id', ids)
    if (error) throw error

    await logAudit(session, target ? 'Gán máy vào cụm' : 'Gỡ máy khỏi cụm', `${ids.length} máy${target ? ' → ' + target : ''}`)
    await broadcastKhachChanged()
    return NextResponse.json({ success: true, count: ids.length })
  } catch (error: any) {
    console.error('Error assigning khach cum:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Xóa cụm (?ma=...). Máy thuộc cụm tự về "lẻ" (ON DELETE SET NULL).
export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const ma = searchParams.get('ma')
    if (!ma) return NextResponse.json({ error: 'Thiếu mã khách hàng' }, { status: 400 })

    const { error } = await supabaseAdmin.from('soct_khach_cum').delete().eq('ma_khach_hang', ma)
    if (error) throw error

    await logAudit(session, 'Xóa khách hàng cụm', ma)
    await broadcastKhachChanged()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting khach cum:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
