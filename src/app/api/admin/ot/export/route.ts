import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'
import { thuVN, fmtNgayVN, khoangGio } from '@/lib/ot'

export const runtime = 'nodejs'

const YM = /^\d{4}-\d{2}$/
const SEL = 'id, nhan_vien_id, ngay, tu_gio, den_gio, dia_diem, dau_viec, ket_qua, ghi_chu, soct_users!nhan_vien_id ( full_name )'

function nextMonthStart(thang: string): string {
  const [y, m] = thang.split('-').map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return `${ny}-${String(nm).padStart(2, '0')}-01`
}

function renderPhieu(thang: string, hoTen: string, rows: any[]): Buffer {
  const tplPath = path.join(process.cwd(), 'src', 'lib', 'report', 'phieu-dang-ky-ot.docx')
  const zip = new PizZip(fs.readFileSync(tplPath))
  const doc = new Docxtemplater(zip, { delimiters: { start: '{{', end: '}}' }, paragraphLoop: true, linebreaks: true, nullGetter: () => '' })
  const [nam, mm] = thang.split('-')
  doc.render({
    THANG: String(Number(mm)), NAM: nam, HOTEN: hoTen,
    ds: rows.map(r => ({
      NGAY: fmtNgayVN(r.ngay),
      THU: thuVN(r.ngay),
      TGIAN: khoangGio(r.tu_gio, r.den_gio),
      DIADIEM: r.dia_diem || '',
      DAUVIEC: r.dau_viec || '',
      KETQUA: r.ket_qua || 'Hoàn thành',
    })),
  })
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, '-')

// GET ?thang=YYYY-MM (bắt buộc) &nv=<id>|all : xuất Phiếu đăng ký làm thêm giờ (.docx / .zip).
export async function GET(request: Request) {
  try {
    const session = await requireTab('quan_ly', 'quan_ly.lam_them_gio')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const sp = new URL(request.url).searchParams
    const thang = sp.get('thang') || ''
    const nv = sp.get('nv') || ''
    if (!YM.test(thang)) return NextResponse.json({ error: 'Thiếu/sai tham số tháng (YYYY-MM)' }, { status: 400 })

    const start = `${thang}-01`
    const end = nextMonthStart(thang)
    const data = await selectAll<any>((from, to) => {
      let q = supabaseAdmin.from('soct_ot').select(SEL).gte('ngay', start).lt('ngay', end)
      if (nv && nv !== 'all') q = q.eq('nhan_vien_id', nv)
      return q.order('ngay', { ascending: true }).range(from, to)
    })
    if (!data || data.length === 0) return NextResponse.json({ error: 'Tháng này chưa có ca OT nào.' }, { status: 404 })

    // Gom theo người (giữ thứ tự ngày đã sort).
    const groups = new Map<string, { name: string; rows: any[] }>()
    for (const r of data) {
      const g = groups.get(r.nhan_vien_id) || { name: r.soct_users?.full_name || 'Nhân viên', rows: [] as any[] }
      g.rows.push(r)
      groups.set(r.nhan_vien_id, g)
    }

    // 1 người -> .docx; nhiều người -> .zip mỗi người 1 phiếu.
    if (groups.size === 1) {
      const g = [...groups.values()][0]
      const buf = renderPhieu(thang, g.name, g.rows)
      const name = `Phieu-dang-ky-OT-${ascii(g.name)}-${thang}`
      return new NextResponse(buf as any, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${name}.docx"; filename*=UTF-8''${encodeURIComponent(name)}.docx`,
        },
      })
    }

    const zip = new PizZip()
    const seen = new Set<string>()
    for (const g of [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'))) {
      let fn = `${ascii(g.name)}.docx`
      let i = 2
      while (seen.has(fn)) { fn = `${ascii(g.name)}-${i++}.docx`; }
      seen.add(fn)
      zip.file(fn, renderPhieu(thang, g.name, g.rows))
    }
    const zbuf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
    const zname = `Phieu-dang-ky-OT-${thang}`
    return new NextResponse(zbuf as any, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zname}.zip"; filename*=UTF-8''${encodeURIComponent(zname)}.zip`,
      },
    })
  } catch (error: any) {
    console.error('Error export ot:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
