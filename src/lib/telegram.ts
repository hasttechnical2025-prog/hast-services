import { isBaoTri } from '@/lib/config'

// Hàm gửi tin nhắn Telegram thông qua Telegram Bot API
export async function sendTelegramMessage(chatId: string, text: string, replyMarkup?: any): Promise<boolean> {
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
        reply_markup: replyMarkup,
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

// Hàm cập nhật nội dung tin nhắn Telegram cũ
export async function editTelegramMessageText(
  chatId: string,
  messageId: number,
  text: string,
  replyMarkup?: any
): Promise<boolean> {
  if (await isBaoTri()) return false

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.error('Missing TELEGRAM_BOT_TOKEN env variable')
    return false
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      }),
    })

    if (!response.ok) {
      const errData = await response.json()
      console.error('Failed to edit Telegram message:', errData)
      return false
    }

    return true
  } catch (error) {
    console.error('Error editing Telegram message:', error)
    return false
  }
}

// Hàm phản hồi callback query để tắt trạng thái loading spinner trên nút bấm Telegram
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return false

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text,
      }),
    })

    return response.ok
  } catch (error) {
    console.error('Error answering callback query:', error)
    return false
  }
}
