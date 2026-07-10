import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { broadcastJobsChanged } from '@/lib/realtime'
import { sendTelegramMessage } from '@/lib/telegram'
import { logAudit } from '@/lib/audit'

// Escape HTML để dữ liệu người dùng không phá parse_mode='HTML' của Telegram
function esc(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// POST: Tạo hàng loạt phiếu bảo trì từ danh sách mã máy quét được
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const { ktv_id, ma_mays } = await request.json()
    if (!ktv_id || !Array.isArray(ma_mays) || ma_mays.length === 0) {
      return NextResponse.json({ error: 'Thiếu KTV hoặc danh sách mã máy' }, { status: 400 })
    }

    // 1. Lấy thông tin KTV
    const { data: ktv } = await supabaseAdmin
      .from('soct_users')
      .select('full_name, telegram_id')
      .eq('id', ktv_id)
      .single()

    if (!ktv) {
      return NextResponse.json({ error: 'Không tìm thấy KTV phụ trách' }, { status: 404 })
    }

    // 2. Tải toàn bộ danh sách khách hàng để VLookup mã máy
    const { data: customers, error: custErr } = await supabaseAdmin
      .from('soct_khach_hang')
      .select('id, ma_may, ten_khach_hang, dia_chi, km_mac_dinh')

    if (custErr) throw custErr

    const custByMaMay = new Map(
      (customers || [])
        .filter(c => c.ma_may)
        .map(c => [String(c.ma_may).trim().toLowerCase(), c])
    )

    // 3. Chuẩn bị dữ liệu phiếu giao việc hàng loạt
    const ngayHomNay = new Date().toISOString().split('T')[0]
    const jobRows: any[] = []
    const messageDetails: string[] = [] // lưu thông tin khách hàng để bắn Telegram

    ma_mays.forEach((ma, idx) => {
      const cleanMa = String(ma).trim()
      const cust = custByMaMay.get(cleanMa.toLowerCase())

      if (cust) {
        jobRows.push({
          ngay: ngayHomNay,
          ma_may: cleanMa,
          id_khach_hang: cust.id,
          loai_cong_viec: 'Bảo trì',
          km: cust.km_mac_dinh || 0,
          so_luong: 1,
          ktv_id: ktv_id,
          ket_qua: 'Đã nhận',
          trang_thai_hd: 'Chưa hóa đơn',
          created_by: session.id,
          telegram_sent: true // Đánh dấu đã gửi Telegram tổng hợp, webhook DB sẽ bỏ qua
        })
        messageDetails.push(`• <b>${cleanMa}</b> — ${esc(cust.ten_khach_hang)} (${esc(cust.dia_chi)})`)
      } else {
        // Ghi log cảnh báo nếu mã máy chưa có khách, nhưng vẫn gán tạm
        console.warn(`Mã máy ${cleanMa} quét được nhưng không khớp khách hàng.`)
      }
    })

    if (jobRows.length === 0) {
      return NextResponse.json({ error: 'Không có mã máy nào khớp thông tin khách hàng trong hệ thống.' }, { status: 400 })
    }

    // 4. Thực hiện insert hàng loạt vào DB
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('soct_cong_viec')
      .insert(jobRows)
      .select('id')

    if (insErr) throw insErr

    // 5. Bắn 1 tin nhắn Telegram duy nhất thông báo giao việc hàng loạt cho KTV
    const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://techservice.app'

    if (groupChatId) {
      let msg = `🔔 <b>CÔNG VIỆC BẢO TRÌ ĐƯỢC GIAO HÀNG LOẠT</b>\n`
      msg += `KTV phụ trách: <b>${esc(ktv.full_name)}</b>\n`
      msg += `Người giao: ${esc(session.full_name)}\n`
      msg += `Tổng số lượng: <b>${jobRows.length} máy</b>\n`
      msg += `========================\n`
      msg += messageDetails.slice(0, 15).join('\n') // show tối đa 15 dòng đầu
      if (messageDetails.length > 15) {
        msg += `\n... và ${messageDetails.length - 15} máy khác.`
      }
      msg += `\n\n👉 <a href="${appUrl}/ktv">Mở App KTV để xem chi tiết</a>`

      await sendTelegramMessage(groupChatId, msg)
    }

    // Gửi tin nhắn DM riêng cho KTV đó (nếu đã liên kết bot)
    if (ktv.telegram_id) {
      let msg = `🔔 <b>CÔNG VIỆC BẢO TRÌ GIAO HÀNG LOẠT</b>\n`
      msg += `Xin chào ${esc(ktv.full_name)}, bạn được giao <b>${jobRows.length} ca bảo trì</b> ngày hôm nay:\n\n`
      msg += messageDetails.slice(0, 10).join('\n')
      if (messageDetails.length > 10) {
        msg += `\n... và ${messageDetails.length - 10} máy khác.`
      }
      msg += `\n\n👉 <a href="${appUrl}/ktv">Mở App KTV để làm báo cáo</a>`

      await sendTelegramMessage(ktv.telegram_id, msg)
    }

    await broadcastJobsChanged()
    await logAudit(session, 'Giao việc bảo trì hàng loạt (QR Scan)', `Giao ${jobRows.length} máy cho KTV ${ktv.full_name}`)

    return NextResponse.json({ success: true, count: jobRows.length })
  } catch (error: any) {
    console.error('Error batch creating maintenance jobs:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
