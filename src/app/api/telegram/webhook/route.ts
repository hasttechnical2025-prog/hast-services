import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isBaoTri } from '@/lib/config'
import {
  sendTelegramMessage,
  editTelegramMessageText,
  answerCallbackQuery,
} from '@/lib/telegram'
import { getMissingReports } from '@/lib/report/bao-cao'

export async function POST(request: Request) {
  try {
    // Chế độ bảo trì: bỏ qua mọi update từ Telegram
    if (await isBaoTri()) return NextResponse.json({ ok: true, skipped: 'bao_tri' })

    // Xác thực request đến từ Telegram (secret_token đặt khi gọi setWebhook)
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (!webhookSecret) {
      if (process.env.NODE_ENV === 'production') {
        console.error('TELEGRAM_WEBHOOK_SECRET chưa đặt — từ chối webhook ở production')
        return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 401 })
      }
    } else if (request.headers.get('x-telegram-bot-api-secret-token') !== webhookSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await request.json()

    // 1. Phân tách payload xem là Message hay Callback Query
    let senderId = ''
    let chatId = ''
    let text = ''
    let isCallback = false
    let callbackData = ''
    let callbackQueryId = ''
    let messageId: number | undefined

    if (payload.message) {
      senderId = payload.message.from?.id?.toString() || ''
      chatId = payload.message.chat.id.toString()
      text = payload.message.text || ''
    } else if (payload.callback_query) {
      isCallback = true
      senderId = payload.callback_query.from.id.toString()
      chatId = payload.callback_query.message?.chat?.id?.toString() || senderId
      callbackData = payload.callback_query.data || ''
      callbackQueryId = payload.callback_query.id
      messageId = payload.callback_query.message?.message_id
    }

    if (!chatId || !senderId) {
      return NextResponse.json({ ok: true })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase credentials for Telegram webhook')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 2. Kiểm tra xem người gửi đã liên kết tài khoản chưa
    const { data: user, error: userError } = await supabaseAdmin
      .from('soct_users')
      .select('id, full_name, role')
      .eq('telegram_id', senderId)
      .limit(1)
      .maybeSingle()

    const isStartCmd = text.startsWith('/start')

    // Nếu không phải lệnh bắt đầu và user chưa liên kết -> chặn
    if (!isStartCmd) {
      if (userError || !user) {
        if (text && text.startsWith('/')) {
          await sendTelegramMessage(
            chatId,
            '❌ <b>Tài khoản Telegram của bạn chưa được liên kết.</b>\n\n' +
            'Vui lòng truy cập App trên điện thoại -> vào <b>Cài đặt (⚙️)</b> -> bấm <b>Liên kết Telegram</b> để thực hiện liên kết trước khi sử dụng các lệnh này.'
          )
        } else if (isCallback) {
          await answerCallbackQuery(callbackQueryId, 'Tài khoản chưa được liên kết.')
        }
        return NextResponse.json({ ok: true })
      }
    }

    // 3. Xử lý lệnh /start (Liên kết tài khoản)
    if (isStartCmd) {
      const parts = text.split(' ')
      if (parts.length > 1) {
        const userId = parts[1] // UUID của user trong DB
        const { error } = await supabaseAdmin
          .from('soct_users')
          .update({ telegram_id: senderId })
          .eq('id', userId)

        if (error) {
          console.error('Error updating telegram_id:', error)
          await sendTelegramMessage(chatId, '❌ Có lỗi xảy ra khi liên kết tài khoản. Vui lòng liên hệ Admin.')
        } else {
          await sendTelegramMessage(
            chatId,
            '✅ Tài khoản của bạn đã được liên kết thành công với Telegram Bot này! Bạn có thể sử dụng các lệnh ẩn để kiểm tra thông tin.'
          )
        }
      } else {
        await sendTelegramMessage(
          chatId,
          'Chào mừng bạn đến với Tech-Service App Bot! Để liên kết tài khoản, vui lòng truy cập App trên điện thoại và nhấn vào nút "Liên kết Telegram".'
        )
      }
      return NextResponse.json({ ok: true })
    }

    // 4. Xử lý lệnh /bcn (Báo cáo ngày chưa nộp)
    if (text === '/bcn') {
      // Sinh danh sách 5 ngày làm việc gần nhất (bỏ Thứ 7, Chủ Nhật)
      const dates: { ymd: string; label: string }[] = []
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      let count = 0
      for (let i = 1; count < 5 && i <= 15; i++) {
        const d = new Date(today.getTime() - i * 86400000)
        const dayOfWeek = d.getDay()
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          dates.push({
            ymd: d.toISOString().split('T')[0],
            label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
          })
          count++
        }
      }

      const replyMarkup = {
        inline_keyboard: dates.map(d => [
          {
            text: `Ngày ${d.label}`,
            callback_data: `bcn_${d.ymd}`,
          },
        ]),
      }

      await sendTelegramMessage(
        chatId,
        '📋 <b>Báo cáo ngày chưa nộp</b>\nChọn ngày bạn muốn kiểm tra dưới đây:',
        replyMarkup
      )
      return NextResponse.json({ ok: true })
    }

    // 4.1. Xử lý khi bấm nút inline chọn ngày (/bcn callback)
    if (isCallback && callbackData.startsWith('bcn_')) {
      const ymd = callbackData.replace('bcn_', '')
      const missing = await getMissingReports(ymd)

      const [year, month, day] = ymd.split('-')
      const dateLabel = `${day}/${month}/${year}`

      let replyText = `📋 <b>TÌNH TRẠNG BÁO CÁO NGÀY ${dateLabel}</b>\n\n`
      if (missing.length === 0) {
        replyText += '✅ Tất cả KTV hoạt động đã nộp đủ báo cáo ngày này.'
      } else {
        replyText += 'Danh sách KTV chưa hoàn thành báo cáo:\n'
        missing.forEach((m, idx) => {
          replyText += `${idx + 1}. 👤 <b>${m.ktvName}</b>: ${m.missingDays.join(', ')}\n`
        })
      }

      // Trả lời callback query để tắt loading spinner trên Telegram
      await answerCallbackQuery(callbackQueryId)

      // Cập nhật lại tin nhắn cũ kèm theo bàn phím chọn ngày để user có thể bấm xem ngày khác
      if (messageId) {
        // Sinh lại 5 ngày để giữ bàn phím
        const dates: { ymd: string; label: string }[] = []
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        let count = 0
        for (let i = 1; count < 5 && i <= 15; i++) {
          const d = new Date(today.getTime() - i * 86400000)
          const dayOfWeek = d.getDay()
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            dates.push({
              ymd: d.toISOString().split('T')[0],
              label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
            })
            count++
          }
        }

        const replyMarkup = {
          inline_keyboard: dates.map(d => [
            {
              text: `Ngày ${d.label}`,
              callback_data: `bcn_${d.ymd}`,
            },
          ]),
        }

        await editTelegramMessageText(chatId, messageId, replyText, replyMarkup)
      }
      return NextResponse.json({ ok: true })
    }

    // 5. Xử lý lệnh /cv (Công việc tương lai - 7 ngày tới)
    if (text === '/cv') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today.getTime() + 86400000)
      const tomorrowStr = tomorrow.toISOString().split('T')[0]
      const next7DaysLimit = new Date(today.getTime() + 8 * 86400000)
      const next7DaysStr = next7DaysLimit.toISOString().split('T')[0]

      const { data: jobs, error: jobsError } = await supabaseAdmin
        .from('soct_cong_viec')
        .select(`
          id, ngay, loai_cong_viec, report, ket_qua, ktv_id, ktv2_id,
          soct_users!ktv_id ( full_name ),
          ktv2:soct_users!ktv2_id ( full_name ),
          soct_khach_hang ( ten_khach_hang )
        `)
        .gte('ngay', tomorrowStr)
        .lte('ngay', next7DaysStr)
        .order('ngay', { ascending: true })

      if (jobsError) {
        console.error('Error fetching future jobs:', jobsError)
        await sendTelegramMessage(chatId, '❌ Có lỗi xảy ra khi lấy danh sách công việc tương lai.')
        return NextResponse.json({ ok: true })
      }

      if (!jobs || jobs.length === 0) {
        await sendTelegramMessage(chatId, '📅 Không có công việc nào được lên lịch trong 7 ngày tới.')
        return NextResponse.json({ ok: true })
      }

      // Nhóm công việc theo ngày
      const grouped: Record<string, any[]> = {}
      jobs.forEach(job => {
        const date = job.ngay
        if (!grouped[date]) grouped[date] = []
        grouped[date].push(job)
      })

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://techservice.app'
      let replyText = `📅 <b>KẾ HOẠCH CÔNG VIỆC TƯƠNG LAI (7 ngày tới)</b>\n\n`

      const sortedDates = Object.keys(grouped).sort()

      for (const date of sortedDates) {
        const dateJobs = grouped[date]
        const dateObj = new Date(date)
        const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
        const dayName = dayNames[dateObj.getDay()]
        const [year, month, day] = date.split('-')
        const dateLabel = `${day}/${month}/${year}`

        replyText += `🗓 <b>${dayName} (${dateLabel}) — ${dateJobs.length} việc:</b>\n`

        // Nhóm chi tiết theo KTV phụ trách trong ngày đó
        const ktvSummary: Record<string, { count: number; types: Record<string, number> }> = {}
        let unassignedCount = 0

        dateJobs.forEach(job => {
          const ktv1 = job.soct_users?.full_name
          const ktv2 = job.ktv2?.full_name
          const type = job.loai_cong_viec || 'Khác'

          const addJobToKtv = (name: string, suffix = '') => {
            const key = `${name}${suffix}`
            if (!ktvSummary[key]) {
              ktvSummary[key] = { count: 0, types: {} }
            }
            ktvSummary[key].count++
            ktvSummary[key].types[type] = (ktvSummary[key].types[type] || 0) + 1
          }

          if (ktv1 && ktv2) {
            addJobToKtv(ktv1)
            addJobToKtv(ktv2, ' (kèm)')
          } else if (ktv1) {
            addJobToKtv(ktv1)
          } else if (ktv2) {
            addJobToKtv(ktv2, ' (kèm)')
          } else {
            unassignedCount++
          }
        })

        Object.entries(ktvSummary).forEach(([ktvName, info]) => {
          const typeStrings = Object.entries(info.types).map(([t, c]) => `${c} ${t}`)
          replyText += `  • 👤 <b>${ktvName}</b>: ${info.count} việc (${typeStrings.join(', ')})\n`
        })

        if (unassignedCount > 0) {
          replyText += `  • 📥 <b>Chờ nhận (Pool)</b>: ${unassignedCount} việc\n`
        }
        replyText += `\n`
      }

      replyText += `👉 <a href="${appUrl}/ktv">Mở App KTV để xem chi tiết</a>`
      await sendTelegramMessage(chatId, replyText)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error handling Telegram webhook:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}