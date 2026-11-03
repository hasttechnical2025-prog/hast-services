import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// DM Hàng: danh mục mã vật tư claim được của hãng (RIÊNG, không nối kho app).
export async function GET() {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    const rows = await selectAll<any>((from, to) =>
      supabaseAdmin.from('soct_bh_dmhang').select('*').order('ma_hang', { ascending: true }).range(from, to))
    return NextResponse.json({ data: rows || [] })
  } catch (error: any) {
    console.error('Error GET bh/dmhang:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: thêm 1 mã hoặc bulk { items } (upsert theo ma_hang).
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const b = await request.json()
    const map = (it: any) => ({
      ma_hang: String(it.ma_hang ?? '').trim(),
      ten_hang: String(it.ten_hang ?? '').trim() || null,
      model: String(it.model ?? '').trim() || null,
      ghi_chu: String(it.ghi_chu ?? '').trim() || null,
    })
    const items = Array.isArray(b.items) ? b.items : [b]
    const rows = items.map(map).filter((r: any) => r.ma_hang)
    if (!rows.length) return NextResponse.json({ error: 'Không có dòng hợp lệ (thiếu mã hàng)' }, { status: 400 })
    const { error } = await supabaseAdmin.from('soct_bh_dmhang').upsert(rows, { onConflict: 'ma_hang' })
    if (error) throw error
    await logAudit(session, 'Nhập DM Hàng (BH)', `${rows.length} mã`)
    return NextResponse.json({ success: true, count: rows.length })
  } catch (error: any) {
    console.error('Error POST bh/dmhang:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })
    const { error } = await supabaseAdmin.from('soct_bh_dmhang').delete().eq('id', id)
    if (error) throw error
    await logAudit(session, 'Xóa mã DM Hàng (BH)', id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error DELETE bh/dmhang:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
