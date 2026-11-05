import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { onAirFromFob, isExpired, vnTodayISO } from '@/lib/bao-hanh'

export const runtime = 'nodejs'

function toISODate(v: any): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}
const str = (v: any) => { const s = String(v ?? '').trim(); return s || null }
const bool = (v: any) => v === true || v === 'true' || v === 1

// Dựng payload ghi DB từ body (chỉ field hợp lệ). Tự tính on_air từ fob_date.
function buildPayload(b: any) {
  const fob = toISODate(b.fob_date)
  const p: any = {
    ngay: toISODate(b.ngay), ktv: str(b.ktv),
    serial: str(b.serial), item_no: str(b.item_no), model: str(b.model),
    fob_date: fob, invoice_no: str(b.invoice_no), do_no: str(b.do_no),
    on_air: onAirFromFob(fob) || null,
    product_code: str(b.product_code), ten_claim: str(b.ten_claim), don_vi: str(b.don_vi),
    defect_date: toISODate(b.defect_date), contents: str(b.contents), possible_cause: str(b.possible_cause),
    tinh_trang_vi: str(b.tinh_trang_vi), nguyen_nhan_vi: str(b.nguyen_nhan_vi),
    judg_install: bool(b.judg_install), judg_tech: bool(b.judg_tech), judg_goods: bool(b.judg_goods), judg_info: bool(b.judg_info),
    att_invoice: bool(b.att_invoice), att_mhc: bool(b.att_mhc), att_faulty: bool(b.att_faulty),
    att_sample: bool(b.att_sample), att_po: bool(b.att_po), att_license: bool(b.att_license),
    co_claim: bool(b.co_claim), co_ban_giao: bool(b.co_ban_giao),
    claim_sent: bool(b.claim_sent), fbvn_claim_no: str(b.fbvn_claim_no),
    goods_received: bool(b.goods_received), goods_received_date: toISODate(b.goods_received_date),
    ma_tra_ve: str(b.ma_tra_ve),  // mã hãng trả về (nếu khác mã gửi); trống = trả đúng mã
    back_to_customer: bool(b.back_to_customer),
    customer: str(b.customer), dia_chi: str(b.dia_chi), nguoi_lien_he: str(b.nguoi_lien_he),
    dien_thoai: str(b.dien_thoai), counter: str(b.counter),
    huong_giai_quyet: str(b.huong_giai_quyet), ngay_hen_tra: toISODate(b.ngay_hen_tra), ghi_chu: str(b.ghi_chu),
  }
  return p
}

// Chặn lập claim khi NGÀY LẬP CLAIM (p.ngay, mặc định hôm nay) đã quá On-air — chỉ khi có mặt Claim.
// So theo ngày lập (không phải hôm nay) để nhập được danh sách cũ còn hạn tại thời điểm lập.
function expiredError(p: any): string | null {
  if (p.co_claim && p.on_air) {
    const claimRef = p.ngay || vnTodayISO()
    if (isExpired(p.on_air, claimRef)) {
      return `Ngày lập claim (${claimRef}) đã quá hạn bảo hành (On-air ${p.on_air}) — không lập claim được.`
    }
  }
  return null
}

export async function GET() {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    const rows = await selectAll<any>((from, to) =>
      supabaseAdmin.from('soct_bh_fbvn').select('*').order('id', { ascending: false }).range(from, to))
    return NextResponse.json({ data: rows || [] })
  } catch (error: any) {
    console.error('Error GET bh/fbvn:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const b = await request.json()
    const p = buildPayload(b)
    if (!p.serial && !p.customer) return NextResponse.json({ error: 'Bản ghi rỗng — cần ít nhất Serial hoặc Khách hàng.' }, { status: 400 })
    const err = expiredError(p)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
    p.created_by = session.full_name || null
    const { data, error } = await supabaseAdmin.from('soct_bh_fbvn').insert(p).select('id').single()
    if (error) throw error
    await logAudit(session, 'Thêm ca bảo hành FBVN', `serial ${p.serial || '-'}`)
    return NextResponse.json({ success: true, id: data?.id })
  } catch (error: any) {
    console.error('Error POST bh/fbvn:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const b = await request.json()
    const id = b.id
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })
    const p = buildPayload(b)
    const err = expiredError(p)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
    p.updated_at = new Date().toISOString()
    const { error } = await supabaseAdmin.from('soct_bh_fbvn').update(p).eq('id', id)
    if (error) throw error
    await logAudit(session, 'Sửa ca bảo hành FBVN', `id ${id}`)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error PUT bh/fbvn:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })
    const { error } = await supabaseAdmin.from('soct_bh_fbvn').delete().eq('id', id)
    if (error) throw error
    await logAudit(session, 'Xóa ca bảo hành FBVN', id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error DELETE bh/fbvn:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
