import { supabaseAdmin } from '@/lib/supabase-admin'

// Rate-limit đăng nhập (chống brute-force). Đếm lần SAI trong CỬA SỔ; vượt ngưỡng -> chặn.
// FAIL-OPEN: mọi lỗi (chưa chạy mig 103, DB trục trặc...) -> KHÔNG chặn, để không khóa nhầm
// người dùng thật. Lớp này chỉ làm KHÓ brute-force, không phải khóa cứng.

const WINDOW_MIN = 15
const USER_LIMIT = 8    // tối đa lần SAI / 1 username / 15 phút (chống dò mật khẩu 1 tài khoản)
const IP_LIMIT = 50     // backstop / 1 IP / 15 phút (văn phòng NAT dùng chung IP nên nới rộng)

export const RATE_LIMIT_MSG = 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.'

/** IP client (Vercel đặt ở x-forwarded-for). */
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for') || ''
  return xff.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown'
}

/** true nếu nên CHẶN (đã vượt ngưỡng lần SAI trong cửa sổ). Fail-open khi lỗi. */
export async function isLoginBlocked(ip: string, username: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString()
    // Dọn rác best-effort: xóa dòng cũ > 1 giờ để bảng luôn nhỏ (Supabase Free).
    supabaseAdmin.from('soct_login_attempts').delete()
      .lt('tao_luc', new Date(Date.now() - 3_600_000).toISOString())
      .then(() => {}, () => {})
    const [u, i] = await Promise.all([
      supabaseAdmin.from('soct_login_attempts').select('*', { count: 'exact', head: true })
        .eq('thanh_cong', false).eq('username', username).gte('tao_luc', since),
      supabaseAdmin.from('soct_login_attempts').select('*', { count: 'exact', head: true })
        .eq('thanh_cong', false).eq('ip', ip).gte('tao_luc', since),
    ])
    if (u.error || i.error) return false // bảng chưa có / lỗi -> fail-open
    return (u.count || 0) >= USER_LIMIT || (i.count || 0) >= IP_LIMIT
  } catch {
    return false
  }
}

/** Ghi 1 lần thử. ok=true (đúng mật khẩu) sẽ XÓA các lần SAI trước của username (reset). */
export async function recordLoginAttempt(ip: string, username: string, ok: boolean): Promise<void> {
  try {
    await supabaseAdmin.from('soct_login_attempts')
      .insert({ ip, username: String(username || '').slice(0, 100), thanh_cong: ok })
    if (ok) {
      await supabaseAdmin.from('soct_login_attempts').delete()
        .eq('username', username).eq('thanh_cong', false)
    }
  } catch { /* best-effort, không chặn luồng đăng nhập */ }
}
