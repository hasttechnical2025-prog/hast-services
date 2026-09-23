import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// Endpoint RIÊNG cho Lệnh xuất hàng (phòng kinh doanh). KHÔNG đụng soct_cong_viec.
// Cách ly: NV kinh_doanh chỉ thấy/sửa lệnh của MÌNH; sale_admin (kinh_doanh + kd_quan_ly) & admin thấy tất cả.

// Lấy cờ quản lý của phiên hiện tại (sale_admin?) + xác định quyền xem-tất-cả.
async function scope(session: any) {
  if (session.role === 'admin') return { isManager: true }
  // kinh_doanh: tra cờ kd_quan_ly
  const { data } = await supabaseAdmin.from('soct_users').select('kd_quan_ly').eq('id', session.id).maybeSingle()
  return { isManager: !!data?.kd_quan_ly }
}

// GET: danh sách lệnh (đã scope theo role) kèm dòng hàng.
// Cấp số lệnh tự động: YYMMDD-xx (prefix theo NGÀY LẬP, xx tăng dần & reset mỗi ngày).
async function nextSoLenh(ngay?: string): Promise<string> {
  const d = String(ngay || new Date(Date.now() + 7 * 3600 * 1000).toISOString()).slice(0, 10)
  const p = d.split('-')
  const prefix = p.length === 3 ? `${p[0].slice(2)}${p[1]}${p[2]}` : ''
  if (!prefix) return ''
  const { data } = await supabaseAdmin.from('soct_lenh_xuat').select('so_lenh').like('so_lenh', `${prefix}-%`)
  let max = 0
  for (const r of (data || [])) { const m = String(r.so_lenh || '').match(/-(\d+)$/); if (m) max = Math.max(max, parseInt(m[1], 10)) }
  return `${prefix}-${String(max + 1).padStart(2, '0')}`
}

export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'kinh_doanh')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    const { isManager } = await scope(session)

    const { searchParams } = new URL(request.url)

    // Gợi ý số lệnh kế tiếp cho form (theo ngày lập) — server vẫn cấp lại lúc lưu để không trùng.
    const nextLenh = searchParams.get('next_lenh')
    if (nextLenh !== null) return NextResponse.json({ next_so_lenh: await nextSoLenh(nextLenh) })

    const id = searchParams.get('id')

    if (id) {
      const { data, error } = await supabaseAdmin
        .from('soct_lenh_xuat')
        .select(`*, soct_lenh_xuat_ct(*), nguoi_kd:soct_users!nguoi_kinh_doanh_id(full_name)`)
        .eq('id', id).single()
      if (error || !data) return NextResponse.json({ error: 'Không tìm thấy lệnh' }, { status: 404 })
      // NV chỉ xem lệnh của mình
      if (!isManager && data.nguoi_kinh_doanh_id !== session.id) {
        return NextResponse.json({ error: 'Không có quyền xem lệnh này' }, { status: 403 })
      }
      if (data.soct_lenh_xuat_ct) data.soct_lenh_xuat_ct.sort((a: any, b: any) => (a.stt || 0) - (b.stt || 0))
      return NextResponse.json({ data })
    }

    const rows = await selectAll<any>((from, to) => {
      let q = supabaseAdmin
        .from('soct_lenh_xuat')
        .select(`*, soct_lenh_xuat_ct(*), nguoi_kd:soct_users!nguoi_kinh_doanh_id(full_name)`)
      if (!isManager) q = q.eq('nguoi_kinh_doanh_id', session.id)   // NV chỉ thấy của mình (scope ở SERVER)
      return q.order('ngay', { ascending: false }).order('created_at', { ascending: false }).range(from, to)
    })
    return NextResponse.json({ data: rows || [], isManager })
  } catch (error: any) {
    console.error('Error GET lenh-xuat:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Chuẩn hóa dòng hàng (bỏ dòng trống, tính thành tiền server-side).
function buildLines(lenhId: string, arr: any[]) {
  return (Array.isArray(arr) ? arr : [])
    .filter((r: any) => r && (String(r.ma_hang || '').trim() || String(r.ten_hang || '').trim()))
    .map((r: any, i: number) => {
      const sl = Number(r.so_luong) || 0
      const dg = Number(r.don_gia) || 0
      return {
        lenh_id: lenhId,
        stt: r.stt || (i + 1),
        ma_hang: (r.ma_hang || '').trim() || null,
        ten_hang: (r.ten_hang || '').trim() || null,
        ten_hang_hd: (r.ten_hang_hd || '').trim() || null,
        dvt: (r.dvt || '').trim() || 'Cái',
        so_luong: sl,
        don_gia: dg,
        vat: Number(r.vat) || 0,
        thanh_tien: Math.round(sl * dg),
        ghi_chu: (r.ghi_chu || '').trim() || null,
      }
    })
}

// POST: tạo lệnh mới (kinh_doanh/admin). NV -> gán chính mình; sale_admin -> gán NV bất kỳ.
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'kinh_doanh')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    const { isManager } = await scope(session)

    const b = await request.json()
    if (!b.ten_khach_hang || !String(b.ten_khach_hang).trim()) {
      return NextResponse.json({ error: 'Vui lòng nhập tên khách hàng' }, { status: 400 })
    }
    const nvId = isManager ? (b.nguoi_kinh_doanh_id || session.id) : session.id

    const { data: lenh, error } = await supabaseAdmin
      .from('soct_lenh_xuat')
      .insert({
        so_lenh: await nextSoLenh(b.ngay),   // server TỰ cấp (YYMMDD-xx), không nhận từ client
        ngay: b.ngay || undefined,
        ten_khach_hang: String(b.ten_khach_hang).trim(),
        dia_chi: (b.dia_chi || '').trim() || null,
        ma_so_thue: (b.ma_so_thue || '').trim() || null,
        so_hop_dong: (b.so_hop_dong || '').trim() || null,
        id_khach_hang: b.id_khach_hang || null,
        nguoi_kinh_doanh_id: nvId,
        created_by: session.id,
        ghi_chu: (b.ghi_chu || '').trim() || null,
        trang_thai_hd: 'Chờ xuất HĐ',
      })
      .select('id')
      .single()
    if (error || !lenh) return NextResponse.json({ error: error?.message || 'Lỗi tạo lệnh' }, { status: 500 })

    const lines = buildLines(lenh.id, b.lines)
    if (lines.length > 0) {
      const { error: e2 } = await supabaseAdmin.from('soct_lenh_xuat_ct').insert(lines)
      if (e2) console.error('Lỗi thêm dòng lệnh xuất:', e2)
    }
    await logAudit(session, 'Tạo lệnh xuất hàng', `KH ${String(b.ten_khach_hang).trim()}`)
    return NextResponse.json({ data: lenh, success: true })
  } catch (error: any) {
    console.error('Error POST lenh-xuat:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT: sửa lệnh — CHỈ khi còn ở cột 1 (Chờ xuất HĐ). Sang kế toán rồi thì khóa (giống kỹ thuật).
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin', 'kinh_doanh')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    const { isManager } = await scope(session)

    const b = await request.json()
    if (!b.id) return NextResponse.json({ error: 'Thiếu id lệnh' }, { status: 400 })

    const { data: cur } = await supabaseAdmin
      .from('soct_lenh_xuat')
      .select('nguoi_kinh_doanh_id, trang_thai_hd')
      .eq('id', b.id).maybeSingle()
    if (!cur) return NextResponse.json({ error: 'Không tìm thấy lệnh' }, { status: 404 })
    if (!isManager && cur.nguoi_kinh_doanh_id !== session.id) {
      return NextResponse.json({ error: 'Không có quyền sửa lệnh này' }, { status: 403 })
    }
    if (cur.trang_thai_hd !== 'Chờ xuất HĐ') {
      return NextResponse.json({ error: 'Lệnh đã bàn giao kế toán — không sửa được. Nhờ kế toán trả về nếu cần.' }, { status: 409 })
    }

    const updates: any = { updated_at: new Date().toISOString() }
    // so_lenh BẤT BIẾN (hệ thống cấp lúc tạo) — không cho sửa qua PUT
    if (b.ngay !== undefined) updates.ngay = b.ngay || undefined
    if (b.ten_khach_hang !== undefined) updates.ten_khach_hang = String(b.ten_khach_hang || '').trim()
    if (b.dia_chi !== undefined) updates.dia_chi = (b.dia_chi || '').trim() || null
    if (b.ma_so_thue !== undefined) updates.ma_so_thue = (b.ma_so_thue || '').trim() || null
    if (b.so_hop_dong !== undefined) updates.so_hop_dong = (b.so_hop_dong || '').trim() || null
    if (b.id_khach_hang !== undefined) updates.id_khach_hang = b.id_khach_hang || null
    if (b.ghi_chu !== undefined) updates.ghi_chu = (b.ghi_chu || '').trim() || null
    if (isManager && b.nguoi_kinh_doanh_id !== undefined) updates.nguoi_kinh_doanh_id = b.nguoi_kinh_doanh_id || null

    const { error } = await supabaseAdmin.from('soct_lenh_xuat').update(updates).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Làm mới dòng hàng nếu client gửi lên
    if (Array.isArray(b.lines)) {
      await supabaseAdmin.from('soct_lenh_xuat_ct').delete().eq('lenh_id', b.id)
      const lines = buildLines(b.id, b.lines)
      if (lines.length > 0) await supabaseAdmin.from('soct_lenh_xuat_ct').insert(lines)
    }
    await logAudit(session, 'Sửa lệnh xuất hàng', `lệnh ${b.id}`)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error PUT lenh-xuat:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE: xóa lệnh — CHỈ khi còn cột 1, và của mình (NV) / bất kỳ (sale_admin/admin).
export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin', 'kinh_doanh')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    const { isManager } = await scope(session)

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu id lệnh' }, { status: 400 })

    const { data: cur } = await supabaseAdmin
      .from('soct_lenh_xuat')
      .select('nguoi_kinh_doanh_id, trang_thai_hd').eq('id', id).maybeSingle()
    if (!cur) return NextResponse.json({ error: 'Không tìm thấy lệnh' }, { status: 404 })
    if (!isManager && cur.nguoi_kinh_doanh_id !== session.id) {
      return NextResponse.json({ error: 'Không có quyền xóa lệnh này' }, { status: 403 })
    }
    if (cur.trang_thai_hd !== 'Chờ xuất HĐ') {
      return NextResponse.json({ error: 'Lệnh đã bàn giao kế toán — không xóa được.' }, { status: 409 })
    }

    const { error } = await supabaseAdmin.from('soct_lenh_xuat').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit(session, 'Xóa lệnh xuất hàng', `lệnh ${id}`)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error DELETE lenh-xuat:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
