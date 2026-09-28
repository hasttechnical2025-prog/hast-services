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

// GET ?id=<lenh_id> : in .docx LỆNH XUẤT HÀNG (template src/lib/report/lenh-xuat.docx).
// Scope: NV kinh_doanh thường chỉ in lệnh của mình; sale_admin/admin/kthc in bất kỳ.

const money = (v: any) => Math.round(Number(v) || 0).toLocaleString('vi-VN')

export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'kinh_doanh', 'kthc')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu id lệnh' }, { status: 400 })

    const { data: lenh, error } = await supabaseAdmin
      .from('soct_lenh_xuat')
      .select(`*, soct_lenh_xuat_ct(*), nguoi_kd:soct_users!nguoi_kinh_doanh_id(full_name)`)
      .eq('id', id).single()
    if (error || !lenh) return NextResponse.json({ error: 'Không tìm thấy lệnh' }, { status: 404 })

    // NV thường chỉ in lệnh của mình.
    if (session.role === 'kinh_doanh') {
      const { data: u } = await supabaseAdmin.from('soct_users').select('kd_quan_ly').eq('id', session.id).maybeSingle()
      if (!u?.kd_quan_ly && lenh.nguoi_kinh_doanh_id !== session.id) {
        return NextResponse.json({ error: 'Không có quyền in lệnh này' }, { status: 403 })
      }
    }

    const rawLines = (lenh.soct_lenh_xuat_ct || []).slice().sort((a: any, b: any) => (a.stt || 0) - (b.stt || 0))
    let truoc = 0, sauVat = 0
    const lines = rawLines.map((l: any, i: number) => {
      const sl = Number(l.so_luong) || 0, dg = Number(l.don_gia) || 0, tt = sl * dg
      truoc += tt
      sauVat += tt * (1 + (Number(l.vat) || 0) / 100)
      return {
        stt: i + 1,
        ten_hang: l.ten_hang_hd || l.ten_hang || l.ma_hang || '',
        dvt: l.dvt || 'Cái',
        so_luong: sl,
        don_gia: money(dg),
        thanh_tien: money(tt),
      }
    })
    const tong = Math.round(sauVat) + (Number(lenh.lam_tron) || 0)
    const bangChu = docSoTien(tong).replace(/\.\/\.$/, '').trim()   // template có "./." tĩnh sẵn

    const d = lenh.ngay ? new Date(lenh.ngay) : new Date()
    const data = {
      so_lenh: lenh.so_lenh || '',
      ten_khach: lenh.ten_khach_hd || lenh.ten_khach_hang || '',
      dia_chi: lenh.dia_chi || '',
      mst: lenh.ma_so_thue || '',
      nv_kinh_doanh: lenh.nguoi_kd?.full_name || '',
      so_hop_dong: lenh.so_hop_dong || '',
      ghi_chu: lenh.ghi_chu || '',
      ngay_dd: String(d.getDate()).padStart(2, '0'),
      ngay_mm: String(d.getMonth() + 1).padStart(2, '0'),
      ngay_yyyy: String(d.getFullYear()),
      lines,
      tien_hang: money(truoc),
      tien_thue: money(Math.round(sauVat) - truoc),
      tong: money(tong),
      bang_chu: bangChu,
    }

    const tplPath = path.join(process.cwd(), 'src', 'lib', 'report', 'lenh-xuat.docx')
    const zip = new PizZip(fs.readFileSync(tplPath))
    const doc = new Docxtemplater(zip, { delimiters: { start: '{{', end: '}}' }, paragraphLoop: true, linebreaks: true, nullGetter: () => '' })
    doc.render(data)
    const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })

    await logAudit(session, 'In lệnh xuất hàng', `lệnh ${lenh.so_lenh || id}`)
    const fname = `LenhXuat-${lenh.so_lenh || id}.docx`
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fname)}"`,
      },
    })
  } catch (error: any) {
    console.error('Error print lenh-xuat:', error)
    return NextResponse.json({ error: 'Lỗi in lệnh: ' + (error?.message || '') }, { status: 500 })
  }
}
