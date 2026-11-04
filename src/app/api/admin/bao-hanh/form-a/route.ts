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

const dmy = (s: any) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? '')); return m ? { d: m[3], m: m[2], y: m[1] } : { d: '', m: '', y: '' } }

// GET ?id= : xuất Form (A) .docx cho 1 ca. Cấp số HST-{YY}.{nnn} (reset năm) nếu chưa có, lưu lại.
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })

    const { data: r, error } = await supabaseAdmin.from('soct_bh_fbvn').select('*').eq('id', id).single()
    if (error || !r) return NextResponse.json({ error: 'Không thấy ca bảo hành' }, { status: 404 })

    // Cấp số Form A nếu chưa có: HST-{YY}.{nnn} theo năm của ngày lập (fallback năm hiện tại).
    let soForm: string | null = r.so_form_a
    let soFormShort = ''
    if (soForm) {
      soFormShort = soForm.replace(/^HST-/, '')
    } else {
      const nam = parseInt(String(r.ngay || '').slice(0, 4), 10) || new Date().getFullYear()
      const { data: seq, error: e2 } = await supabaseAdmin.rpc('next_bh_forma_seq', { p_nam: nam })
      if (e2) throw e2
      soFormShort = `${String(nam).slice(-2)}.${String(seq).padStart(3, '0')}`
      soForm = `HST-${soFormShort}`
      await supabaseAdmin.from('soct_bh_fbvn').update({ so_form_a: soForm }).eq('id', id)
    }

    const fob = dmy(r.fob_date), def = dmy(r.defect_date), ng = dmy(r.ngay)
    const data = {
      SO_FORMA: soForm,   // số đầy đủ, vd HST-26.001 (mẫu mới tô vàng cả cụm)
      NGAY: ng.d ? `${ng.d}/${ng.m}/${ng.y}` : '',
      MODEL: r.model || '', SERIAL: r.serial || '', CE: r.ktv || '',
      FOB_D: fob.d, FOB_M: fob.m, FOB_Y: fob.y,
      DEF_D: def.d, DEF_M: def.m, DEF_Y: def.y,
      TEN_CLAIM: r.ten_claim || '', MA: r.product_code || '', DVT: r.don_vi || '',
      CONTENTS: r.contents || '', CAUSE: r.possible_cause || '',
    }

    const buf = render('fbvn-form-a.docx', data)
    await logAudit(session, 'Xuất Form (A) FBVN', `${soForm} · serial ${r.serial || '-'}`)
    const fname = `FormA-${soFormShort.replace('.', '-')}.docx`
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fname}"`,
      },
    })
  } catch (error: any) {
    console.error('Error GET bh/form-a:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
