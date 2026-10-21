import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { broadcastCskhChanged } from '@/lib/realtime'
import { autoPhanLoai, nguongPhanLoai, layMapDiemMay } from '@/lib/cskh'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const gate = () => requireTab('cong_viec', 'cong_viec.cham_soc_kh')
const todayVN = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
const GIAI_DOAN = ['chua_lien_he', 'da_lien_he', 'quan_tam', 'da_quay_lai', 'tu_choi']
const PHAN_LOAI = ['dang_dung', 'nguy_co', 'da_mat']

// GET: danh sách máy CSKH + lần chăm gần nhất / hẹn kế tiếp (từ nhật ký). Phân loại tự suy (trừ khi sửa tay).
export async function GET() {
  try {
    const session = await gate()
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const [mays, logs, { nguyco, mat }, byMa] = await Promise.all([
      selectAll<any>((f, t) => supabaseAdmin.from('soct_cskh_may').select('*').eq('an', false).range(f, t)),
      selectAll<any>((f, t) => supabaseAdmin.from('soct_cskh_log').select('ma_may, ngay, ngay_hen').range(f, t)),
      nguongPhanLoai(),
      layMapDiemMay(),  // khớp điểm máy ĐỘNG lúc đọc: thêm máy vào điểm máy xong, Tải lại là khớp lại
    ])

    const today = todayVN()
    const agg = new Map<string, { lan_cham: string | null; hen: string | null }>()
    for (const l of logs || []) {
      const k = String(l.ma_may)
      const a = agg.get(k) || { lan_cham: null, hen: null }
      if (l.ngay && (!a.lan_cham || l.ngay > a.lan_cham)) a.lan_cham = l.ngay
      if (l.ngay_hen && l.ngay_hen >= today && (!a.hen || l.ngay_hen < a.hen)) a.hen = l.ngay_hen
      agg.set(k, a)
    }

    const rows = (mays || []).map((m: any) => {
      const a = agg.get(String(m.ma_may))
      const phan_loai = m.phan_loai_tay && m.phan_loai ? m.phan_loai : autoPhanLoai(m.lan_cuoi, nguyco, mat)
      const app = byMa.get(String(m.ma_may).trim())  // ưu tiên dữ liệu điểm máy app (nếu đã khớp)
      return {
        id: m.id, ma_may: m.ma_may,
        ten_khach_hang: app?.ten_khach_hang || m.ten_khach_hang || '',
        ma_khach_cum: app?.ma_khach_cum || m.ma_khach_cum || '',
        ten_cum: app?.ten_cum || m.ten_cum || '',
        model: app?.model || m.model || '',
        dia_chi: app?.dia_chi || m.dia_chi || '',
        nguoi_lien_he: m.nguoi_lien_he || '', dien_thoai: m.dien_thoai || '',
        lan_cuoi: m.lan_cuoi || '', so_lan_lay: m.so_lan_lay || 0, vat_tu_gan_nhat: m.vat_tu_gan_nhat || '',
        phan_loai, phan_loai_tay: !!m.phan_loai_tay, giai_doan: m.giai_doan || 'chua_lien_he',
        khop_diem_may: !!app, ghi_chu: m.ghi_chu || '',
        lan_cham: a?.lan_cham || null, hen: a?.hen || null,
      }
    })
    return NextResponse.json({ data: rows, nguong: { nguyco, mat } })
  } catch (error: any) {
    console.error('Error GET cskh:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: thêm MÁY thủ công (tra điểm máy nếu khớp).
export async function POST(request: Request) {
  try {
    const session = await gate()
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const b = await request.json()
    const ma_may = String(b.ma_may || '').trim()
    if (!ma_may) return NextResponse.json({ error: 'Nhập mã máy' }, { status: 400 })

    const byMa = await layMapDiemMay()
    const app = byMa.get(ma_may)
    const row: any = {
      ma_may,
      ten_khach_hang: app?.ten_khach_hang || String(b.ten_khach_hang || '').trim() || null,
      ma_khach_cum: app?.ma_khach_cum || null, ten_cum: app?.ten_cum || null,
      model: app?.model || String(b.model || '').trim() || null,
      dia_chi: app?.dia_chi || String(b.dia_chi || '').trim() || null,
      nguoi_lien_he: String(b.nguoi_lien_he || '').trim() || null,
      dien_thoai: String(b.dien_thoai || '').trim() || null,
      vat_tu_gan_nhat: String(b.vat_tu_gan_nhat || '').trim() || null,
      lan_cuoi: String(b.lan_cuoi || '').slice(0, 7) || null,
      khop_diem_may: !!app, created_by: session.id,
    }
    const { data, error } = await supabaseAdmin.from('soct_cskh_may').insert(row).select('id').single()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Mã máy đã có trong danh sách CSKH' }, { status: 409 })
      throw error
    }
    await logAudit(session, 'Thêm máy CSKH', ma_may)
    await broadcastCskhChanged()
    return NextResponse.json({ success: true, id: data?.id })
  } catch (error: any) {
    console.error('Error POST cskh:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT: sửa máy — đổi giai đoạn, đè phân loại tay, sửa liên hệ/ghi chú.
export async function PUT(request: Request) {
  try {
    const session = await gate()
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const b = await request.json()
    if (!b.id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })
    const up: any = { updated_at: new Date().toISOString() }
    for (const k of ['nguoi_lien_he', 'dien_thoai', 'ghi_chu']) if (b[k] !== undefined) up[k] = b[k] || null
    if (b.giai_doan !== undefined && GIAI_DOAN.includes(b.giai_doan)) up.giai_doan = b.giai_doan
    if (b.phan_loai !== undefined) {
      if (b.phan_loai === 'auto') { up.phan_loai_tay = false; up.phan_loai = null }
      else if (PHAN_LOAI.includes(b.phan_loai)) { up.phan_loai_tay = true; up.phan_loai = b.phan_loai }
    }
    const { error } = await supabaseAdmin.from('soct_cskh_may').update(up).eq('id', b.id)
    if (error) throw error
    await broadcastCskhChanged()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error PUT cskh:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE ?id= : ẩn máy khỏi danh sách (soft).
export async function DELETE(request: Request) {
  try {
    const session = await gate()
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })
    const { error } = await supabaseAdmin.from('soct_cskh_may').update({ an: true }).eq('id', id)
    if (error) throw error
    await broadcastCskhChanged()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error DELETE cskh:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
