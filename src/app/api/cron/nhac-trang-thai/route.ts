import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { sendTelegramMessage } from '@/lib/telegram'
import { isBaoTri } from '@/lib/config'
import { logCronRun } from '@/lib/cron-log'

export const runtime = 'nodejs'

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const H = 3600 * 1000

// Giờ VN (UTC+7) hiện tại -> phút kể từ 00:00, để giới hạn khung giờ nhắc.
function vnNowMinutes(): number {
  const vn = new Date(Date.now() + 7 * H)
  return vn.getUTCHours() * 60 + vn.getUTCMinutes()
}
// Nhắc KTV cập nhật trạng thái công việc qua Telegram — kiểu DIGEST (gộp), KHÔNG réo từng việc.
// "Số hóa trọn vẹn": mỗi KTV nhận 1 tin GỘP liệt kê mọi việc chưa cập nhật, vào 2 "giờ vàng"
// 20h & 21h (VN). KHÔNG escalation người-nhắc-người. Tin 21h tự tính lại -> ai đã cập nhật sau 20h
// thì tin 21h ngắn đi/không gửi. Việc NGÀY TƯƠNG LAI (chưa tới ngày làm) không đưa vào.
const GIO_VANG = [20, 21] // giờ VN gửi digest

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const secret = process.env.CRON_SECRET
    if (secret && authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (await isBaoTri()) {
      await logCronRun('nhac-trang-thai', 'skipped', 'cron', { reason: 'Bảo trì' })
      return NextResponse.json({ message: 'Đang bảo trì — bỏ qua' })
    }

    // Chỉ gửi vào giờ vàng (VN). Cron chạy đúng 20h/21h nhưng vẫn chốt lại phòng lệch lịch.
    const vnHour = Math.floor(vnNowMinutes() / 60)
    if (!GIO_VANG.includes(vnHour)) {
      await logCronRun('nhac-trang-thai', 'skipped', 'cron', { reason: 'Ngoài giờ vàng (20h/21h)', vnHour })
      return NextResponse.json({ message: 'Ngoài giờ vàng digest (20h/21h)' })
    }

    const now = Date.now()
    const vnToday = new Date(now + 7 * H).toISOString().slice(0, 10) // ngày VN hôm nay (YYYY-MM-DD)

    // Việc còn treo (Đã nhận / Đang làm) có KTV phụ trách, NGÀY <= hôm nay (bỏ việc ngày tương lai).
    const jobs = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_cong_viec')
      .select('id, ngay, ma_may, ket_qua, report, nhan_luc, bat_dau_luc, ktv_id, soct_users!ktv_id ( full_name, telegram_id ), soct_khach_hang ( ten_khach_hang )')
      .in('ket_qua', ['Đã nhận', 'Đang làm'])
      .not('ktv_id', 'is', null)
      .lte('ngay', vnToday)
      .range(from, to))

    // Gom việc theo KTV (chỉ KTV đã liên kết Telegram).
    const byKtv = new Map<string, { tg: string; ten: string; daNhan: any[]; dangLam: any[] }>()
    for (const j of jobs || []) {
      const tg = j.soct_users?.telegram_id
      if (!tg) continue
      let g = byKtv.get(j.ktv_id)
      if (!g) { g = { tg, ten: j.soct_users?.full_name || '', daNhan: [], dangLam: [] }; byKtv.set(j.ktv_id, g) }
      const kh = j.soct_khach_hang?.ten_khach_hang || j.ma_may || j.report || 'việc'
      if (j.ket_qua === 'Đang làm') g.dangLam.push(kh); else g.daNhan.push(kh)
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://services.hasttech.app') + '/ktv'
    let sent = 0
    for (const g of byKtv.values()) {
      const tong = g.daNhan.length + g.dangLam.length
      if (tong === 0) continue
      const bullets: string[] = []
      for (const kh of g.dangLam) bullets.push(`• <b>${esc(kh)}</b> — đang làm, bấm <b>Hoàn thành</b> nếu xong`)
      for (const kh of g.daNhan) bullets.push(`• <b>${esc(kh)}</b> — chưa bắt đầu, bấm <b>Đang làm</b> khi tới nơi`)
      const msg = [
        '🔔 <b>NHẮC CẬP NHẬT CÔNG VIỆC</b>',
        `Chào bạn, cuối ngày rồi — bạn còn <b>${tong} việc</b> chưa cập nhật trạng thái:`,
        bullets.join('\n'),
        `\nMở app cập nhật giúp văn phòng nắm tiến độ nhé.`,
        `👉 <a href="${appUrl}">Mở App KTV</a>`,
      ].join('\n')
      const r = await sendTelegramMessage(g.tg, msg)
      if (r.success) sent++
    }

    await logCronRun('nhac-trang-thai', 'ok', 'cron', { sent, ktv: byKtv.size, vnHour })
    return NextResponse.json({ success: true, sent })
  } catch (error: any) {
    console.error('Error in cron nhac-trang-thai:', error)
    await logCronRun('nhac-trang-thai', 'error', 'cron', { error: error?.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
