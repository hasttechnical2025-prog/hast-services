import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { sendTelegramMessage } from '@/lib/telegram'
import { isBaoTri, getCauHinh } from '@/lib/config'

export const runtime = 'nodejs'

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const H = 3600 * 1000

// Giờ VN (UTC+7) hiện tại -> phút kể từ 00:00, để giới hạn khung giờ nhắc.
function vnNowMinutes(): number {
  const vn = new Date(Date.now() + 7 * H)
  return vn.getUTCHours() * 60 + vn.getUTCMinutes()
}
function vnHHMM(iso: string): string {
  const vn = new Date(new Date(iso).getTime() + 7 * H)
  return `${String(vn.getUTCHours()).padStart(2, '0')}:${String(vn.getUTCMinutes()).padStart(2, '0')}`
}

// Nhắc KTV cập nhật trạng thái công việc qua Telegram (DM). Chạy định kỳ (Vercel Cron mỗi giờ).
//  - 'Đã nhận' quá lâu chưa bấm Đang làm  -> nhắc bắt đầu.
//  - 'Đang làm' quá lâu chưa Hoàn thành    -> nhắc hoàn thành.
// Chống spam: chỉ nhắc lại sau `nhac_lap_lai_gio`; chỉ trong khung giờ làm việc.
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const secret = process.env.CRON_SECRET
    if (secret && authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (await isBaoTri()) return NextResponse.json({ message: 'Đang bảo trì — bỏ qua' })

    // Khung giờ nhắc 7:30–21:00 (giờ VN). Cron chạy mỗi giờ nhưng ngoài khung thì bỏ qua.
    const mins = vnNowMinutes()
    if (mins < 7 * 60 + 30 || mins > 21 * 60) {
      return NextResponse.json({ message: 'Ngoài khung giờ nhắc (7:30–21:00)' })
    }

    const cfg = await getCauHinh()
    const gioDaNhan = parseFloat(cfg.nhac_da_nhan_gio || '2') || 2      // 'Đã nhận' quá X giờ
    const gioDangLam = parseFloat(cfg.nhac_dang_lam_gio || '4') || 4    // 'Đang làm' quá Y giờ
    const gioLapLai = parseFloat(cfg.nhac_lap_lai_gio || '2') || 2      // khoảng nhắc lại tối thiểu
    const now = Date.now()

    // Lấy các việc đang treo (Đã nhận / Đang làm) có KTV phụ trách.
    const jobs = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_cong_viec')
      .select('id, ma_may, ket_qua, report, nhan_luc, bat_dau_luc, nhac_luc, ktv_id, soct_users!ktv_id ( full_name, telegram_id ), soct_khach_hang ( ten_khach_hang )')
      .in('ket_qua', ['Đã nhận', 'Đang làm'])
      .not('ktv_id', 'is', null)
      .range(from, to))

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://hast-services.vercel.app') + '/ktv'
    const nudgedIds: string[] = []
    let sent = 0

    for (const j of jobs || []) {
      const tg = j.soct_users?.telegram_id
      if (!tg) continue // KTV chưa liên kết Telegram -> không nhắc được
      // Chống spam: đã nhắc gần đây thì bỏ qua
      if (j.nhac_luc && now - new Date(j.nhac_luc).getTime() < gioLapLai * H) continue

      const kh = j.soct_khach_hang?.ten_khach_hang || j.ma_may || j.report || 'việc'
      let msg: string | null = null

      if (j.ket_qua === 'Đã nhận' && j.nhan_luc && now - new Date(j.nhan_luc).getTime() >= gioDaNhan * H) {
        msg = [
          '⏰ <b>NHẮC CẬP NHẬT CÔNG VIỆC</b>',
          `Bạn đã nhận việc <b>${esc(kh)}</b> lúc ${vnHHMM(j.nhan_luc)} nhưng chưa bấm "Đang làm".`,
          `Khi tới nơi, mở app bấm <b>Đang làm</b> để văn phòng nắm được tiến độ.`,
          `\n👉 <a href="${appUrl}">Mở App KTV</a>`,
        ].join('\n')
      } else if (j.ket_qua === 'Đang làm' && j.bat_dau_luc && now - new Date(j.bat_dau_luc).getTime() >= gioDangLam * H) {
        const gio = Math.floor((now - new Date(j.bat_dau_luc).getTime()) / H)
        msg = [
          '⏰ <b>NHẮC CẬP NHẬT CÔNG VIỆC</b>',
          `Việc <b>${esc(kh)}</b> bạn đang làm đã khoảng ${gio} giờ.`,
          `Nếu đã xong, mở app bấm <b>Hoàn thành</b>.`,
          `\n👉 <a href="${appUrl}">Mở App KTV</a>`,
        ].join('\n')
      }

      if (msg) {
        const r = await sendTelegramMessage(tg, msg)
        if (r.success) { sent++; nudgedIds.push(j.id) }
      }
    }

    // Đóng dấu đã nhắc (để không spam ở lần cron kế tiếp)
    if (nudgedIds.length > 0) {
      await supabaseAdmin.from('soct_cong_viec').update({ nhac_luc: new Date().toISOString() }).in('id', nudgedIds)
    }

    return NextResponse.json({ success: true, sent })
  } catch (error: any) {
    console.error('Error in cron nhac-trang-thai:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
