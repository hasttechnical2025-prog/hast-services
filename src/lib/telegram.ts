import { isBaoTri } from '@/lib/config'

// Hàm gửi tin nhắn Telegram thông qua Telegram Bot API
export async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  // Chế độ bảo trì: dừng HẾT tin nhắn (kể cả do admin thao tác) — chặn ở một chỗ
  // để không luồng nào lọt (giao việc, nghỉ phép, hoàn phiếu, nhắc báo cáo...).
  if (await isBaoTri()) return false

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.error('Missing TELEGRAM_BOT_TOKEN env variable')
    return false
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
      }),
    })

    if (!response.ok) {
      const errData = await response.json()
      console.error('Failed to send Telegram message:', errData)
      return false
    }

    return true
  } catch (error) {
    console.error('Error sending Telegram message:', error)
    return false
  }
}
