import { NextResponse } from 'next/server'
import { refreshTeleBoard } from '@/lib/tele-board'

// CRON 7:00 sáng (giờ VN) — "mở bảng việc ngày mới" cho đều đặn, kể cả khi sáng chưa có việc nào.
// refreshTeleBoard tự: nếu sang ngày mới -> gửi bảng mới + ghim + bỏ ghim bảng cũ; nếu đã có bảng
// hôm nay (ai đó tạo việc sớm) -> chỉ sửa tại chỗ. Gated config tele_board_bat + bảo trì -> no-op.
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const secret = process.env.CRON_SECRET
    if (secret && authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await refreshTeleBoard()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in cron mo-bang-viec:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
