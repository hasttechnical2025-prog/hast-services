import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { requireRole } from '@/lib/session'
import { buildReportData, type ManualFields } from '@/lib/report/bao-cao'

export const runtime = 'nodejs'

const THANG_RE = /^\d{4}-\d{2}$/

// Xem trước số liệu (JSON) để hiển thị trên màn hình trước khi xuất
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const thang = new URL(request.url).searchParams.get('thang') || ''
    if (!THANG_RE.test(thang)) return NextResponse.json({ error: 'Thiếu hoặc sai tháng (YYYY-MM)' }, { status: 400 })

    const data = await buildReportData(thang)
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error building report preview:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Xuất file .docx đã điền dữ liệu (không lưu)
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const body = await request.json()
    const thang: string = body.thang || ''
    const manual: ManualFields = body.manual || {}
    if (!THANG_RE.test(thang)) return NextResponse.json({ error: 'Thiếu hoặc sai tháng (YYYY-MM)' }, { status: 400 })

    const data = await buildReportData(thang, manual)

    const tplPath = path.join(process.cwd(), 'src', 'lib', 'report', 'template.docx')
    const content = fs.readFileSync(tplPath)
    const zip = new PizZip(content)
    const doc = new Docxtemplater(zip, {
      delimiters: { start: '{{', end: '}}' },
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '',
    })
    doc.render(data)
    const out = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })

    const [y, m] = thang.split('-')
    return new NextResponse(out as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="Bao-cao-thang-${m}-${y}.docx"`,
      },
    })
  } catch (error: any) {
    console.error('Error exporting report:', error)
    const msg = error?.properties?.errors?.map((e: any) => e.message).join('; ') || error.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
