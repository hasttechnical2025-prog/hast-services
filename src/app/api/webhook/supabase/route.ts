import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendTelegramMessage } from '@/lib/telegram'

export async function POST(request: Request) {
  try {
    // 1. Kiểm tra Webhook Secret để đảm bảo request đến từ Supabase của mình
    const authHeader = request.headers.get('Authorization')
    const webhookSecret = process.env.WEBHOOK_SECRET

    if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Parse payload từ Supabase Database Webhook
    const payload = await request.json()

    // Payload form: { type: 'INSERT'|'UPDATE', table: 'soct_cong_viec', record: {...}, old_record: {...} }
    const { type, table, record, old_record } = payload

    if (table !== 'soct_cong_viec') {
      return NextResponse.json({ message: 'Ignored, not cong_viec table' })
    }

    // 3. Logic xác định xem có cần báo tin cho KTV không
    let shouldNotify = false
    const ktvId = record.ktv_id

    if (!ktvId) {
      return NextResponse.json({ message: 'No KTV assigned' })
    }

    if (type === 'INSERT') {
      shouldNotify = true
    } else if (type === 'UPDATE') {
      // Báo tin nếu update ktv_id từ null -> có người, hoặc đổi sang người khác
      if (ktvId !== old_record?.ktv_id) {
        shouldNotify = true
      }
    }

    if (shouldNotify) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

      if (supabaseUrl && supabaseServiceKey) {
        // Khởi tạo Supabase client với Service Role Key để bỏ qua RLS khi truy vấn user
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

        // 4. Truy vấn lấy thông tin khách hàng và telegram_id của KTV
        const [userRes, khRes] = await Promise.all([
          supabaseAdmin.from('soct_users').select('telegram_id, full_name').eq('id', ktvId).single(),
          supabaseAdmin.from('soct_khach_hang').select('ten_khach_hang, dia_chi').eq('id', record.id_khach_hang).single()
        ])

        const user = userRes.data
        const khachHang = khRes.data

        if (user?.telegram_id) {
          // 5. Build nội dung tin nhắn Telegram
          const actionText = type === 'INSERT' ? '🆕 <b>CÔNG VIỆC MỚI</b>' : '🔄 <b>CÔNG VIỆC ĐƯỢC GIAO</b>'
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://techservice.app'

          const messageText = `
${actionText}
Xin chào ${user.full_name}, bạn vừa được giao một công việc!

📌 <b>Loại công việc:</b> ${record.loai_cong_viec}
Khách hàng: ${khachHang?.ten_khach_hang || 'Không rõ'}
Địa chỉ: ${khachHang?.dia_chi || 'Không rõ'}
Mã máy: ${record.ma_may || 'N/A'}
Ghi chú: ${record.ghi_chu || 'Không'}

👉 <a href="${appUrl}/ktv">Mở App KTV để nhận việc</a>
`
          // 6. Gửi tin nhắn
          await sendTelegramMessage(user.telegram_id, messageText)
        }
      } else {
        console.error('Missing Supabase credentials for Supabase webhook')
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error processing Supabase webhook:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
