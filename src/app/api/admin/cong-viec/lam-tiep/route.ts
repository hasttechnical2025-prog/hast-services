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

// POST { id }: LÀM TIẾP — KHÔNG đẻ phiếu mới. Đóng băng buổi dở thành 1 LƯỢT (snapshot, giữ công
// theo lượt) rồi RESET chính phiếu đó về 'Chờ nhận' + ngày hôm nay để KTV đi tiếp. Giữ nguyên
// report + vật tư trên phiếu (kho chỉ trừ 1 lần khi phiếu cuối cùng 'Hoàn thành').
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: 'Thiếu phiếu' }, { status: 400 })

    const { data: goc, error } = await supabaseAdmin
      .from('soct_cong_viec')
      .select('id, ngay, ma_may, loai_cong_viec, report, ghi_chu_ktv, counter, bat_dau_luc, hoan_thanh_luc, so_phut_xu_ly, ket_qua, ktv_id, ktv2_id, soct_khach_hang ( ten_khach_hang, dia_chi )')
      .eq('id', id).single()
    if (error) throw error
    if (goc.ket_qua !== 'Chưa hoàn thành') return NextResponse.json({ error: 'Chỉ làm tiếp phiếu đang "Chưa hoàn thành".' }, { status: 400 })

    const kh: any = goc.soct_khach_hang

    // 1) Đóng băng buổi vừa làm dở thành 1 lượt (snapshot để báo cáo ngày cũ không vỡ).
    const { error: lErr } = await supabaseAdmin.from('soct_cong_viec_luot').insert({
      id_cong_viec: id,
      ktv_id: goc.ktv_id || null,
      ktv2_id: goc.ktv2_id || null,
      ngay: goc.ngay,
      bat_dau_luc: goc.bat_dau_luc || null,
      hoan_thanh_luc: goc.hoan_thanh_luc || null,
      so_phut: goc.so_phut_xu_ly ?? null,
      ket_qua_luot: 'Chưa hoàn thành',
      ghi_chu_ktv: goc.ghi_chu_ktv || null,
      counter: goc.counter ?? null,
      ma_may: goc.ma_may || null,
      loai_cong_viec: goc.loai_cong_viec || null,
      ten_khach_hang: kh?.ten_khach_hang || null,
      dia_chi: kh?.dia_chi || null,
      report: goc.report || null,
    })
    if (lErr) throw lErr

    // 2) Reset chính phiếu về 'Chờ nhận' + ngày hôm nay. Xóa dấu buổi + hẹn + gán KTV (về pool).
    //    GIỮ report + vật tư. KTV (hoặc đồng nghiệp) nhận lại và đi tiếp.
    const { error: uErr } = await supabaseAdmin.from('soct_cong_viec').update({
      ket_qua: 'Chờ nhận',
      ngay: todayVN(),
      ngay_hen: null,
      ktv_id: null, ktv2_id: null,
      nguon_nhan: null, nhan_luc: null, nhac_luc: null,
      bat_dau_luc: null, hoan_thanh_luc: null, so_phut_xu_ly: null,
      ghi_chu_ktv: null, counter: null,
      telegram_sent: true, // office chủ động đẩy lại; không tự bắn tin
    }).eq('id', id)
    if (uErr) throw uErr

    await logAudit(session, 'Làm tiếp phiếu', `phiếu ${goc.report || id}${goc.ma_may ? ` — máy ${goc.ma_may}` : ''} (đóng băng buổi ${fmtDMY(goc.ngay)}, đưa về Chờ nhận)`)
    await broadcastJobsChanged()
    return NextResponse.json({ success: true, id })
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
