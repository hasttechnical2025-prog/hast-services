import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { broadcastKhachChanged } from '@/lib/realtime'

// Tạm hoãn / bỏ tạm hoãn bảo trì cho CẢ NHÓM máy (1 cụm hoặc 1 khách lẻ nhiều điểm máy).
// Áp cho TOÀN BỘ máy trong nhóm (vô hại với máy không HĐBT — canBaoTriThang vẫn lọc theo HĐ trước).
// Body:
//   { ids: number[], tu: 'YYYY-MM', den?: 'YYYY-MM'|null }  -> đặt tạm hoãn [tu, den] (den trống = vô hạn)
//   { ids: number[], clear: true }                           -> bỏ tạm hoãn (xoá cả 2 mốc)
const reThang = /^\d{4}-\d{2}$/

export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const body = await request.json()
    const ids: number[] = Array.isArray(body.ids) ? body.ids.filter((x: any) => Number.isFinite(Number(x))).map(Number) : []
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Không có máy nào trong nhóm để tạm hoãn' }, { status: 400 })
    }

    let updates: { tam_dung_tu_thang: string | null; tam_dung_den_thang: string | null }

    if (body.clear) {
      updates = { tam_dung_tu_thang: null, tam_dung_den_thang: null }
    } else {
      const tu = String(body.tu || '').trim()
      if (!reThang.test(tu)) {
        return NextResponse.json({ error: 'Thiếu/sai tháng bắt đầu tạm hoãn (YYYY-MM)' }, { status: 400 })
      }
      const den = String(body.den || '').trim()
      if (den && !reThang.test(den)) {
        return NextResponse.json({ error: 'Tháng kết thúc không hợp lệ (YYYY-MM)' }, { status: 400 })
      }
      if (den && den < tu) {
        return NextResponse.json({ error: 'Tháng kết thúc phải sau hoặc bằng tháng bắt đầu' }, { status: 400 })
      }
      updates = { tam_dung_tu_thang: tu, tam_dung_den_thang: den || null }
    }

    const { data, error } = await supabaseAdmin
      .from('soct_khach_hang')
      .update(updates)
      .in('id', ids)
      .select('id')

    if (error) throw error

    await broadcastKhachChanged()
    return NextResponse.json({ success: true, count: data?.length || 0 })
  } catch (error: any) {
    console.error('Lỗi tạm hoãn bảo trì nhóm:', error)
    return NextResponse.json({ error: error?.message || 'Lỗi không xác định' }, { status: 500 })
  }
}
