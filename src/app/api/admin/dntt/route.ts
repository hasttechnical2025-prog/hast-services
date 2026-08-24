import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { docSoTien } from '@/lib/report/bao-gia'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'

const money = (v: any) => Math.round(Number(v) || 0).toLocaleString('vi-VN')
const fmtDMY = (s: any) => { if (!s) return ''; const d = new Date(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` }

function render(templateFile: string, data: Record<string, any>) {
  const tplPath = path.join(process.cwd(), 'src', 'lib', 'report', templateFile)
  const zip = new PizZip(fs.readFileSync(tplPath))
  const doc = new Docxtemplater(zip, { delimiters: { start: '{{', end: '}}' }, paragraphLoop: true, linebreaks: true, nullGetter: () => '' })
  doc.render(data)
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

// GET ?so_hd=<số hóa đơn> : xuất Đề nghị thanh toán .docx cho 1 hóa đơn (1 HĐ = 1 tờ).
// Số ĐNTT tự tăng theo năm "{YY}-{seq}"; lần đầu cấp số + lưu, xuất lại giữ nguyên số.
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff', 'kthc')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const so_hd = (new URL(request.url).searchParams.get('so_hd') || '').trim()
    if (!so_hd) return NextResponse.json({ error: 'Thiếu số hóa đơn' }, { status: 400 })

    const { data: tickets, error } = await supabaseAdmin
      .from('soct_cong_viec')
      .select(`id, so_dntt, ngay, ngay_xuat_hd, id_khach_hang, lam_tron,
        soct_khach_hang ( ten_khach_hang, soct_khach_cum ( ten_khach_hang ) ),
        soct_chi_tiet_vat_tu ( thanh_tien, vat, da_tra )`)
      .eq('so_hoa_don', so_hd)
    if (error) throw error
    if (!tickets || tickets.length === 0) return NextResponse.json({ error: 'Không tìm thấy phiếu của hóa đơn này' }, { status: 404 })

    // Tổng tiền sau VAT của cả hóa đơn (mọi phiếu cùng số HĐ), khớp cách tính ở Kanban.
    let tong = 0
    for (const t of tickets as any[]) {
      for (const v of (t.soct_chi_tiet_vat_tu || [])) {
        if (v.da_tra) continue
        const tt = Number(v.thanh_tien) || 0
        tong += tt + tt * (Number(v.vat) || 0) / 100
      }
    }
    // Cộng KHOẢN LÀM TRÒN (lam_tron) như Kanban -> tổng ĐNTT khớp số đã chỉnh (VD 6.190.000, không lẻ 1đ).
    tong = Math.round(tong) + (tickets as any[]).reduce((s, t) => s + (Number(t.lam_tron) || 0), 0)

    // Số ĐNTT: dùng lại nếu đã cấp; chưa thì cấp mới theo năm (atomic qua RPC) rồi lưu cho mọi phiếu.
    const now = new Date(Date.now() + 7 * 3600 * 1000)
    const nam = now.getUTCFullYear()
    let so_dntt = (tickets as any[]).map(t => t.so_dntt).find(Boolean)
    if (!so_dntt) {
      const { data: seq, error: e2 } = await supabaseAdmin.rpc('next_dntt_seq', { p_nam: nam })
      if (e2) throw e2
      so_dntt = `${String(nam).slice(-2)}-${seq}`
      await supabaseAdmin.from('soct_cong_viec').update({ so_dntt }).eq('so_hoa_don', so_hd)
    }

    const kh0: any = (tickets as any[])[0].soct_khach_hang
    const tenKh = (kh0?.soct_khach_cum?.ten_khach_hang || kh0?.ten_khach_hang || '').toUpperCase()
    const ngayHd = fmtDMY((tickets as any[])[0].ngay_xuat_hd || (tickets as any[])[0].ngay)

    const buf = render('dntt.docx', {
      SO_DNTT: so_dntt,
      NGAY: String(now.getUTCDate()).padStart(2, '0'),
      THANG: String(now.getUTCMonth() + 1).padStart(2, '0'),
      NAM: String(nam),
      TEN_KH: tenKh,
      NGAY_HD: ngayHd, SO_HD: so_hd,
      TIEN: money(tong), CONG: money(tong), TONG: money(tong),
      GHI_CHU: '',                 // để trống — tech_admin/staff điền tay
      BANG_CHU: docSoTien(tong),
    })

    await supabaseAdmin.from('soct_cong_viec').update({ dntt_luc: new Date().toISOString() }).eq('so_hoa_don', so_hd)
    await logAudit(session, 'Xuất ĐNTT', `HĐ ${so_hd} · số ${so_dntt}`)

    const fname = `DNTT-${so_dntt}-HD${so_hd}.docx`
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fname)}"`,
      },
    })
  } catch (error: any) {
    console.error('Error export DNTT:', error)
    return NextResponse.json({ error: 'Lỗi xuất ĐNTT: ' + (error?.message || '') }, { status: 500 })
  }
}
