import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { isBaoTri, getCauHinh, BAO_TRI_MSG } from '@/lib/config'

// Công khai (không cần đăng nhập) — chỉ để giao diện biết có nên hiện màn "đang bảo trì".
// KHÔNG phải là lớp bảo vệ: chặn thật nằm ở requireRole + các route đăng nhập.
export async function GET(request: Request) {
  try {
    if (!await isBaoTri()) return NextResponse.json({ bao_tri: false })
    const session = await getSession()

    // Lối vào KÍN cho admin: mở app kèm ?qt=<khóa> (khóa đặt trong Hệ thống > Cấu hình).
    // Đối chiếu Ở SERVER để khóa không nằm trong mã JS gửi về trình duyệt -> soi mã
    // nguồn trang cũng không thấy. Cần vì admin đăng xuất giữa lúc bảo trì sẽ bị chính
    // lớp phủ che mất form đăng nhập.
    const cfg = await getCauHinh()
    const key = (cfg.bao_tri_key || '').trim()
    const qt = (new URL(request.url).searchParams.get('qt') || '').trim()
    const bypass = key.length > 0 && qt === key

    return NextResponse.json({
      bao_tri: true,
      admin: session?.role === 'admin',
      bypass,
      msg: BAO_TRI_MSG,
    })
  } catch {
    // Lỗi -> coi như không bảo trì, để không khóa nhầm app
    return NextResponse.json({ bao_tri: false })
  }
}
