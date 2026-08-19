import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'

// Map id sạch (key trong inspections.data) -> tên placeholder THẬT trong mẫu Techbot
// (giữ nguyên dấu cách & typo của template gốc để khớp tag). Copy y hệt từ Techbot src/lib/inspection.ts.
const FIELD_TO_TAG: Record<string, string> = {
  khach_hang: 'KHACH_HANG', dia_chi: 'DIA_CHI', to_kt: 'TO_KTh', nv_kd: 'NV_KD', ly_do: 'LY_DO',
  model: 'MODEL', code: 'CODE', serial: 'SERIAL', counter: 'COUNTER', ins_date: 'INS_DATE',
  options: 'OPTIONS', machine_condition: 'MACHINE_CONDITION',
  toner_k: 'TONER_K _REMAIN', toner_c: 'TONER_C _REMAIN', toner_m: 'TONER_M _REMAIN', toner_y: 'TONER_Y _REMAIN',
  drum_k: 'DRUM_K _REMAIN', drum_c: 'DRUM_C _REMAIN', drum_m: 'DRUM_M _REMAIN', drum_y: 'DRUM_Y _REMAIN',
  dev_k: 'DEV_K _REMAIN', dev_c: 'DEV_C _REMAIN', dev_m: 'DEV_M _REMAIN', dev_y: 'DEV_Y _REMAIN',
  fuse: 'FUSE_REMAIN', belt: 'BELT_REMAIN', roller: 'ROLLER_REMAIN',
  feed0: 'FEED0_REMIAN', feed1: 'FEED1_REMIAN', feed2: 'FEED2_REMIAN', feed_df: 'FEEDDF_REMIAN', feed_du: 'FEEDDU_REMIAN',
  finisher: 'FINISHER', others: 'OTHERS', ktv: 'KTV',
}
const pad = (n: number) => String(n).padStart(2, '0')

// GET ?id=<inspection> : xuất lại BIÊN BẢN GIÁM ĐỊNH .docx theo đúng mẫu Techbot (phieu-giam-dinh.docx).
// Dữ liệu từ inspections.data (đọc/sửa chung với Techbot) -> phản ánh cả các chỉnh sửa ở HAST.
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff') // KHÔNG cho kinh_doanh
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu ID biên bản' }, { status: 400 })

    const { data: insp, error } = await supabaseAdmin.from('inspections').select('data, created_at, serial').eq('id', id).single()
    if (error || !insp) return NextResponse.json({ error: 'Không tìm thấy biên bản' }, { status: 404 })
    const d: Record<string, any> = insp.data || {}

    const out: Record<string, string> = {}
    for (const [key, tag] of Object.entries(FIELD_TO_TAG)) {
      const v = (d[key] ?? '').toString().trim()
      out[tag] = v || '—'
    }
    const dt = d.date ? new Date(d.date) : (insp.created_at ? new Date(insp.created_at) : new Date(Date.now() + 7 * 3600 * 1000))
    out['DD'] = pad(dt.getUTCDate()); out['MM'] = pad(dt.getUTCMonth() + 1); out['YYYY'] = String(dt.getUTCFullYear())

    const tplPath = path.join(process.cwd(), 'src', 'lib', 'report', 'phieu-giam-dinh.docx')
    const zip = new PizZip(fs.readFileSync(tplPath))
    const doc = new Docxtemplater(zip, { delimiters: { start: '{{', end: '}}' }, paragraphLoop: true, linebreaks: true, nullGetter: () => '—' })
    doc.render(out)
    const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer

    await logAudit(session, 'Xuất biên bản giám định', `máy ${insp.serial || d.serial || id}`)
    const fname = `Bien-ban-giam-dinh-${insp.serial || d.serial || 'may'}.docx`
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fname)}"`,
      },
    })
  } catch (error: any) {
    console.error('Error export bien ban giam dinh:', error)
    return NextResponse.json({ error: 'Lỗi xuất biên bản: ' + (error?.message || '') }, { status: 500 })
  }
}
