// "BẢNG VIỆC HÔM NAY" trên nhóm Telegram — 1 tin/ngày, GHIM, sửa tại chỗ (im lặng) mỗi khi
// phiếu đổi. Sửa tin Telegram KHÔNG gửi thông báo -> cả team nắm việc mà gần như 0 buzz.
// Gọi fire-and-forget từ broadcastJobsChanged() (đã chạy ở mọi nơi phiếu đổi). Tự gated config +
// throttle per-instance. Không được làm hỏng/đọng luồng chính -> mọi lỗi nuốt gọn.
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCauHinh } from '@/lib/config'
import { sendTelegramMessage, editTelegramMessageText, pinChatMessage, unpinChatMessage } from '@/lib/telegram'

const BOARD_KEY = 'tele_board'          // JSON { ngay, message_id }
const BOARD_ENABLED_KEY = 'tele_board_bat'  // '1' bật / '0' tắt
const THROTTLE_MS = 4000

let lastRefreshAt = 0
let refreshing = false

function todayVN(): string {
  const d = new Date(Date.now() + 7 * 3600 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
function esc(s: any): string { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function dmy(ymd: string): string { const [y, m, d] = ymd.split('-'); return `${d}/${m}/${y}` }

// Dựng nội dung bảng từ việc hôm nay. Dòng: "<KTV> - <model> * <khách> (<loại việc>)".
async function buildBoardText(today: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('soct_cong_viec')
    .select('ket_qua, loai_cong_viec, nguon, ktv_id, soct_users!ktv_id ( full_name ), soct_khach_hang ( model, ten_khach_hang, soct_khach_cum ( ten_khach_hang ) )')
    .eq('ngay', today)
    .is('nguon', null)
    .order('created_at', { ascending: true })

  const chuaNhan: string[] = [], dangLam: string[] = [], hoanThanh: string[] = [], chuaHt: string[] = []
  for (const j of (data || []) as any[]) {
    const kh = j.soct_khach_hang
    const tenKh = kh?.soct_khach_cum?.ten_khach_hang || kh?.ten_khach_hang || 'Khách lẻ'
    const model = kh?.model || ''
    const ktv = j.soct_users?.full_name || ''
    const viec = j.loai_cong_viec || ''
    const line = `• ${ktv ? '<b>' + esc(ktv) + '</b> - ' : ''}${esc(model)}${model ? ' * ' : ''}${esc(tenKh)}${viec ? ` (${esc(viec)})` : ''}`
    const kq = j.ket_qua || 'Chờ nhận'
    if (kq === 'Chờ nhận') chuaNhan.push(line)
    else if (kq === 'Hoàn thành') hoanThanh.push(line)
    else if (kq === 'Chưa hoàn thành') chuaHt.push(line)
    else dangLam.push(line)  // Đã nhận / Đang làm
  }

  const sec = (icon: string, title: string, arr: string[]) => arr.length ? `\n${icon} <b>${title}</b> (${arr.length})\n${arr.join('\n')}\n` : ''
  const head = `📋 <b>BẢNG VIỆC HÔM NAY · ${dmy(today)}</b>\n`
  let txt = head + sec('⏳', 'Chưa nhận', chuaNhan) + sec('🔧', 'Đang làm', dangLam) + sec('✅', 'Hoàn thành', hoanThanh) + sec('⚠️', 'Chưa hoàn thành', chuaHt)
  if (chuaNhan.length + dangLam.length + hoanThanh.length + chuaHt.length === 0) txt += '\n<i>Chưa có việc nào hôm nay.</i>'
  // Giới hạn 4096: ngày quá đông thì gộp "Hoàn thành" thành số lượng.
  if (txt.length > 4000) {
    txt = head + sec('⏳', 'Chưa nhận', chuaNhan) + sec('🔧', 'Đang làm', dangLam) + `\n✅ <b>Hoàn thành:</b> ${hoanThanh.length} việc\n` + sec('⚠️', 'Chưa hoàn thành', chuaHt)
  }
  return txt.slice(0, 4096)
}

export async function refreshTeleBoard(): Promise<void> {
  const now = Date.now()
  if (refreshing || now - lastRefreshAt < THROTTLE_MS) return  // chống bão (bulk/cuốn ngày)
  refreshing = true
  try {
    const cfg = await getCauHinh()
    if ((cfg[BOARD_ENABLED_KEY] ?? '0') !== '1') return
    const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID
    if (!groupChatId) return

    const today = todayVN()
    const text = await buildBoardText(today)

    // Đọc state bảng TRỰC TIẾP (không qua cache getCauHinh) để message_id không bị cũ.
    const { data: bRow } = await supabaseAdmin.from('soct_cau_hinh').select('gia_tri').eq('khoa', BOARD_KEY).maybeSingle()
    let board: { ngay?: string; message_id?: number } = {}
    try { board = JSON.parse(bRow?.gia_tri || '{}') } catch { /* bỏ qua */ }

    // Cùng ngày + đã có tin -> SỬA tại chỗ (im lặng).
    if (board.ngay === today && board.message_id) {
      const ok = await editTelegramMessageText(groupChatId, board.message_id, text)
      if (ok) { lastRefreshAt = Date.now(); return }
      // Sửa lỗi (tin bị xóa?) -> rơi xuống tạo mới.
    }

    // Ngày mới / chưa có bảng -> gửi mới (im lặng) + ghim + bỏ ghim bảng cũ + lưu state.
    const res = await sendTelegramMessage(groupChatId, text, undefined, true)
    if (res.success && res.messageId) {
      await pinChatMessage(groupChatId, res.messageId, true)
      // Bỏ ghim bảng CŨ bất kể cùng ngày hay không (tránh đọng nhiều pin khi lỡ gửi lại).
      if (board.message_id && board.message_id !== res.messageId) await unpinChatMessage(groupChatId, board.message_id)
      await supabaseAdmin.from('soct_cau_hinh').upsert(
        { khoa: BOARD_KEY, gia_tri: JSON.stringify({ ngay: today, message_id: res.messageId }) },
        { onConflict: 'khoa' },
      )
    }
    lastRefreshAt = Date.now()
  } catch (e) {
    console.error('refreshTeleBoard failed:', e)
  } finally {
    refreshing = false
  }
}
