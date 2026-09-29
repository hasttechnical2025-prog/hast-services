import crypto from 'crypto'

// Đọc Google Sheet bằng Service Account — tự ký JWT (RS256) đổi lấy access_token, KHÔNG cần thư viện.
// Cần env: GOOGLE_SA_EMAIL, GOOGLE_SA_PRIVATE_KEY (khoá riêng service account; giữ nguyên \n hoặc \\n).
// Sheet phải được CHIA SẺ (quyền Xem) cho email service account.

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

let tokenCache: { token: string; exp: number } | null = null

async function getGoogleToken(scope = 'https://www.googleapis.com/auth/spreadsheets.readonly'): Promise<string> {
  const email = process.env.GOOGLE_SA_EMAIL
  let key = process.env.GOOGLE_SA_PRIVATE_KEY || ''
  key = key.replace(/\\n/g, '\n') // env thường lưu \n escaped
  if (!email || !key) throw new Error('Chưa cấu hình GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY (env).')

  const now = Math.floor(Date.now() / 1000)
  if (tokenCache && tokenCache.exp - 60 > now) return tokenCache.token

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({ iss: email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))
  const signInput = `${header}.${claim}`
  let sig: Buffer
  try { sig = crypto.createSign('RSA-SHA256').update(signInput).sign(key) }
  catch { throw new Error('GOOGLE_SA_PRIVATE_KEY không hợp lệ (kiểm tra định dạng khoá / \\n).') }
  const jwt = `${signInput}.${b64url(sig)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const j: any = await res.json().catch(() => ({}))
  if (!res.ok || !j.access_token) throw new Error('Xác thực Google lỗi: ' + (j.error_description || j.error || res.status))
  tokenCache = { token: j.access_token, exp: now + (Number(j.expires_in) || 3600) }
  return j.access_token
}

// Đọc TOÀN BỘ vùng dữ liệu của 1 tab -> mảng 2 chiều (đúng như hiển thị: ô counter ra "bw/color").
export async function readSheetGrid(spreadsheetId: string, tab: string): Promise<string[][]> {
  if (!spreadsheetId) throw new Error('Chưa cấu hình Spreadsheet ID (Cấu hình hệ thống).')
  const token = await getGoogleToken()
  const range = encodeURIComponent(`'${String(tab || '').replace(/'/g, "''")}'`) // bọc nháy cho tên tab có dấu/space
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const j: any = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error('Đọc Google Sheet lỗi: ' + (j.error?.message || res.status))
  return (j.values || []) as string[][]
}
