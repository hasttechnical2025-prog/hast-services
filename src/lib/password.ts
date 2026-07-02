import crypto from 'crypto'

// Băm mật khẩu bằng scrypt có salt ngẫu nhiên, định dạng lưu: "scrypt:<salt>:<hash>".
// Hash SHA-256 cũ (64 ký tự hex, không prefix) vẫn xác thực được và sẽ được
// nâng cấp lên scrypt ngay lần đăng nhập thành công tiếp theo (needsUpgrade).

const SCRYPT_PREFIX = 'scrypt'
const KEY_LENGTH = 64

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex')
  return `${SCRYPT_PREFIX}:${salt}:${hash}`
}

export function verifyPassword(
  password: string,
  stored: string | null | undefined
): { valid: boolean; needsUpgrade: boolean } {
  if (!stored) return { valid: false, needsUpgrade: false }

  if (stored.startsWith(`${SCRYPT_PREFIX}:`)) {
    const [, salt, hash] = stored.split(':')
    if (!salt || !hash) return { valid: false, needsUpgrade: false }
    const candidate = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex')
    const candidateBuf = Buffer.from(candidate)
    const hashBuf = Buffer.from(hash)
    const valid = candidateBuf.length === hashBuf.length && crypto.timingSafeEqual(candidateBuf, hashBuf)
    return { valid, needsUpgrade: false }
  }

  // Hash SHA-256 legacy (không salt)
  const legacy = crypto.createHash('sha256').update(password).digest('hex')
  const legacyBuf = Buffer.from(legacy)
  const storedBuf = Buffer.from(stored)
  const valid = legacyBuf.length === storedBuf.length && crypto.timingSafeEqual(legacyBuf, storedBuf)
  return { valid, needsUpgrade: valid }
}
