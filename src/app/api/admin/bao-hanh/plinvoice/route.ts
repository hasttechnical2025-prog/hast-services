import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// Chuẩn hóa ngày về 'YYYY-MM-DD' (nhận dd/mm/yyyy, yyyy-mm-dd, hoặc Date serial Excel đã đổi sẵn).
function toISODate(v: any): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

// GET: ?serial= -> tra 1 dòng theo serial (auto-fill form). Không có serial -> danh sách đầy đủ.
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    const serial = (new URL(request.url).searchParams.get('serial') || '').trim()
    if (serial) {
      const { data, error } = await supabaseAdmin.from('soct_bh_plinvoice')
        .select('*').eq('serial', serial).order('id', { ascending: false }).limit(1)
      if (error) throw error
      return NextResponse.json({ data: (data && data[0]) || null })
    }
    const rows = await selectAll<any>((from, to) =>
      supabaseAdmin.from('soct_bh_plinvoice').select('*').order('id', { ascending: false }).range(from, to))
    return NextResponse.json({ data: rows || [] })
  } catch (error: any) {
    console.error('Error GET bh/plinvoice:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: thêm 1 dòng, hoặc bulk { items: [...] } (nhập từ Excel). Cột: do_no,item_no,serial,model,fob_date,invoice_no.
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const b = await request.json()
    const mapRow = (it: any) => ({
      do_no: String(it.do_no ?? '').trim() || null,
      item_no: String(it.item_no ?? '').trim() || null,
      serial: String(it.serial ?? '').trim(),
      model: String(it.model ?? '').trim() || null,
      fob_date: toISODate(it.fob_date),
      invoice_no: String(it.invoice_no ?? '').trim() || null,
    })
    const items = Array.isArray(b.items) ? b.items : [b]
    const rows = items.map(mapRow).filter((r: any) => r.serial)
    if (!rows.length) return NextResponse.json({ error: 'Không có dòng hợp lệ (thiếu serial)' }, { status: 400 })
    const { error } = await supabaseAdmin.from('soct_bh_plinvoice').insert(rows)
    if (error) throw error
    await logAudit(session, 'Nhập PL-Invoice (BH)', `${rows.length} dòng`)
    return NextResponse.json({ success: true, count: rows.length })
  } catch (error: any) {
    console.error('Error POST bh/plinvoice:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE: ?id= xóa 1 dòng.
export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })
    const { error } = await supabaseAdmin.from('soct_bh_plinvoice').delete().eq('id', id)
    if (error) throw error
    await logAudit(session, 'Xóa dòng PL-Invoice (BH)', id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error DELETE bh/plinvoice:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
