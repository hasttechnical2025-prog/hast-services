import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { getCauHinh } from '@/lib/config'

export const runtime = 'nodejs'

// Chip báo cáo (KTV bấm) -> câu đầy đủ (khách đọc). Nhãn ngắn ở client; câu đầy đủ ghép ở server.
const CHIP_TEXT: Record<string, string> = {
  ve_sinh: 'Đã vệ sinh máy',
  sua_loi: 'Đã sửa lỗi',
  can_chinh: 'Đã căn chỉnh',
  hdbt: 'Máy hoạt động bình thường',
  theo_doi: 'Cần theo dõi thêm',
}

// GET ?config=1 -> KTV app biết loại việc nào cần báo cáo (mặc định "Sửa máy").
export async function GET(request: Request) {
  try {
    const session = await requireRole('ktv', 'admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    if (new URL(request.url).searchParams.get('config') === '1') {
      const cfg = await getCauHinh()
      const loai = String(cfg.bao_cao_khach_loai || 'Sửa máy').split(',').map(s => s.trim()).filter(Boolean)
      return NextResponse.json({ loai })
    }
    return NextResponse.json({ error: 'Thiếu tham số' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST { id_cong_viec, chips: string[], ghi_chu } -> tạo/cập nhật báo cáo THÔ (chờ office gọt & gửi).
export async function POST(request: Request) {
  try {
    const session = await requireRole('ktv', 'admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    const b = await request.json()
    if (!b.id_cong_viec) return NextResponse.json({ error: 'Thiếu phiếu' }, { status: 400 })

    const chips: string[] = Array.isArray(b.chips) ? b.chips : []
    const ghiChu = String(b.ghi_chu || '').trim()
    const phrases = chips.map(c => CHIP_TEXT[c]).filter(Boolean)
    let noi_dung = [phrases.join('. ') + (phrases.length ? '.' : ''), ghiChu].map(s => s.trim()).filter(Boolean).join(' ')
    // KTV không chọn chip & không ghi chú -> TỰ ĐỘNG dùng nội dung mặc định (tránh vội quên báo cáo).
    if (!noi_dung) noi_dung = 'Sửa chữa. Máy hoạt động bình thường.'

    const { error } = await supabaseAdmin.from('soct_bao_cao_khach').upsert({
      id_cong_viec: b.id_cong_viec, noi_dung, trang_thai: 'cho_gui', nguoi_tao: session.id,
      nguoi_gui: null, da_gui_luc: null,
    }, { onConflict: 'id_cong_viec' })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error POST ktv bao-cao-khach:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
