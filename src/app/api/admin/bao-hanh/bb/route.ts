import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'
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

// GET ?id= : xuất BB Bàn giao .docx. Cấp số HST-{năm}.{nnn} (reset năm) nếu chưa có, lưu lại.
// Ngày lập = hôm nay (giờ VN). Người liên hệ/điện thoại CỐ Ý để trống (viết tay).
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })

    const { data: r, error } = await supabaseAdmin.from('soct_bh_fbvn').select('*').eq('id', id).single()
    if (error || !r) return NextResponse.json({ error: 'Không thấy ca bảo hành' }, { status: 404 })

    const now = new Date(Date.now() + 7 * 3600 * 1000)
    const nam = now.getUTCFullYear()

    let soBb: string | null = r.so_bb
    if (!soBb) {
      const { data: seq, error: e2 } = await supabaseAdmin.rpc('next_bh_bb_seq', { p_nam: nam })
      if (e2) throw e2
      soBb = `HST-${nam}.${String(seq).padStart(3, '0')}`
      await supabaseAdmin.from('soct_bh_fbvn').update({ so_bb: soBb }).eq('id', id)
    }

    const data = {
      SO_BB: soBb,
      KHACH: r.customer || '', DIACHI: r.dia_chi || '',
      MODEL: r.model || '', SERIAL: r.serial || '', COUNTER: r.counter || '',
      HANGHOA: r.ten_claim || '', TINHTRANG: r.contents || '', NGUYENNHAN: r.possible_cause || '',
      HUONG: r.huong_giai_quyet || 'Trả hàng bảo hành',
      NGAY_D: String(now.getUTCDate()), NGAY_M: String(now.getUTCMonth() + 1), NGAY_Y: String(nam),
    }

    const buf = render('fbvn-bb.docx', data)
    await logAudit(session, 'Xuất BB Bàn giao FBVN', `${soBb} · ${r.customer || '-'}`)
    const fname = `BB-${String(soBb).replace(/^HST-/, '').replace('.', '-')}.docx`
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fname}"`,
      },
    })
  } catch (error: any) {
    console.error('Error GET bh/bb:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
