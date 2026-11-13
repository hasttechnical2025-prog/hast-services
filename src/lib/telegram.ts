import { isBaoTri } from '@/lib/config'

// Hàm gửi tin nhắn Telegram thông qua Telegram Bot API
export async function sendTelegramMessage(chatId: string, text: string, replyMarkup?: any, disableNotification = false): Promise<{ success: boolean; messageId?: number }> {
  // Chế độ bảo trì: dừng HẾT tin nhắn (kể cả do admin thao tác) — chặn ở một chỗ
  // để không luồng nào lọt (giao việc, nghỉ phép, hoàn phiếu, nhắc báo cáo...).
  if (await isBaoTri()) return { success: false }

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.error('Missing TELEGRAM_BOT_TOKEN env variable')
    return { success: false }
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
        disable_notification: disableNotification,
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      console.error('Failed to send Telegram message:', data)
      return { success: false }
    }

    return { success: true, messageId: data.result?.message_id }
  } catch (error) {
    console.error('Error sending Telegram message:', error)
    return { success: false }
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
      // "message is not modified" = nội dung y hệt -> coi như THÀNH CÔNG (no-op), KHÔNG phải lỗi.
      // (Nếu coi là lỗi, caller sẽ tưởng sửa hỏng rồi gửi tin mới -> spam bảng việc hôm nay.)
      if (typeof errData?.description === 'string' && /not modified/i.test(errData.description)) return true
      console.error('Failed to edit Telegram message:', errData)
      return false
    }

    return true
  } catch (error) {
    console.error('Error editing Telegram message:', error)
    return false
  }
}

// Ghim / bỏ ghim 1 tin nhắn (cho "Bảng việc hôm nay"). Cần bot là admin nhóm + quyền ghim.
// silent=true: ghim KHÔNG gửi thông báo. Thiếu quyền -> trả false (nuốt lỗi, không chặn luồng).
export async function pinChatMessage(chatId: string, messageId: number, silent = true): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return false
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/pinChatMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, disable_notification: silent }),
    })
    if (!r.ok) { console.error('pinChatMessage failed:', await r.json().catch(() => ({}))); return false }
    return true
  } catch (e) { console.error('pinChatMessage error:', e); return false }
}

export async function unpinChatMessage(chatId: string, messageId: number): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return false
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/unpinChatMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    })
    return r.ok
  } catch (e) { console.error('unpinChatMessage error:', e); return false }
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
