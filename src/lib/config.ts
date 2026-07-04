import { supabaseAdmin } from '@/lib/supabase-admin'

// Đọc toàn bộ cấu hình hệ thống (soct_cau_hinh) dạng { khoa: gia_tri }
export async function getCauHinh(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin.from('soct_cau_hinh').select('khoa, gia_tri')
  const cfg: Record<string, string> = {}
  for (const r of data || []) cfg[r.khoa] = r.gia_tri
  return cfg
}
