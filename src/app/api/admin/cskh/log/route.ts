import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'
import { broadcastCskhChanged } from '@/lib/realtime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const gate = () => requireTab('cong_viec', 'cong_viec.cham_soc_kh')
const KENH = ['Điện thoại', 'Zalo', 'Email', 'Onsite', 'Khác']

// GET ?ma_may= : nhật ký chăm sóc + lịch sử lấy hàng của 1 máy.
export async function GET(request: Request) {
  try {
    const session = await gate()
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const ma = (new URL(request.url).searchParams.get('ma_may') || '').trim()
    if (!ma) return NextResponse.json({ error: 'Thiếu mã máy' }, { status: 400 })

    const [logs, lichsu] = await Promise.all([
      selectAll<any>((f, t) => supabaseAdmin.from('soct_cskh_log').select('*').eq('ma_may', ma).order('ngay', { ascending: false }).range(f, t)),
      selectAll<any>((f, t) => supabaseAdmin.from('soct_cskh_lichsu').select('thang, vat_tu').eq('ma_may', ma).order('thang', { ascending: false }).range(f, t)),
    ])
    return NextResponse.json({ logs: logs || [], lichsu: lichsu || [] })
  } catch (error: any) {
    console.error('Error GET cskh/log:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST : ghi 1 lượt chăm sóc.
export async function POST(request: Request) {
  try {
    const session = await gate()
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const b = await request.json()
    const ma = String(b.ma_may || '').trim()
    if (!ma) return NextResponse.json({ error: 'Thiếu mã máy' }, { status: 400 })
    const { error } = await supabaseAdmin.from('soct_cskh_log').insert({
      ma_may: ma,
      ngay: (String(b.ngay || '').slice(0, 10)) || new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10),
      kenh: KENH.includes(b.kenh) ? b.kenh : null,
      noi_dung: b.noi_dung || null, ket_qua: b.ket_qua || null, viec_tiep: b.viec_tiep || null,
      ngay_hen: (String(b.ngay_hen || '').slice(0, 10)) || null,
      nguoi_id: session.id, nguoi_ten: session.full_name || null,
    })
    if (error) throw error
    await broadcastCskhChanged()
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
    await broadcastCskhChanged()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error DELETE cskh/log:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
