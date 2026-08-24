import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { broadcastJobsChanged } from '@/lib/realtime'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

const fmtDMY = (s: any) => { if (!s) return ''; const d = new Date(s); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` }
const todayVN = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)

// Danh sách phiếu 'Chưa hoàn thành' ĐẾN HẸN (ngay_hen <= hôm nay) và CHƯA có phiếu con.
async function candidates() {
  const rows = await selectAll<any>((from, to) => supabaseAdmin
    .from('soct_cong_viec')
    .select('id, ngay, ngay_hen, ma_may, report, loai_cong_viec, ghi_chu, ket_qua, soct_khach_hang(ten_khach_hang, dia_chi, model, vi_tri_dat_may)')
    .eq('ket_qua', 'Chưa hoàn thành')
    .not('ngay_hen', 'is', null)
    .lte('ngay_hen', todayVN())
    .order('ngay_hen', { ascending: true })
    .range(from, to))
  const ids = (rows || []).map(r => r.id)
  if (ids.length === 0) return []
  // Loại phiếu ĐÃ có phiếu con (đã tạo phiếu tiếp) -> không nhắc nữa.
  const { data: children } = await supabaseAdmin.from('soct_cong_viec').select('phieu_goc_id').in('phieu_goc_id', ids)
  const hasChild = new Set((children || []).map((c: any) => c.phieu_goc_id))
  return (rows || []).filter(r => !hasChild.has(r.id))
}

// GET: danh sách cần làm tiếp (?count=1 -> chỉ số lượng, cho badge/banner).
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    const list = await candidates()
    if (new URL(request.url).searchParams.get('count') === '1') return NextResponse.json({ count: list.length })
    return NextResponse.json({ data: list })
  } catch (error: any) {
    console.error('Error lam-tiep GET:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST { id, ktv_id? }: TẠO PHIẾU TIẾP từ phiếu gốc (sao chép khách/máy/loại + toàn bộ vật tư).
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const { id, ktv_id } = await request.json()
    if (!id) return NextResponse.json({ error: 'Thiếu phiếu gốc' }, { status: 400 })

    const { data: goc, error } = await supabaseAdmin
      .from('soct_cong_viec')
      .select('id, ngay, ma_may, id_khach_hang, loai_cong_viec, km, so_luong, ghi_chu, ket_qua, report, ngay_hen')
      .eq('id', id).single()
    if (error) throw error
    if (goc.ket_qua !== 'Chưa hoàn thành') return NextResponse.json({ error: 'Phiếu gốc không ở trạng thái "Chưa hoàn thành".' }, { status: 400 })

    const { data: existedChild } = await supabaseAdmin.from('soct_cong_viec').select('id').eq('phieu_goc_id', id).maybeSingle()
    if (existedChild) return NextResponse.json({ error: 'Phiếu này đã có phiếu tiếp rồi.' }, { status: 409 })

    // Ghi chú: nêu rõ làm tiếp phiếu nào + giữ ghi chú gốc.
    const nhanhGoc = goc.report ? `số ${goc.report}` : `ngày ${fmtDMY(goc.ngay)}`
    const ghiChu = [`Làm tiếp phiếu ${nhanhGoc}`, goc.ghi_chu].filter(Boolean).join(' — ')

    const { data: phieu, error: pErr } = await supabaseAdmin
      .from('soct_cong_viec')
      .insert({
        ngay: goc.ngay_hen || todayVN(),
        ma_may: goc.ma_may,
        id_khach_hang: goc.id_khach_hang,
        loai_cong_viec: goc.loai_cong_viec,
        km: goc.km || 0,
        so_luong: goc.so_luong || 1,
        ghi_chu: ghiChu,
        phieu_goc_id: id,
        ktv_id: ktv_id || null,
        ket_qua: ktv_id ? 'Đã nhận' : 'Chờ nhận',
        nguon_nhan: ktv_id ? 'giao' : null,
        nhan_luc: ktv_id ? new Date().toISOString() : null,
        created_by: session.id,
        telegram_sent: true, // không tự bắn tin (office tạo chủ động); phiếu hiện trong app
      })
      .select('id')
      .single()
    if (pErr) throw pErr

    // Sao chép TOÀN BỘ vật tư của phiếu gốc sang phiếu tiếp (dồn hết -> phiếu cuối trừ kho 1 lần).
    const { data: vt } = await supabaseAdmin
      .from('soct_chi_tiet_vat_tu')
      .select('ma_hang, so_luong, don_gia, vat, thanh_tien, hoa_don, ten_hang_hd, don_vi_tinh, thu_tu')
      .eq('id_cong_viec', id)
    if (vt && vt.length > 0) {
      const rows = vt.map((v: any) => ({ ...v, id_cong_viec: phieu.id, hoa_don: false }))
      const { error: vtErr } = await supabaseAdmin.from('soct_chi_tiet_vat_tu').insert(rows)
      if (vtErr) throw vtErr
    }

    await logAudit(session, 'Tạo phiếu làm tiếp', `gốc ${id} -> phiếu ${phieu.id}`)
    await broadcastJobsChanged()
    return NextResponse.json({ success: true, id: phieu.id })
  } catch (error: any) {
    console.error('Error lam-tiep POST:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT { id }: "Không làm tiếp" -> bỏ ngày hẹn (drop khỏi banner), giữ trạng thái 'Chưa hoàn thành'.
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: 'Thiếu phiếu' }, { status: 400 })
    const { error } = await supabaseAdmin.from('soct_cong_viec').update({ ngay_hen: null }).eq('id', id)
    if (error) throw error
    await logAudit(session, 'Bỏ nhắc làm tiếp', `phiếu ${id}`)
    await broadcastJobsChanged()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error lam-tiep PUT:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
