import webpush from 'web-push'
import { supabaseAdmin } from './supabase-admin'

// Cấu hình VAPID 1 lần (chỉ khi đã có env). Thiếu env -> gửi push thành no-op (không lỗi).
let configured = false
function ensureVapid(): boolean {
  if (configured) return true
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@hast.vn', pub, priv)
  configured = true
  return true
}

// Gửi Web Push tới MỌI đăng ký của user role 'kthc'. payload: {title, body, url}.
// Đăng ký hết hạn (404/410) -> tự xóa. Không ném lỗi ra ngoài (không chặn luồng chính).
export async function sendPushToKthc(title: string, body: string, url = '/admin'): Promise<number> {
  try {
    if (!ensureVapid()) return 0
    const { data: subs } = await supabaseAdmin
      .from('soct_push_sub')
      .select('endpoint, p256dh, auth, soct_users!inner ( role )')
      .eq('soct_users.role', 'kthc')
    if (!subs || subs.length === 0) return 0
    const payload = JSON.stringify({ title, body, url })
    let sent = 0
    await Promise.all(subs.map(async (s: any) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
        sent++
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await supabaseAdmin.from('soct_push_sub').delete().eq('endpoint', s.endpoint)
        }
      }
    }))
    return sent
  } catch (e) {
    console.error('sendPushToKthc error:', e)
    return 0
  }
}
