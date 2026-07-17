import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { isBaoTri, getCauHinh, BAO_TRI_MSG } from '@/lib/config'

// Công khai. Tên/vỏ ngoài cố ý trung tính như một health-check bình thường: nếu đặt tên
// kiểu /api/maintenance và trả {bao_tri:true} thì chỉ cần mở tab Network của DevTools là
// lộ ngay việc app bị khóa có chủ đích. Ở đây chỉ trả:
//   { ok: true }                    -> bình thường
//   { ok: false, allow, msg }       -> đang khóa; allow = được phép dùng (admin hoặc có khóa)
//
// KHÔNG phải lớp bảo vệ: chặn thật nằm ở requireRole() + các route đăng nhập + cron + Telegram.
export async function GET(request: Request) {
  try {
    if (!await isBaoTri()) return NextResponse.json({ ok: true })

    const session = await getSession()

    // Lối vào KÍN cho admin: mở app kèm ?qt=<khóa> (đặt ở Hệ thống > Cấu hình).
    // Đối chiếu Ở SERVER -> khóa không nằm trong JS gửi về trình duyệt.
    const cfg = await getCauHinh()
    const key = (cfg.bao_tri_key || '').trim()
    const qt = (new URL(request.url).searchParams.get('qt') || '').trim()

    const allow = session?.role === 'admin' || (key.length > 0 && qt === key)
    return NextResponse.json({ ok: false, allow, msg: BAO_TRI_MSG })
  } catch {
    // Lỗi -> coi như bình thường, để không khóa nhầm app
    return NextResponse.json({ ok: true })
  }
}
