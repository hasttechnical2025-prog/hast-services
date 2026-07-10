import crypto from 'crypto'
import { cookies } from 'next/headers'

// Cấu hình Relying Party (RP) lấy từ host của request — chạy được cả localhost lẫn domain Vercel.
export function getRP(request: Request) {
  const host = request.headers.get('host') || 'localhost:3000'
  const rpID = host.split(':')[0]
  const isLocal = rpID === 'localhost' || rpID === '127.0.0.1'
  const origin = `${isLocal ? 'http' : 'https'}://${host}`
  return { rpID, origin, rpName: 'HAST — Sổ công tác' }
}

// Challenge WebAuthn cần được ghi nhớ giữa 2 bước (options -> verify).
// Lưu trong cookie httpOnly ngắn hạn (5 phút), có ký HMAC để chống sửa.
const CHAL_COOKIE = 'soct_wa_chal'
const CHAL_MAX_AGE = 300

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('Thiếu SESSION_SECRET')
  return s
}
function sign(v: string): string {
  return crypto.createHmac('sha256', secret()).update(v).digest('base64url')
}

export async function setChallenge(challenge: string): Promise<void> {
  const store = await cookies()
  store.set(CHAL_COOKIE, `${challenge}.${sign(challenge)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: CHAL_MAX_AGE,
  })
}

export async function getChallenge(): Promise<string | null> {
  const store = await cookies()
  const token = store.get(CHAL_COOKIE)?.value
  if (!token) return null
  const idx = token.lastIndexOf('.')
  if (idx < 0) return null
  const val = token.slice(0, idx)
  const sig = token.slice(idx + 1)
  const a = Buffer.from(sig)
  const b = Buffer.from(sign(val))
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  return val
}

export async function clearChallenge(): Promise<void> {
  const store = await cookies()
  store.delete(CHAL_COOKIE)
}
