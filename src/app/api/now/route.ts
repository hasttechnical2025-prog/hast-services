import { NextResponse } from 'next/server'

// Giờ máy chủ (epoch ms) để client tính độ lệch đồng hồ: offset = server - client.
// Dùng đóng dấu "giờ chạm" đúng ngay cả khi điện thoại KTV sai giờ. Công khai, vô hại.
export async function GET() {
  return NextResponse.json({ now: Date.now() })
}
