import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'

// POST { id, ngay, nguoi_nhan, khach_hang, dia_chi, noi_dung } : xuất "Tem gửi hàng" (chuyển phát nhanh)
// .docx cho 1 phiếu. Mọi trường do client gửi lên (đã prefill + cho sửa). Chỉ dùng id để lấy số
// phiếu đặt tên file + ghi nhật ký. Placeholder: {{NGAY}}{{NGUOI_NHAN}}{{KHACH_HANG}}{{DIA_CHI}}{{NOI_DUNG}}
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const id = body?.id
    if (!id) return NextResponse.json({ error: 'Thiếu phiếu' }, { status: 400 })

    const { data: job, error } = await supabaseAdmin
      .from('soct_cong_viec')
      .select('id, report, ma_may')
      .eq('id', id).single()
    if (error || !job) return NextResponse.json({ error: 'Không tìm thấy phiếu' }, { status: 404 })

    const data = {
      NGAY: String(body.ngay ?? '').trim(),
      NGUOI_NHAN: String(body.nguoi_nhan ?? '').trim(),
      KHACH_HANG: String(body.khach_hang ?? '').trim(),
      DIA_CHI: String(body.dia_chi ?? '').trim(),
      NOI_DUNG: String(body.noi_dung ?? '').trim(),
    }

    const tplPath = path.join(process.cwd(), 'src', 'lib', 'report', 'tem-gui-hang.docx')
    const zip = new PizZip(fs.readFileSync(tplPath))
    const doc = new Docxtemplater(zip, { delimiters: { start: '{{', end: '}}' }, paragraphLoop: true, linebreaks: true, nullGetter: () => '' })
    doc.render(data)
    const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })

    await supabaseAdmin.from('soct_chung_tu_log').insert({ job_id: id, loai: 'TEM', mau: 'cpn', mau_label: 'Tem gửi hàng (CPN)', nguoi_id: session.id, nguoi_ten: session.full_name })
    await logAudit(session, 'Xuất Tem gửi hàng', `phiếu ${job.report || id}`)

    const fname = `Tem-gui-hang-${job.report || job.ma_may || 'phieu'}.docx`
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fname)}"`,
      },
    })
  } catch (error: any) {
    console.error('Error export Tem gửi hàng:', error)
    return NextResponse.json({ error: 'Lỗi xuất Tem gửi hàng: ' + (error?.message || '') }, { status: 500 })
  }
}
