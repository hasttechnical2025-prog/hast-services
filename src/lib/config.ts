import { supabaseAdmin } from '@/lib/supabase-admin'

// Đọc toàn bộ cấu hình hệ thống (soct_cau_hinh) dạng { khoa: gia_tri }
export async function getCauHinh(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin.from('soct_cau_hinh').select('khoa, gia_tri')
  const cfg: Record<string, string> = {}
  for (const r of data || []) cfg[r.khoa] = r.gia_tri
  return cfg
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
