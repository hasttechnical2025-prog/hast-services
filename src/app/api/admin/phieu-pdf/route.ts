import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/session'
import { parsePhieuPdf } from '@/lib/phieu-pdf'

export const runtime = 'nodejs'

// Nhận file PDF "Phiếu công tác" (mẫu cố định) -> bóc tách thành dữ liệu tiền-điền form Giao việc.
// Chỉ trả về dữ liệu ĐÃ ĐỌC (không lưu gì). Việc đối chiếu mã máy/mã hàng + validate để client
// làm trên danh sách khách/kho đã tải sẵn (nhanh, không truy vấn thêm).
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const form = await request.formData()
    const file = form.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Thiếu file PDF' }, { status: 400 })
    }
    const f = file as File
    if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) {
      return NextResponse.json({ error: 'File phải là PDF' }, { status: 400 })
    }
    if (f.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: 'File quá lớn (giới hạn 8MB)' }, { status: 400 })
    }

    const buf = Buffer.from(await f.arrayBuffer())
    const parsed = await parsePhieuPdf(buf)

    if (!parsed.so_phieu && !parsed.ma_may && parsed.vat_tu.length === 0) {
      return NextResponse.json({ error: 'Không đọc được dữ liệu từ phiếu. File có thể không đúng mẫu hoặc là ảnh scan.' }, { status: 422 })
    }

    return NextResponse.json({ data: parsed })
  } catch (error: any) {
    console.error('Error parsing phieu PDF:', error)
    return NextResponse.json({ error: 'Lỗi đọc file PDF: ' + (error?.message || 'không xác định') }, { status: 500 })
  }
}
