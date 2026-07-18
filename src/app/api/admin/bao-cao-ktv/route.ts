import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'

export const runtime = 'nodejs'

// Escape HTML để dữ liệu người dùng không phá parse_mode='HTML' của Telegram (nếu cần log)
const asciiFile = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ktv'

// GET: Lấy danh sách báo cáo nhật ký KTV cho Admin
export async function GET(request: Request) {
  try {
    const session = await requireTab('quan_ly', 'quan_ly.nhat_ky')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const ktv_id = searchParams.get('ktv_id') || ''
    const tuNgay = searchParams.get('tu_ngay')
    const denNgay = searchParams.get('den_ngay')

    // 1. Lấy danh sách các bản khai trạng thái nộp báo cáo (đã nộp hay chưa)
    let ttQuery = supabaseAdmin.from('soct_trang_thai_bao_cao').select('ktv_id, ngay_bao_cao, da_nop, thoi_gian_nop')
    if (ktv_id) ttQuery = ttQuery.eq('ktv_id', ktv_id)
    if (tuNgay) ttQuery = ttQuery.gte('ngay_bao_cao', tuNgay)
    if (denNgay) ttQuery = ttQuery.lte('ngay_bao_cao', denNgay)
    const { data: ttList, error: ttErr } = await ttQuery
    if (ttErr) throw ttErr

    // 2. Lấy danh sách việc sổ công tác (những việc đã hoàn thành hoặc đang làm)
    const jobs = await selectAll((from, to) => {
      let q = supabaseAdmin
        .from('soct_cong_viec')
        .select(`
          id, ngay, ktv_id, ktv2_id, ma_may, loai_cong_viec, ket_qua, counter, ghi_chu_ktv, so_phut_xu_ly,
          soct_khach_hang ( ten_khach_hang )
        `)
        .in('ket_qua', ['Hoàn thành', 'Đang làm', 'Lắp tiếp'])
        .order('ngay', { ascending: false })
        .range(from, to)

      if (ktv_id) {
        // Có thể là KTV chính hoặc KTV kèm
        q = q.or(`ktv_id.eq.${ktv_id},ktv2_id.eq.${ktv_id}`)
      }
      if (tuNgay) q = q.gte('ngay', tuNgay)
      if (denNgay) q = q.lte('ngay', denNgay)
      return q
    })

    // 3. Lấy việc ngoài luồng
    const extras = await selectAll((from, to) => {
      let q = supabaseAdmin
        .from('soct_nhat_ky_ktv')
        .select('id, ktv_id, ngay, noi_dung, created_at')
        .order('ngay', { ascending: false })
        .order('created_at', { ascending: true })
        .range(from, to)

      if (ktv_id) q = q.eq('ktv_id', ktv_id)
      if (tuNgay) q = q.gte('ngay', tuNgay)
      if (denNgay) q = q.lte('ngay', denNgay)
      return q
    })

    // Phân quyền trả về dữ liệu (nhóm theo Ngày và KTV) sẽ được xử lý phía Client để tạo UI
    return NextResponse.json({
      data: {
        trang_thai: ttList || [],
        jobs: jobs || [],
        extras: extras || []
      }
    })
  } catch (error: any) {
    console.error('Error fetching admin KTV report:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: Xuất file Word (.docx) báo cáo ngày của 1 KTV
export async function POST(request: Request) {
  try {
    const session = await requireTab('quan_ly', 'quan_ly.nhat_ky')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    }

    const { ktv_id, ngay } = await request.json()
    if (!ktv_id || !ngay || !/^\d{4}-\d{2}-\d{2}$/.test(ngay)) {
      return NextResponse.json({ error: 'Thiếu thông tin KTV hoặc ngày không hợp lệ' }, { status: 400 })
    }

    // 1. Kiểm tra trạng thái nộp báo cáo
    const { data: ttReport } = await supabaseAdmin
      .from('soct_trang_thai_bao_cao')
      .select('da_nop')
      .eq('ktv_id', ktv_id)
      .eq('ngay_bao_cao', ngay)
      .single()

    if (!ttReport || !ttReport.da_nop) {
      return NextResponse.json({ error: 'Báo cáo ngày này chưa được KTV chốt nộp. Không thể xuất báo cáo!' }, { status: 400 })
    }

    // 2. Lấy thông tin KTV
    const { data: ktv } = await supabaseAdmin
      .from('soct_users')
      .select('full_name')
      .eq('id', ktv_id)
      .single()

    if (!ktv) {
      return NextResponse.json({ error: 'Không tìm thấy kỹ thuật viên' }, { status: 404 })
    }

    // 3. Lấy dữ liệu công việc trong Sổ công tác của KTV ngày đó (chính & phụ)
    const { data: dbJobs, error: jErr } = await supabaseAdmin
      .from('soct_cong_viec')
      .select(`
        id, ma_may, loai_cong_viec, counter, ghi_chu_ktv, ktv2_id,
        soct_khach_hang ( ten_khach_hang, dia_chi )
      `)
      .eq('ngay', ngay)
      .or(`ktv_id.eq.${ktv_id},ktv2_id.eq.${ktv_id}`)
      .in('ket_qua', ['Hoàn thành', 'Đang làm', 'Lắp tiếp'])
      .order('created_at', { ascending: true })

    if (jErr) throw jErr

    // 3. Lấy dữ liệu công việc ngoài sổ
    const { data: dbExtras, error: eErr } = await supabaseAdmin
      .from('soct_nhat_ky_ktv')
      .select('noi_dung')
      .eq('ktv_id', ktv_id)
      .eq('ngay', ngay)
      .order('created_at', { ascending: true })

    if (eErr) throw eErr

    // 4. Phân tách Ngày, Tháng, Năm để điền vào Word
    const dateObj = new Date(ngay)
    const DD = String(dateObj.getDate()).padStart(2, '0')
    const MM = String(dateObj.getMonth() + 1).padStart(2, '0')
    const YYYY = String(dateObj.getFullYear())

    // 5. Build danh sách jobs gộp theo đúng quy tắc hiển thị của người dùng
    const jobsList: any[] = []
    let stt = 1

    // A. Thêm các việc trong Sổ công tác
    if (dbJobs) {
      dbJobs.forEach((j: any) => {
        const isKtv2 = j.ktv2_id === ktv_id
        const kh = j.soct_khach_hang
        const khName = kh ? kh.ten_khach_hang : '—'
        const khAddr = kh ? kh.dia_chi : ''

        // Tên khách hàng & địa chỉ xuống dòng tự nhiên trong ô
        const ten_khach_hang = khAddr ? `${khName}\n${khAddr}` : khName
        const loai_cong_viec = j.loai_cong_viec + (isKtv2 ? ' (kèm)' : '')
        const ghi_chu_ktv = j.ghi_chu_ktv || '—'

        jobsList.push({
          stt: String(stt++),
          ten_khach_hang,
          loai_cong_viec,
          ghi_chu_ktv
        })
      })
    }

    // B. Thêm các việc ngoài Sổ công tác (việc vặt)
    if (dbExtras) {
      dbExtras.forEach((e: any) => {
        jobsList.push({
          stt: String(stt++),
          ten_khach_hang: e.noi_dung, // Khách hàng ghi trực tiếp nội dung việc vặt KTV gõ
          loai_cong_viec: 'Hỗ trợ', // Cột công việc ghi chữ cố định "Hỗ trợ"
          ghi_chu_ktv: '—' // Ghi chú ghi gạch ngang "—"
        })
      })
    }

    // 6. Nạp file template Word từ thư mục dự án
    const templatePath = path.join(process.cwd(), 'src', 'lib', 'report', 'bao-cao-ktv-template.docx')
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ error: 'Không tìm thấy file mẫu bao-cao-ktv-template.docx trong hệ thống. Vui lòng kiểm tra lại.' }, { status: 404 })
    }

    const zip = new PizZip(fs.readFileSync(templatePath))
    const doc = new Docxtemplater(zip, {
      delimiters: { start: '{{', end: '}}' },
      paragraphLoop: true,
      linebreaks: true, // cực kỳ quan trọng để xuống dòng tự nhiên trong ô bảng Word
      nullGetter: () => ''
    })

    // Điền dữ liệu vào các placeholders
    doc.render({
      ten_ktv: ktv.full_name,
      DD,
      MM,
      YYYY,
      jobs: jobsList
    })

    const buffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })

    const asciiName = asciiFile(ktv.full_name)
    const utf8Name = encodeURIComponent(`Bao-cao-KTV-${ktv.full_name}-${ngay}.docx`)

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename=Bao-cao-KTV-${asciiName}-${ngay}.docx; filename*=UTF-8''${utf8Name}`,
        'Content-Length': String(buffer.length)
      }
    })
  } catch (error: any) {
    console.error('Error exporting KTV daily report:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
