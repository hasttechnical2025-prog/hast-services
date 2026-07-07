import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'
import { buildQuoteData, type QuoteInput } from '@/lib/report/bao-gia'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// Danh sách phiếu công nợ: có số phiếu + chưa lên hóa đơn (Chưa hóa đơn / Đã báo giá)
export async function GET() {
  try {
    const session = await requireTab('cong_no')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const data = await selectAll((from, to) => supabaseAdmin
      .from('soct_cong_viec')
      .select(`id, ngay, report, loai_cong_viec, trang_thai_hd, id_khach_hang,
        soct_khach_hang ( ten_khach_hang, dia_chi ),
        soct_chi_tiet_vat_tu ( ma_hang, so_luong, don_gia, vat, soct_kho_hang ( ten_hang ) )`)
      .not('report', 'is', null)
      .neq('report', '')
      .neq('trang_thai_hd', 'Đã lên hóa đơn')
      .order('ngay', { ascending: true })
      .range(from, to))

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching cong no:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Cập nhật trạng thái hóa đơn hàng loạt. 'Đã lên hóa đơn' -> đồng bộ cờ hoa_don các dòng vật tư.
export async function PUT(request: Request) {
  try {
    const session = await requireTab('cong_no')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const { ids, trang_thai_hd } = await request.json()
    if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: 'Chưa chọn phiếu' }, { status: 400 })
    if (!['Chưa hóa đơn', 'Đã báo giá', 'Đã lên hóa đơn'].includes(trang_thai_hd)) {
      return NextResponse.json({ error: 'Trạng thái không hợp lệ' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('soct_cong_viec').update({ trang_thai_hd }).in('id', ids)
    if (error) throw error

    // Đồng bộ cờ hoa_don ở cấp dòng vật tư để Sổ công tác khớp với công nợ (2 chiều):
    //  - 'Đã lên hóa đơn'      -> hoa_don = true  (Sổ công tác hiện "Có HĐ")
    //  - 'Chưa hóa đơn'/'Đã báo giá' -> hoa_don = false (quay lại "Chưa HĐ", vào công nợ)
    await supabaseAdmin
      .from('soct_chi_tiet_vat_tu')
      .update({ hoa_don: trang_thai_hd === 'Đã lên hóa đơn' })
      .in('id_cong_viec', ids)

    await logAudit(session, 'Cập nhật trạng thái hóa đơn', `${ids.length} phiếu → ${trang_thai_hd}`)
    return NextResponse.json({ success: true, count: ids.length })
  } catch (error: any) {
    console.error('Error updating cong no status:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Xuất báo giá .docx (4 trang: giá gốc + 3 báo giá cạnh tranh). Không lưu.
export async function POST(request: Request) {
  try {
    const session = await requireTab('cong_no')
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

    // Tên file ASCII cho filename (header chỉ nhận ByteString), kèm filename* UTF-8 cho tên có dấu
    const ascii = (input.khach_hang || 'khach')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'khach'
    const utf8 = encodeURIComponent(`Bao-gia-${input.khach_hang || 'khach'}.docx`)
    return new NextResponse(out as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="Bao-gia-${ascii}.docx"; filename*=UTF-8''${utf8}`,
      },
    })
  } catch (error: any) {
    console.error('Error exporting quote:', error)
    const msg = error?.properties?.errors?.map((e: any) => e.message).join('; ') || error.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
