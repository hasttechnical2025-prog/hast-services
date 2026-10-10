import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const gate = () => requireTab('cong_viec', 'cong_viec.cham_soc_kh')

// GET ?cum=<ma> | ?tn=<id> : nhật ký chăm sóc của 1 khách, mới nhất trước.
export async function GET(request: Request) {
  try {
    const session = await gate()
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const sp = new URL(request.url).searchParams
    const cum = sp.get('cum'); const tn = sp.get('tn')
    if (!cum && !tn) return NextResponse.json({ error: 'Thiếu khách' }, { status: 400 })
    let q = supabaseAdmin.from('soct_cskh_log').select('*').order('ngay', { ascending: false }).order('id', { ascending: false })
    q = cum ? q.eq('ma_khach_cum', cum) : q.eq('tiem_nang_id', Number(tn))
    const { data, error } = await q
    if (error) throw error
    return NextResponse.json({ data: data || [] })
  } catch (error: any) {
    console.error('Error GET cskh/log:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: thêm 1 lần chăm sóc. Body: { ma_khach_cum | tiem_nang_id, ngay, kenh, noi_dung, ket_qua, viec_tiep, ngay_hen }
export async function POST(request: Request) {
  try {
    const session = await gate()
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const b = await request.json()
    const ma_khach_cum = b.ma_khach_cum ? String(b.ma_khach_cum) : null
    const tiem_nang_id = b.tiem_nang_id != null ? Number(b.tiem_nang_id) : null
    if (!ma_khach_cum && !tiem_nang_id) return NextResponse.json({ error: 'Thiếu khách' }, { status: 400 })
    const { error } = await supabaseAdmin.from('soct_cskh_log').insert({
      ma_khach_cum, tiem_nang_id,
      ngay: b.ngay || new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10),
      kenh: b.kenh || null, noi_dung: b.noi_dung || null, ket_qua: b.ket_qua || null,
      viec_tiep: b.viec_tiep || null, ngay_hen: b.ngay_hen || null,
      nguoi_id: session.id, nguoi_ten: session.full_name,
    })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error POST cskh/log:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE ?id= : xóa 1 dòng nhật ký.
export async function DELETE(request: Request) {
  try {
    const session = await gate()
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })
    const { error } = await supabaseAdmin.from('soct_cskh_log').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error DELETE cskh/log:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
