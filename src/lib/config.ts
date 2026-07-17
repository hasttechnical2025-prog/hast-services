import { supabaseAdmin } from '@/lib/supabase-admin'

// Cache ngắn: cấu hình được đọc ở MỌI lần gọi API (requireRole kiểm cờ bảo trì),
// không cache thì mỗi request tốn thêm 1 truy vấn. Đổi cấu hình có độ trễ tối đa TTL
// (PUT cau-hinh gọi clearCauHinhCache() nên máy của admin thấy ngay).
const CACHE_TTL_MS = 15_000
let cache: { at: number, cfg: Record<string, string> } | null = null

export function clearCauHinhCache() { cache = null }

// Đọc toàn bộ cấu hình hệ thống (soct_cau_hinh) dạng { khoa: gia_tri }
export async function getCauHinh(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.cfg

  const { data, error } = await supabaseAdmin.from('soct_cau_hinh').select('khoa, gia_tri')
  // Lỗi DB -> KHÔNG cache kết quả rỗng (tránh chôn cấu hình sai trong 15s);
  // dùng tạm bản cũ nếu có. Hệ quả: sự cố DB sẽ MỞ app (fail-open) thay vì khóa sạch.
  if (error) return cache?.cfg ?? {}

  const cfg: Record<string, string> = {}
  for (const r of data || []) cfg[r.khoa] = r.gia_tri
  cache = { at: Date.now(), cfg }
  return cfg
}

// Thông điệp lộ ra ngoài KHI BỊ CHẶN: cố ý viết như một sự cố máy chủ, KHÔNG nhắc
// tới "bảo trì" — người dùng phải thấy như app đang hỏng, không phải bị khóa có chủ đích.
// (Dùng cho cả màn chặn lẫn lỗi 503 khi ai đó cố đăng nhập.)
export const BAO_TRI_MSG = 'Máy chủ không phản hồi. Vui lòng thử lại sau ít phút.'

// Chế độ bảo trì: bật -> CHỈ admin dùng được app (mọi role khác bị chặn ở requireRole,
// chặn đăng nhập, dừng cron + Telegram).
export async function isBaoTri(): Promise<boolean> {
  const cfg = await getCauHinh()
  return (cfg.bao_tri ?? '0') === '1'
}

// Độ dài phiên đăng nhập (giây) theo cấu hình, có mặc định và chặn giá trị bất thường.
// van_phong: admin/tech_admin/staff (mặc định 7 ngày). ktv: đăng nhập bằng mật khẩu (mặc định 30 ngày).
export async function getSessionMaxAge(kind: 'van_phong' | 'ktv'): Promise<number> {
  const cfg = await getCauHinh()
  const key = kind === 'ktv' ? 'phien_ktv_ngay' : 'phien_van_phong_ngay'
  const def = kind === 'ktv' ? 30 : 7
  let days = parseInt(cfg[key] || '') || def
  if (days < 1) days = 1
  if (days > 3650) days = 3650
  return days * 24 * 60 * 60
}
