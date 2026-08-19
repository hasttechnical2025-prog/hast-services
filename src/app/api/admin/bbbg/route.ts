import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { BBBG_TEMPLATES } from '@/lib/bbbg-templates'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'

function render(templateFile: string, data: Record<string, any>) {
  const tplPath = path.join(process.cwd(), 'src', 'lib', 'report', templateFile)
  const zip = new PizZip(fs.readFileSync(tplPath))
  const doc = new Docxtemplater(zip, { delimiters: { start: '{{', end: '}}' }, paragraphLoop: true, linebreaks: true, nullGetter: () => '' })
  doc.render(data)
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

// GET ?id=<phiếu>&mau=<key> : xuất Biên bản bàn giao .docx theo mẫu đã chọn (mẫu riêng theo khách).
// Placeholder trong mẫu: {{#ds}}{{stt}}{{ten}}{{dvt}}{{sl}}{{tinh_trang}}{{ghi_chu}}{{/ds}} + {{VI_TRI}}.
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const mau = searchParams.get('mau') || ''
    if (!id) return NextResponse.json({ error: 'Thiếu phiếu' }, { status: 400 })
    const tpl = BBBG_TEMPLATES[mau]
    if (!tpl) return NextResponse.json({ error: 'Mẫu không hợp lệ' }, { status: 400 })

    const { data: job, error } = await supabaseAdmin
      .from('soct_cong_viec')
      .select(`id, report, ma_may,
        soct_khach_hang ( ten_khach_hang, dia_chi, vi_tri_dat_may ),
        soct_chi_tiet_vat_tu ( ma_hang, so_luong, da_tra, soct_kho_hang ( ten_hang ) )`)
      .eq('id', id).single()
    if (error || !job) return NextResponse.json({ error: 'Không tìm thấy phiếu' }, { status: 404 })

    const kh: any = job.soct_khach_hang
    const lines = ((job.soct_chi_tiet_vat_tu || []) as any[]).filter(v => !v.da_tra)
    if (lines.length === 0) return NextResponse.json({ error: 'Phiếu không có vật tư để bàn giao' }, { status: 400 })

    const ds: any[] = lines.map((v, i) => ({
      stt: String(i + 1),
      ten: v.soct_kho_hang?.ten_hang || v.ma_hang,
      dvt: 'Cái',                 // kho chưa có ĐVT -> mặc định "Cái" (tech_admin sửa tay sau nếu cần)
      sl: String(v.so_luong ?? ''),
      tinh_trang: 'Hàng mới 100%',
      ghi_chu: '',
    }))
    // Mẫu cần giữ đủ số dòng (VD NHNN = 10): đệm dòng TRỐNG (chỉ có STT) cho đủ như mẫu gốc.
    if (tpl.padRows && ds.length < tpl.padRows) {
      for (let i = ds.length; i < tpl.padRows; i++) ds.push({ stt: String(i + 1), ten: '', dvt: '', sl: '', tinh_trang: '', ghi_chu: '' })
    }
    const buf = render(tpl.file, { ds, VI_TRI: kh?.vi_tri_dat_may || kh?.dia_chi || '' })

    // Badge "đã xuất BBBG"
    await supabaseAdmin.from('soct_cong_viec').update({ bbbg_luc: new Date().toISOString() }).eq('id', id)
    await logAudit(session, 'Xuất BBBG', `phiếu ${job.report || id} · mẫu ${tpl.label}`)

    const fname = `BBBG-${job.report || job.ma_may || 'phieu'}.docx`
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fname)}"`,
      },
    })
  } catch (error: any) {
    console.error('Error export BBBG:', error)
    return NextResponse.json({ error: 'Lỗi xuất BBBG: ' + (error?.message || '') }, { status: 500 })
  }
}
