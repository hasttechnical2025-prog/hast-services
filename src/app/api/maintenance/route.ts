import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { isBaoTri, BAO_TRI_MSG } from '@/lib/config'

// Công khai (không cần đăng nhập) — chỉ để giao diện biết có nên hiện màn "đang bảo trì".
// KHÔNG phải là lớp bảo vệ: chặn thật nằm ở requireRole + các route đăng nhập.
export async function GET() {
  try {
    if (!await isBaoTri()) return NextResponse.json({ bao_tri: false })
    const session = await getSession()
    // logged_in để giao diện biết có cần chừa lối vào form đăng nhập hay không:
    // admin đăng xuất giữa lúc bảo trì mà bị lớp phủ che mất form -> tự nhốt mình ngoài.
    return NextResponse.json({
      bao_tri: true,
      admin: session?.role === 'admin',
      logged_in: !!session,
      msg: BAO_TRI_MSG,
    })
  } catch {
    // Lỗi -> coi như không bảo trì, để không khóa nhầm app
    return NextResponse.json({ bao_tri: false })
  }
}
