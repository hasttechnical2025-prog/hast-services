import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

const YMD = /^\d{4}-\d{2}-\d{2}$/
const YM = /^\d{4}-\d{2}$/
// soct_ot có 2 FK -> soct_users (nhan_vien_id, nguoi_tao): PHẢI chỉ rõ !nhan_vien_id khi embed.
const SEL = 'id, nhan_vien_id, ngay, tu_gio, den_gio, dia_diem, dau_viec, ket_qua, ghi_chu, created_at, soct_users!nhan_vien_id ( full_name )'

// Mốc đầu tháng sau (để lọc < nextMonth): 'YYYY-MM' -> 'YYYY-MM-01' tháng kế.
function nextMonthStart(thang: string): string {
  const [y, m] = thang.split('-').map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return `${ny}-${String(nm).padStart(2, '0')}-01`
}

// GET ?thang=YYYY-MM (bắt buộc) &nv=<id> (tùy chọn): danh sách ca OT trong tháng.
export async function GET(request: Request) {
  try {
    const session = await requireTab('quan_ly', 'quan_ly.lam_them_gio')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const sp = new URL(request.url).searchParams
    const thang = sp.get('thang') || ''
    const nv = sp.get('nv') || ''
    if (!YM.test(thang)) return NextResponse.json({ error: 'Thiếu/sai tham số tháng (YYYY-MM)' }, { status: 400 })

    const start = `${thang}-01`
    const end = nextMonthStart(thang)
    const data = await selectAll<any>((from, to) => {
      let q = supabaseAdmin.from('soct_ot').select(SEL)
        .gte('ngay', start).lt('ngay', end)
      if (nv && nv !== 'all') q = q.eq('nhan_vien_id', nv)
      return q.order('ngay', { ascending: true }).range(from, to)
    })
    return NextResponse.json({ data: data || [] })
  } catch (error: any) {
    console.error('Error GET ot:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: thêm/sửa 1 ca OT. Chỉ admin + tech_admin (kthc chỉ xem + xuất).
// Body { id?, nhan_vien_id, ngay, tu_gio?, den_gio?, dia_diem?, dau_viec?, ket_qua?, ghi_chu? }
export async function POST(request: Request) {
  try {
    const session = await requireTab('quan_ly', 'quan_ly.lam_them_gio')
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    if (!['admin', 'tech_admin'].includes(session.role))
      return NextResponse.json({ error: 'Chỉ Tech Admin / Admin được nhập ca OT' }, { status: 403 })

    const b = await request.json()
    const clean = (v: any) => { const s = String(v ?? '').trim(); return s || null }
    if (!b.nhan_vien_id) return NextResponse.json({ error: 'Thiếu nhân viên' }, { status: 400 })
    if (!YMD.test(String(b.ngay || ''))) return NextResponse.json({ error: 'Thiếu/sai ngày' }, { status: 400 })

    const row: any = {
      nhan_vien_id: b.nhan_vien_id,
      ngay: b.ngay,
      tu_gio: clean(b.tu_gio),
      den_gio: clean(b.den_gio),
      dia_diem: clean(b.dia_diem),
      dau_viec: clean(b.dau_viec),
      ket_qua: clean(b.ket_qua) || 'Hoàn thành',
      ghi_chu: clean(b.ghi_chu),
    }

    if (b.id) {
      const { error } = await supabaseAdmin.from('soct_ot').update(row).eq('id', b.id)
      if (error) throw error
      await logAudit(session, 'Sửa ca OT', `${row.ngay}`)
    } else {
      row.nguoi_tao = session.id
      const { error } = await supabaseAdmin.from('soct_ot').insert(row)
      if (error) throw error
      await logAudit(session, 'Thêm ca OT', `${row.ngay}`)
    }
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error POST ot:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE ?id= : xóa 1 ca OT. Chỉ admin + tech_admin.
export async function DELETE(request: Request) {
  try {
    const session = await requireTab('quan_ly', 'quan_ly.lam_them_gio')
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    if (!['admin', 'tech_admin'].includes(session.role))
      return NextResponse.json({ error: 'Chỉ Tech Admin / Admin được xóa ca OT' }, { status: 403 })

    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })
    const { error } = await supabaseAdmin.from('soct_ot').delete().eq('id', id)
    if (error) throw error
    await logAudit(session, 'Xóa ca OT', id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error DELETE ot:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
