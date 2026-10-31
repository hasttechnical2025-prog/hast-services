import { NextResponse, type NextRequest } from 'next/server'
import crypto from 'crypto'

// PROXY (Next 16 — thay cho `middleware`). Chạy Node.js runtime, TRƯỚC khi render trang.
//
// Mục đích: khi CHẾ ĐỘ BẢO TRÌ bật, trả **404 THẬT** (status 404, KHÔNG gửi bundle app) cho
// mọi request trang KHÔNG phải admin -> app trông "như không tồn tại" kể cả với người mở
// DevTools/Network (khác lớp ngụy trang client cũ chỉ che bằng CSS). Admin (cookie phiên hợp lệ)
// hoặc link kín ?qt=<khóa> -> cho qua (để admin làm việc / đăng nhập lại).
//
// ⚠️ FAIL-OPEN TUYỆT ĐỐI: mọi lỗi/nghi ngờ (thiếu env, fetch hỏng, parse lỗi) -> cho qua
// (NextResponse.next()), KHÔNG bao giờ 404 nhầm cả app. Đây CHỈ là lớp ngụy trang; chặn thật
// vẫn ở requireRole() + route đăng nhập + cron + Telegram.

const CACHE_TTL_MS = 15_000
let flagCache: { at: number; baoTri: boolean; key: string } | null = null

// Đọc cờ bảo trì + khóa cửa khẩn qua Supabase REST (không import module nặng vào proxy).
// Cache module-scope best-effort (warm instance); cold start chỉ tốn thêm 1 fetch.
async function readMaint(): Promise<{ baoTri: boolean; key: string }> {
  if (flagCache && Date.now() - flagCache.at < CACHE_TTL_MS) return flagCache
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const srv = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !srv || srv === 'placeholder-service-role-key') throw new Error('no supabase env')
  const r = await fetch(`${url}/rest/v1/soct_cau_hinh?select=khoa,gia_tri&khoa=in.(bao_tri,bao_tri_key)`, {
    headers: { apikey: srv, authorization: `Bearer ${srv}` },
    cache: 'no-store',
  })
  if (!r.ok) throw new Error('status fetch failed')
  const rows = (await r.json()) as { khoa: string; gia_tri: string }[]
  const map: Record<string, string> = {}
  for (const x of rows) map[x.khoa] = x.gia_tri
  const res = { at: Date.now(), baoTri: (map.bao_tri ?? '0') === '1', key: (map.bao_tri_key ?? '').trim() }
  flagCache = res
  return res
}

// Verify cookie phiên (HMAC-SHA256, y hệt src/lib/session.ts) -> chỉ cần biết role=admin.
// Token được KÝ nên role không thể giả. (Kiểm is_active/role trong DB vẫn do requireRole lo.)
function isAdminCookie(token: string | undefined): boolean {
  if (!token) return false
  const secret = process.env.SESSION_SECRET
  if (!secret) return false
  const [data, sig] = token.split('.')
  if (!data || !sig) return false
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url')
  const sigBuf = Buffer.from(sig), expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return false
  try {
    const p = JSON.parse(Buffer.from(data, 'base64url').toString())
    if (!p.exp || p.exp < Date.now()) return false
    return p.role === 'admin'
  } catch { return false }
}

// Trang 404 Y HỆT mặc định của Next.js (title + markup + style inline + dark-mode) -> không
// phân biệt được với 404 thật của một route không tồn tại.
const NOT_FOUND_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>404: This page could not be found.</title></head><body><div style="font-family:system-ui,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif,&quot;Apple Color Emoji&quot;,&quot;Segoe UI Emoji&quot;;height:100vh;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center"><div style="line-height:48px"><style>body{color:#000;background:#fff;margin:0}.next-error-h1{border-right:1px solid rgba(0,0,0,.3)}@media (prefers-color-scheme:dark){body{color:#fff;background:#000}.next-error-h1{border-right:1px solid rgba(255,255,255,.3)}}</style><h1 class="next-error-h1" style="display:inline-block;margin:0 20px 0 0;padding:0 23px 0 0;font-size:24px;font-weight:500;vertical-align:top;line-height:49px">404</h1><div style="display:inline-block"><h2 style="font-size:14px;font-weight:400;line-height:49px;margin:0">This page could not be found.</h2></div></div></div></body></html>`

export async function proxy(request: NextRequest) {
  try {
    const { baoTri, key } = await readMaint()
    if (!baoTri) return NextResponse.next() // không khóa -> qua ngay (trường hợp 99.9%)

    // Admin -> cho qua (làm việc trong lúc bảo trì).
    if (isAdminCookie(request.cookies.get('soct_session')?.value)) return NextResponse.next()

    // Link kín ?qt=<khóa> -> cho qua (admin lỡ đăng xuất: mở form đăng nhập / /khoa để mở lại).
    const qt = request.nextUrl.searchParams.get('qt') || ''
    if (key && qt === key) return NextResponse.next()

    // non-admin + đang khóa -> 404 THẬT (status 404, không gửi app).
    // no-store: thiết bị KHÔNG lưu trang 404 -> mở khóa xong, lần tải sau ra app ngay (không kẹt 404);
    // và đang khóa thì mỗi lần tải đều chạm proxy (không phục vụ 404 từ cache).
    return new NextResponse(NOT_FOUND_HTML, {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store, must-revalidate' },
    })
  } catch {
    return NextResponse.next() // FAIL-OPEN: bất kỳ lỗi nào -> cho qua, tuyệt đối không 404 nhầm.
  }
}

export const config = {
  // Chỉ chặn REQUEST TRANG: bỏ /api (tự chặn bằng requireRole), _next, và file tĩnh (có đuôi).
  matcher: ['/((?!api|_next/static|_next/image|.*\\.[\\w]+$).*)'],
}
