import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// "Kho máy thuê": biên bản giám định máy thuê/CPC do app Techbot lập (bảng `inspections`).
// HAST và Techbot DÙNG CHUNG một Supabase project -> đọc/ghi thẳng, không cần cầu nối API.
// Bảng inspections: cột chuẩn (serial, model, khach_hang) + cột `data` (jsonb) chứa toàn
// bộ trường phiếu: machine_condition (tình trạng), counter, ktv, dia_chi, ...

export async function GET() {
  try {
    const session = await requireTab('tai_chinh', 'tai_chinh.kho_may_thue')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const { data, error } = await supabaseAdmin
      .from('inspections')
      .select('id, serial, model, khach_hang, created_at, data')
      .order('created_at', { ascending: false })
      .range(0, 999)
    if (error) throw error

    const rows = (data || []).map((r: any) => {
      const d = r.data || {}
      return {
        id: r.id,
        serial: r.serial || '',
        model: r.model || '',
        khach_hang: r.khach_hang || '',
        dia_chi: d.dia_chi || '',
        tinh_trang: d.machine_condition || '',
        counter: d.counter || '',
        ktv: d.ktv || '',
        ngay: r.created_at,
      }
    })
    return NextResponse.json({ data: rows })
  } catch (error: any) {
    console.error('Error fetching kho may thue:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Sửa biên bản (dùng khi máy được cho thuê lại -> cập nhật khách/địa chỉ/tình trạng/counter).
// Merge vào `data` jsonb để KHÔNG làm mất các trường khác của phiếu Techbot; đồng bộ cả
// cột chuẩn hóa khach_hang.
export async function PUT(request: Request) {
  try {
    const session = await requireTab('tai_chinh', 'tai_chinh.kho_may_thue')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const { id, khach_hang, dia_chi, tinh_trang, counter } = await request.json()
    if (!id) return NextResponse.json({ error: 'Thiếu ID biên bản' }, { status: 400 })

    const { data: cur, error: e1 } = await supabaseAdmin.from('inspections').select('data').eq('id', id).single()
    if (e1 || !cur) return NextResponse.json({ error: 'Không tìm thấy biên bản' }, { status: 404 })

    const old = cur.data || {}
    const newData = {
      ...old,
      khach_hang: khach_hang ?? old.khach_hang ?? '',
      dia_chi: dia_chi ?? old.dia_chi ?? '',
      machine_condition: tinh_trang ?? old.machine_condition ?? '',
      counter: counter ?? old.counter ?? '',
    }

    const { error } = await supabaseAdmin
      .from('inspections')
      .update({ khach_hang: (khach_hang ?? null) || null, data: newData })
      .eq('id', id)
    if (error) throw error

    await logAudit(session, 'Sửa kho máy thuê', `biên bản ${old.serial || old.model || id}`)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating kho may thue:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
