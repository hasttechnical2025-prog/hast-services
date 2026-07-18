import { NextResponse } from 'next/server'
import { sendTelegramMessage } from '@/lib/telegram'
import { isBaoTri } from '@/lib/config'
import { getMissingReports } from '@/lib/report/bao-cao'

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const secret = process.env.CRON_SECRET
    // Nếu có CRON_SECRET trong env, bắt buộc Request phải truyền Authorization: Bearer <secret>
    if (secret && authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Chế độ bảo trì: không quét, không nhắc gì cả
    if (await isBaoTri()) {
      return NextResponse.json({ message: 'Hệ thống đang bảo trì — bỏ qua lần nhắc này' })
    }

    const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID
    if (!groupChatId) {
      return NextResponse.json({ message: 'Không có group chat id' })
    }

    // 1. Quét KTV nợ báo cáo
    const missingReports = await getMissingReports()

    if (missingReports.length === 0) {
      return NextResponse.json({ message: 'Tất cả KTV đã nộp đủ báo cáo' })
    }

    // 2. Xây dựng tin nhắn và bắn Telegram
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://techservice.app'
    let msg = `🔔 <b>NHẮC NHỞ NỘP BÁO CÁO NHẬT KÝ</b>\n`
    msg += `Các kỹ thuật viên vui lòng hoàn thành báo cáo ngày cho các ngày làm việc còn thiếu:\n\n`

    missingReports.forEach(m => {
      msg += `👤 <b>${m.ktvName}:</b> thiếu ngày ${m.missingDays.join(', ')}\n`
    })

    msg += `\n👉 <a href="${appUrl}/ktv">Mở App KTV để nộp báo cáo bổ sung</a>`

    await sendTelegramMessage(groupChatId, msg)

    return NextResponse.json({ success: true, count: missingReports.length })
  } catch (error: any) {
    console.error('Error in cron job nhac-bao-cao:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
