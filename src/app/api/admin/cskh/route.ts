import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const gate = () => requireTab('cong_viec', 'cong_viec.cham_soc_kh')

// GET: danh sách CSKH hợp nhất = khách CỤM (soct_khach_cum) + khách TIỀM NĂNG (soct_cskh_khach),
// mỗi khách kèm: lần chăm sóc gần nhất, hẹn kế tiếp, số lần chăm sóc. Client tự lọc/sắp.
export async function GET() {
  try {
    const session = await gate()
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const [cum, tn, logs] = await Promise.all([
      selectAll<any>((f, t) => supabaseAdmin.from('soct_khach_cum').select('ma_khach_hang, ten_khach_hang, dia_chi, ma_so_thue, email_ke_toan').order('ten_khach_hang').range(f, t)),
      selectAll<any>((f, t) => supabaseAdmin.from('soct_cskh_khach').select('*').eq('an', false).range(f, t)),
      selectAll<any>((f, t) => supabaseAdmin.from('soct_cskh_log').select('ma_khach_cum, tiem_nang_id, ngay, ngay_hen').range(f, t)),
    ])

    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
    // Gom log theo khóa: cum:<ma> hoặc tn:<id>
    const agg = new Map<string, { lan_cham: string | null; hen: string | null; so_lan: number }>()
    for (const l of logs || []) {
      const key = l.tiem_nang_id != null ? `tn:${l.tiem_nang_id}` : (l.ma_khach_cum ? `cum:${l.ma_khach_cum}` : '')
      if (!key) continue
      const a = agg.get(key) || { lan_cham: null, hen: null, so_lan: 0 }
      a.so_lan++
      if (l.ngay && (!a.lan_cham || l.ngay > a.lan_cham)) a.lan_cham = l.ngay
      // hẹn kế tiếp = ngày hẹn gần nhất CÒN HIỆU LỰC (>= hôm nay)
      if (l.ngay_hen && l.ngay_hen >= today && (!a.hen || l.ngay_hen < a.hen)) a.hen = l.ngay_hen
      agg.set(key, a)
    }

    const rows: any[] = []
    for (const c of cum || []) {
      const a = agg.get(`cum:${c.ma_khach_hang}`)
      rows.push({
        key: `cum:${c.ma_khach_hang}`, loai: 'cum', ma_khach_cum: c.ma_khach_hang,
        ten_khach_hang: c.ten_khach_hang, dia_chi: c.dia_chi || '', email: c.email_ke_toan || '', dien_thoai: '',
        nguon: '', trang_thai: '', ghi_chu: '',
        lan_cham: a?.lan_cham || null, hen: a?.hen || null, so_lan: a?.so_lan || 0,
      })
    }
    for (const k of tn || []) {
      const a = agg.get(`tn:${k.id}`)
      rows.push({
        key: `tn:${k.id}`, loai: 'tiem_nang', id: k.id,
        ten_khach_hang: k.ten_khach_hang, dia_chi: k.dia_chi || '', email: k.email || '', dien_thoai: k.dien_thoai || '',
        nguoi_lien_he: k.nguoi_lien_he || '', nguon: k.nguon || '', trang_thai: k.trang_thai || 'moi', ghi_chu: k.ghi_chu || '',
        lan_cham: a?.lan_cham || null, hen: a?.hen || null, so_lan: a?.so_lan || 0,
      })
    }
    return NextResponse.json({ data: rows })
  } catch (error: any) {
    console.error('Error GET cskh:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: thêm khách TIỀM NĂNG mới.
export async function POST(request: Request) {
  try {
    const session = await gate()
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const b = await request.json()
    const ten = String(b.ten_khach_hang || '').trim()
    if (!ten) return NextResponse.json({ error: 'Nhập tên khách' }, { status: 400 })
    const { data, error } = await supabaseAdmin.from('soct_cskh_khach').insert({
      ten_khach_hang: ten,
      nguoi_lien_he: b.nguoi_lien_he || null, dien_thoai: b.dien_thoai || null, email: b.email || null,
      dia_chi: b.dia_chi || null, nguon: b.nguon || null,
      trang_thai: ['moi', 'dang_tiep_can', 'thanh_khach', 'khong_thanh'].includes(b.trang_thai) ? b.trang_thai : 'moi',
      ghi_chu: b.ghi_chu || null, created_by: session.id,
    }).select('id').single()
    if (error) throw error
    await logAudit(session, 'Thêm khách tiềm năng (CSKH)', ten)
    return NextResponse.json({ success: true, id: data?.id })
  } catch (error: any) {
    console.error('Error POST cskh:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT: sửa khách tiềm năng (gồm đổi trạng thái pipeline).
export async function PUT(request: Request) {
  try {
    const session = await gate()
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const b = await request.json()
    if (!b.id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })
    const up: any = {}
    for (const k of ['ten_khach_hang', 'nguoi_lien_he', 'dien_thoai', 'email', 'dia_chi', 'nguon', 'ghi_chu']) {
      if (b[k] !== undefined) up[k] = b[k] || null
    }
    if (b.trang_thai !== undefined && ['moi', 'dang_tiep_can', 'thanh_khach', 'khong_thanh'].includes(b.trang_thai)) up.trang_thai = b.trang_thai
    const { error } = await supabaseAdmin.from('soct_cskh_khach').update(up).eq('id', b.id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error PUT cskh:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE ?id= : ẩn khách tiềm năng (soft).
export async function DELETE(request: Request) {
  try {
    const session = await gate()
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })
    const { error } = await supabaseAdmin.from('soct_cskh_khach').update({ an: true }).eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error DELETE cskh:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
