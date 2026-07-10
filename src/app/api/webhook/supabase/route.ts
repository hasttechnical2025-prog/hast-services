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
  extraLine?: string,
  creatorName?: string,
  assigneeText?: string,
) {
  const lines: (string | null)[] = [
    heading,
    extraLine ?? null,
    assigneeText ?? null,
    `🗓 <b>Ngày thực hiện:</b> ${fmtDate(record.ngay)}`,
    `📌 <b>Loại công việc:</b> ${esc(record.loai_cong_viec)}`,
    `🏢 <b>Khách hàng:</b> ${esc(khachHang?.ten_khach_hang || 'Không rõ')}`,
    `📍 <b>Địa chỉ:</b> ${esc(khachHang?.dia_chi || 'Không rõ')}`,
    `🖨 <b>Mã máy:</b> ${esc(record.ma_may || 'N/A')}`,
    `📝 <b>Ghi chú:</b> ${esc(record.ghi_chu || 'Không')}`,
    creatorName ? `👤 <b>Người tạo phiếu:</b> ${esc(creatorName)}` : null,
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

    // Nếu record có cờ telegram_sent = true -> API tạo phiếu đã tự bắn Telegram tổng hợp rồi
    // Webhook không cần bắn từng tin lẻ tẻ nữa để tránh spam
    if (record.telegram_sent === true) {
      return NextResponse.json({ message: 'Telegram already handled by external API, ignore Webhook' })
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
    const ktv2Id = record.ktv2_id

    // Chỉ báo cho việc mới giao: 'Chờ nhận' (vào pool) hoặc 'Đã nhận' (gán KTV lúc tạo).
    // Việc đã Đang làm/Hoàn thành/Lắp tiếp (VD import lịch sử) -> KHÔNG bắn, tránh spam.
    if (record.ket_qua && !['Chờ nhận', 'Đã nhận'].includes(record.ket_qua)) {
      return NextResponse.json({ message: 'Not a new job, skip notify' })
    }

    // 3. Xác định loại thông báo cần gửi
    let sendToGroup = false
    let sendDmToKtv1 = false
    let sendDmToKtv2 = false

    if (type === 'INSERT') {
      if (!ktvId) sendToGroup = true
      if (ktvId) sendDmToKtv1 = true
      if (ktv2Id) sendDmToKtv2 = true
    } else if (type === 'UPDATE') {
      if (ktvId && ktvId !== old_record?.ktv_id) sendDmToKtv1 = true
      if (ktv2Id && ktv2Id !== old_record?.ktv2_id) sendDmToKtv2 = true
    }

    if (!sendToGroup && !sendDmToKtv1 && !sendDmToKtv2) {
      return NextResponse.json({ message: 'No notification needed' })
    }

    // 4. Lấy thông tin phụ (Khách hàng, Người tạo, Tên KTV)
    const { data: khachHang } = await supabaseAdmin
      .from('soct_khach_hang')
      .select('ten_khach_hang, dia_chi')
      .eq('id', record.id_khach_hang)
      .single()

    let creatorName = ''
    if (record.created_by) {
      const { data: creator } = await supabaseAdmin.from('soct_users').select('full_name').eq('id', record.created_by).single()
      creatorName = creator?.full_name || ''
    }

    let ktv1Name = '', ktv1Tg = ''
    if (ktvId) {
      const { data: u1 } = await supabaseAdmin.from('soct_users').select('full_name, telegram_id').eq('id', ktvId).single()
      if (u1) { ktv1Name = u1.full_name; ktv1Tg = u1.telegram_id || '' }
    }

    let ktv2Name = '', ktv2Tg = ''
    if (ktv2Id) {
      const { data: u2 } = await supabaseAdmin.from('soct_users').select('full_name, telegram_id').eq('id', ktv2Id).single()
      if (u2) { ktv2Name = u2.full_name; ktv2Tg = u2.telegram_id || '' }
    }

    let assigneeText = ''
    if (ktv1Name && ktv2Name) assigneeText = `👥 <b>Phân công:</b> ${esc(ktv1Name)} (chính), ${esc(ktv2Name)} (kèm)`
    else if (ktv1Name) assigneeText = `👤 <b>Phân công:</b> ${esc(ktv1Name)}`
    else if (ktv2Name) assigneeText = `👤 <b>Phân công:</b> ${esc(ktv2Name)} (kèm)`

    // 5. Bắn thông báo
    // Gửi DM cho KTV 1
    if (sendDmToKtv1 && ktv1Tg) {
      const msg = buildJobMessage(
        '🔔 <b>CÔNG VIỆC ĐƯỢC GIAO</b>',
        record, khachHang, appUrl,
        `Xin chào ${esc(ktv1Name)}, bạn có một công việc!`,
        creatorName, assigneeText
      )
      await sendTelegramMessage(ktv1Tg, msg)
    }

    // Gửi DM cho KTV 2
    if (sendDmToKtv2 && ktv2Tg) {
      const msg = buildJobMessage(
        '🔔 <b>CÔNG VIỆC ĐI KÈM ĐƯỢC GIAO</b>',
        record, khachHang, appUrl,
        `Xin chào ${esc(ktv2Name)}, bạn được gán làm KTV kèm cho một công việc!`,
        creatorName, assigneeText
      )
      await sendTelegramMessage(ktv2Tg, msg)
    }

    // Gửi Group chung
    if (sendToGroup && groupChatId) {
      const msg = buildJobMessage(
        '🆕 <b>CÔNG VIỆC MỚI — CHỜ NHẬN</b>',
        record, khachHang, appUrl,
        undefined, creatorName, assigneeText
      )
      await sendTelegramMessage(groupChatId, msg)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error processing Supabase webhook:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
