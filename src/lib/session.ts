import crypto from 'crypto'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCauHinh } from '@/lib/config'
import { roleCanTab } from '@/lib/tabs'

// Phiên đăng nhập dùng cookie httpOnly có ký HMAC-SHA256.
// Token dạng: base64url(payload).signature — client không thể tự sửa role.

export type Role = 'admin' | 'tech_admin' | 'staff' | 'ktv'

export type SessionUser = {
  id: string
  full_name: string
  role: Role
}

type SessionPayload = SessionUser & { exp: number }

const COOKIE_NAME = 'soct_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7 ngày

function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    throw new Error('Thiếu biến môi trường SESSION_SECRET')
  }
  return secret
}

function sign(data: string): string {
  return crypto.createHmac('sha256', getSecret()).update(data).digest('base64url')
}

export function createSessionToken(user: SessionUser, maxAgeSeconds: number = MAX_AGE_SECONDS): string {
  const payload: SessionPayload = { ...user, exp: Date.now() + maxAgeSeconds * 1000 }
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${data}.${sign(data)}`
}

export function verifySessionToken(token: string): SessionPayload | null {
  const [data, sig] = token.split('.')
  if (!data || !sig) return null

  const expected = sign(data)
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expected)
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as SessionPayload
    if (!payload.exp || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

// maxAgeSeconds mặc định 7 ngày; KTV đăng nhập bằng QR dùng phiên dài hạn.
export async function setSessionCookie(user: SessionUser, maxAgeSeconds: number = MAX_AGE_SECONDS): Promise<void> {
  const store = await cookies()
  store.set(COOKIE_NAME, createSessionToken(user, maxAgeSeconds), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySessionToken(token)
}

// Thời hạn phiên dài hạn cho KTV đăng nhập bằng QR (~10 năm = gần như vĩnh viễn).
// Thu hồi bằng cột is_active hoặc tạo lại login_token, không phụ thuộc hết hạn cookie.
export const KTV_LONG_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 10

// Trả về session nếu đã đăng nhập, đúng role yêu cầu, VÀ user trong DB còn tồn tại,
// đúng role, đang hoạt động (is_active). Không truyền role nào = chỉ cần đã đăng nhập.
// Đọc lại DB mỗi lần để tắt is_active là chặn được ngay cả khi gọi API trực tiếp.
export async function requireRole(...roles: Role[]): Promise<SessionPayload | null> {
  const session = await getSession()
  if (!session) return null
  if (roles.length > 0 && !roles.includes(session.role)) return null

  const { data } = await supabaseAdmin
    .from('soct_users')
    .select('role, is_active')
    .eq('id', session.id)
    .single()

  if (!data || data.role !== session.role || data.is_active === false) return null

  return session
}

// Yêu cầu đăng nhập (văn phòng) VÀ role đó được phép xem tab theo ma trận phân quyền
// (Cài đặt hệ thống). Admin luôn qua. Trả về session nếu hợp lệ, ngược lại null.
// Nhờ vậy khi admin bật/tắt tab cho role, quyền API tự đổi theo — không cần sửa code.
export async function requireTab(tabKey: string, subKey?: string): Promise<SessionPayload | null> {
  const session = await requireRole('admin', 'tech_admin', 'staff')
  if (!session) return null
  if (session.role === 'admin') return session
  const cfg = await getCauHinh()
  return roleCanTab(session.role, tabKey, cfg.tab_visibility, subKey) ? session : null
}
