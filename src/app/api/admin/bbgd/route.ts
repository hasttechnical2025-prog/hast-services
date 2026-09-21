import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'

// GET ?id=<phiếu> : xuất Biên bản giám định (BM26-KT.01) .docx cho 1 phiếu giao việc.
// Form TRẮNG in trước, chỉ điền sẵn 5 trường từ khách điểm máy; phần còn lại KTV/khách ghi tay.
// Placeholder: {{TEN_KH}}{{DIA_CHI}}{{LOAI_MAY}}{{MA_MAY}}{{MODEL}}
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu phiếu' }, { status: 400 })

    const { data: job, error } = await supabaseAdmin
      .from('soct_cong_viec')
      .select(`id, report, ma_may,
        soct_khach_hang ( ten_khach_hang, dia_chi, vi_tri_dat_may, hang, model, ma_may )`)
      .eq('id', id).single()
    if (error || !job) return NextResponse.json({ error: 'Không tìm thấy phiếu' }, { status: 404 })

    const kh: any = job.soct_khach_hang
    const data = {
      TEN_KH: (kh?.ten_khach_hang || '').toUpperCase(),          // khách điểm máy (không dùng cụm)
      DIA_CHI: kh?.vi_tri_dat_may || kh?.dia_chi || '',           // nơi đặt máy (KTV đến), thiếu -> địa chỉ HĐ
      LOAI_MAY: kh?.hang || '',                                   // hãng máy
      MA_MAY: kh?.ma_may || job.ma_may || '',
      MODEL: kh?.model || '',
    }

    const tplPath = path.join(process.cwd(), 'src', 'lib', 'report', 'bbgd-bm26.docx')
    const zip = new PizZip(fs.readFileSync(tplPath))
    const doc = new Docxtemplater(zip, { delimiters: { start: '{{', end: '}}' }, paragraphLoop: true, linebreaks: true, nullGetter: () => '' })
    doc.render(data)
    const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })

    await logAudit(session, 'Xuất BBGĐ', `phiếu ${job.report || id}`)

    const fname = `BBGD-${job.report || job.ma_may || 'phieu'}.docx`
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fname)}"`,
      },
    })
  } catch (error: any) {
    console.error('Error export BBGĐ:', error)
    return NextResponse.json({ error: 'Lỗi xuất BBGĐ: ' + (error?.message || '') }, { status: 500 })
  }
}
