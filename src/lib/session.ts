import crypto from 'crypto'
import { cookies } from 'next/headers'

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

export function createSessionToken(user: SessionUser): string {
  const payload: SessionPayload = { ...user, exp: Date.now() + MAX_AGE_SECONDS * 1000 }
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

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const store = await cookies()
  store.set(COOKIE_NAME, createSessionToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
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

// Trả về session nếu đã đăng nhập và đúng một trong các role yêu cầu, ngược lại null.
// Không truyền role nào = chỉ cần đã đăng nhập.
export async function requireRole(...roles: Role[]): Promise<SessionPayload | null> {
  const session = await getSession()
  if (!session) return null
  if (roles.length > 0 && !roles.includes(session.role)) return null
  return session
}
