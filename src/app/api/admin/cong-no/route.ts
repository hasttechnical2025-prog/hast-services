import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { buildQuoteData, type QuoteInput } from '@/lib/report/bao-gia'

export const runtime = 'nodejs'

// Danh sách phiếu công nợ: có số phiếu + chưa lên hóa đơn (Chưa hóa đơn / Đã báo giá)
export async function GET() {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const { data, error } = await supabaseAdmin
      .from('soct_cong_viec')
      .select(`id, ngay, report, loai_cong_viec, trang_thai_hd, id_khach_hang,
        soct_khach_hang ( ten_khach_hang, dia_chi ),
        soct_chi_tiet_vat_tu ( ma_hang, so_luong, don_gia, vat, soct_kho_hang ( ten_hang ) )`)
      .not('report', 'is', null)
      .neq('report', '')
      .neq('trang_thai_hd', 'Đã lên hóa đơn')
      .order('ngay', { ascending: true })

    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching cong no:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Cập nhật trạng thái hóa đơn hàng loạt. 'Đã lên hóa đơn' -> đồng bộ cờ hoa_don các dòng vật tư.
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const { ids, trang_thai_hd } = await request.json()
    if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: 'Chưa chọn phiếu' }, { status: 400 })
    if (!['Chưa hóa đơn', 'Đã báo giá', 'Đã lên hóa đơn'].includes(trang_thai_hd)) {
      return NextResponse.json({ error: 'Trạng thái không hợp lệ' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('soct_cong_viec').update({ trang_thai_hd }).in('id', ids)
    if (error) throw error

    if (trang_thai_hd === 'Đã lên hóa đơn') {
      // đồng bộ hóa đơn ở cấp dòng vật tư để Sổ công tác hiển thị "Có HĐ"
      await supabaseAdmin.from('soct_chi_tiet_vat_tu').update({ hoa_don: true }).in('id_cong_viec', ids)
    }

    return NextResponse.json({ success: true, count: ids.length })
  } catch (error: any) {
    console.error('Error updating cong no status:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Xuất báo giá .docx (4 trang: giá gốc + 3 báo giá cạnh tranh). Không lưu.
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const body = await request.json()
    const input: QuoteInput = {
      khach_hang: body.khach_hang || '',
      dia_chi: body.dia_chi || '',
      nam: String(body.nam || new Date().getFullYear()),
      rows: Array.isArray(body.rows) ? body.rows : [],
      markups: Array.isArray(body.markups) && body.markups.length === 3 ? body.markups : [3, 5, 6],
    }
    if (input.rows.length === 0) return NextResponse.json({ error: 'Không có dòng vật tư nào để báo giá' }, { status: 400 })

    const data = buildQuoteData(input)

    const tplPath = path.join(process.cwd(), 'src', 'lib', 'report', 'bao-gia-template.docx')
    const zip = new PizZip(fs.readFileSync(tplPath))
    const doc = new Docxtemplater(zip, { delimiters: { start: '{{', end: '}}' }, paragraphLoop: true, linebreaks: true, nullGetter: () => '' })
    doc.render(data)
    const out = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })

    const safe = (input.khach_hang || 'khach').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'khach'
    return new NextResponse(out as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="Bao-gia-${safe}.docx"`,
      },
    })
  } catch (error: any) {
    console.error('Error exporting quote:', error)
    const msg = error?.properties?.errors?.map((e: any) => e.message).join('; ') || error.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
