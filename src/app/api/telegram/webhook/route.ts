import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

export async function POST(request: Request) {
  try {
    const payload = await request.json()

    // Cấu trúc của Telegram Update object
    const message = payload.message
    if (!message) {
      return NextResponse.json({ ok: true })
    }

    const chatId = message.chat.id.toString()
    const text = message.text || ''

    // Kiểm tra nếu tin nhắn là lệnh /start với mã KTV
    // Cú pháp: /start <userId>
    if (text.startsWith('/start')) {
      const parts = text.split(' ')
      if (parts.length > 1) {
        const userId = parts[1] // Đây là uuid của user trong database

        // Cập nhật telegram_id cho user trong DB
        const { error } = await supabaseAdmin
          .from('soct_users')
          .update({ telegram_id: chatId })
          .eq('id', userId)

        if (error) {
          console.error('Error updating telegram_id:', error)
          // Báo lỗi cho người dùng qua Telegram
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: '❌ Có lỗi xảy ra khi liên kết tài khoản. Vui lòng liên hệ Admin.',
            }),
          })
        } else {
          // Báo thành công qua Telegram
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: '✅ Tài khoản của bạn đã được liên kết thành công với Telegram Bot này! Bạn sẽ nhận được thông báo khi có công việc mới.',
            }),
          })
        }
      } else {
        // Hướng dẫn nếu gõ /start không có id
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: 'Chào mừng bạn đến với Tech-Service App Bot! Để liên kết tài khoản, vui lòng truy cập App trên điện thoại và nhấn vào nút "Liên kết Telegram".',
          }),
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error handling Telegram webhook:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
