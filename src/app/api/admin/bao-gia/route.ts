import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'
import { buildQuoteData, type QuoteInput } from '@/lib/report/bao-gia'

export const runtime = 'nodejs'

// Báo giá dùng chung cho Công nợ VÀ Giám định -> ai thấy MỘT trong hai tab đều được.
async function requireBaoGia() {
  return (await requireTab('cong_no')) || (await requireTab('theo_doi_may', 'theo_doi_may.giam_dinh'))
}

// GET ?ma_hang=A,B,C -> gợi ý giá BÁN GẦN NHẤT của từng mã hàng (lấy từ phiếu đã lập).
// Trả { [ma_hang]: { don_gia, vat } }. Mã chưa bán bao giờ -> không có key (client để 0).
export async function GET(request: Request) {
  try {
    const session = await requireBaoGia()
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const raw = new URL(request.url).searchParams.get('ma_hang') || ''
    const maHangs = Array.from(new Set(raw.split(',').map(s => s.trim()).filter(Boolean))).slice(0, 50)
    if (maHangs.length === 0) return NextResponse.json({ data: {} })

    // Mỗi mã 1 truy vấn nhỏ (limit 1) -> chính xác & không kéo về cả lịch sử bán hàng.
    const found = await Promise.all(maHangs.map(async (ma) => {
      const { data } = await supabaseAdmin
        .from('soct_chi_tiet_vat_tu')
        .select('ma_hang, don_gia, vat, created_at')
        .eq('ma_hang', ma)
        .gt('don_gia', 0)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    }))

    const out: Record<string, { don_gia: number, vat: number }> = {}
    for (const r of found) {
      if (r?.ma_hang) out[r.ma_hang] = { don_gia: Number(r.don_gia) || 0, vat: Number(r.vat) || 0 }
    }
    return NextResponse.json({ data: out })
  } catch (error: any) {
    console.error('Error suggesting prices:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: xuất báo giá .docx (4 trang: giá gốc + 3 báo giá cạnh tranh). Không lưu.
export async function POST(request: Request) {
  try {
    const session = await requireBaoGia()
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
