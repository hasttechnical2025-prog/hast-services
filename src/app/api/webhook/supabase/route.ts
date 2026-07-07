import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendTelegramMessage } from '@/lib/telegram'

// Escape HTML để dữ liệu người dùng không phá parse_mode='HTML' của Telegram
function esc(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function fmtDate(s: any): string {
  if (!s) return ''
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// Xây nội dung tin nhắn cho một công việc
function buildJobMessage(
  heading: string,
  record: any,
  khachHang: { ten_khach_hang?: string; dia_chi?: string } | null,
  appUrl: string,
  extraLine?: string
) {
  const lines: (string | null)[] = [
    heading,
    extraLine ?? null,
    `🗓 <b>Ngày thực hiện:</b> ${fmtDate(record.ngay)}`,
    `📌 <b>Loại công việc:</b> ${esc(record.loai_cong_viec)}`,
    `🏢 <b>Khách hàng:</b> ${esc(khachHang?.ten_khach_hang || 'Không rõ')}`,
    `📍 <b>Địa chỉ:</b> ${esc(khachHang?.dia_chi || 'Không rõ')}`,
    `🖨 <b>Mã máy:</b> ${esc(record.ma_may || 'N/A')}`,
    `📝 <b>Ghi chú:</b> ${esc(record.ghi_chu || 'Không')}`,
    '',
    `👉 <a href="${appUrl}/ktv">Mở App KTV</a>`,
    '',
    '<b>HAST — Sổ công tác</b>',
    'Hệ thống quản lý giao việc tự động',
  ]
  return lines.filter(l => l !== null).join('\n')
}

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
    const { type, table, record, old_record } = payload

    if (table !== 'soct_cong_viec' || !record) {
      return NextResponse.json({ message: 'Ignored' })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase credentials for Supabase webhook')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://techservice.app'
    const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID

    const ktvId = record.ktv_id

    // Chỉ báo cho việc mới giao: 'Chờ nhận' (vào pool) hoặc 'Đã nhận' (gán KTV lúc tạo).
    // Việc đã Đang làm/Hoàn thành/Lắp tiếp (VD import lịch sử) -> KHÔNG bắn, tránh spam.
    if (record.ket_qua && !['Chờ nhận', 'Đã nhận'].includes(record.ket_qua)) {
      return NextResponse.json({ message: 'Not a new job, skip notify' })
    }

    // 3. Xác định loại thông báo cần gửi
    // - INSERT + đã gán KTV  -> nhắn riêng KTV đó
    // - INSERT + chưa gán    -> bắn vào group chung (pool chờ nhận)
    // - UPDATE + ktv_id đổi sang người mới -> nhắn riêng người mới (gán/nhận việc)
    let target: 'dm' | 'group' | null = null

    if (type === 'INSERT') {
      target = ktvId ? 'dm' : 'group'
    } else if (type === 'UPDATE') {
      if (ktvId && ktvId !== old_record?.ktv_id) {
        target = 'dm'
      }
    }

    if (!target) {
      return NextResponse.json({ message: 'No notification needed' })
    }

    // 4. Lấy thông tin khách hàng
    const { data: khachHang } = await supabaseAdmin
      .from('soct_khach_hang')
      .select('ten_khach_hang, dia_chi')
      .eq('id', record.id_khach_hang)
      .single()

    // 5a. Gửi tin nhắn riêng cho KTV được gán/đã nhận
    if (target === 'dm') {
      const { data: user } = await supabaseAdmin
        .from('soct_users')
        .select('telegram_id, full_name')
        .eq('id', ktvId)
        .single()

      if (user?.telegram_id) {
        const msg = buildJobMessage(
          '🔔 <b>CÔNG VIỆC ĐƯỢC GIAO</b>',
          record,
          khachHang,
          appUrl,
          `Xin chào ${esc(user.full_name)}, bạn có một công việc!`
        )
        await sendTelegramMessage(user.telegram_id, msg)
      }
      return NextResponse.json({ success: true, sent: 'dm' })
    }

    // 5b. Bắn vào group chung: việc mới chưa gán, KTV nào rảnh vào nhận
    if (target === 'group') {
      if (!groupChatId) {
        console.error('Missing TELEGRAM_GROUP_CHAT_ID for group notification')
        return NextResponse.json({ message: 'Group chat id not configured' })
      }
      const msg = buildJobMessage(
        '🆕 <b>CÔNG VIỆC MỚI — CHỜ NHẬN</b>',
        record,
        khachHang,
        appUrl
      )
      await sendTelegramMessage(groupChatId, msg)
      return NextResponse.json({ success: true, sent: 'group' })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error processing Supabase webhook:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
