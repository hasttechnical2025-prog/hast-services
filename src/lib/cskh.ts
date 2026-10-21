import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { getCauHinh } from '@/lib/config'

// Số tháng kể từ tháng 'YYYY-MM' tới nay. Rỗng = rất lâu.
export function monthsSince(ym: string | null): number {
  if (!ym) return 9999
  const [y, m] = String(ym).slice(0, 7).split('-').map(Number)
  if (!y || !m) return 9999
  const now = new Date(Date.now() + 7 * 3600 * 1000)
  return (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m)
}
export function autoPhanLoai(ym: string | null, nguyco: number, mat: number): string {
  const d = monthsSince(ym)
  if (d >= mat) return 'da_mat'
  if (d >= nguyco) return 'nguy_co'
  return 'dang_dung'
}
// Ngưỡng (tháng) phân loại — cấu hình qua soct_cau_hinh, mặc định 6 / 12.
export async function nguongPhanLoai(): Promise<{ nguyco: number; mat: number }> {
  const cfg = await getCauHinh()
  const nguyco = Math.max(1, Number(cfg['cskh_nguong_nguyco']) || 6)
  const mat = Math.max(nguyco + 1, Number(cfg['cskh_nguong_mat']) || 12)
  return { nguyco, mat }
}

// Tra điểm máy (app) theo ma_may -> tên khách/model/địa chỉ/cụm chuẩn. Dùng chung GET/POST/import.
export async function layMapDiemMay() {
  const [mays, cums] = await Promise.all([
    selectAll<any>((f, t) => supabaseAdmin.from('soct_khach_hang').select('ma_may, ten_khach_hang, model, dia_chi, ma_khach_cum').not('ma_may', 'is', null).range(f, t)),
    selectAll<any>((f, t) => supabaseAdmin.from('soct_khach_cum').select('ma_khach_hang, ten_khach_hang').range(f, t)),
  ])
  const cumTen = new Map<string, string>()
  for (const c of cums || []) cumTen.set(String(c.ma_khach_hang), c.ten_khach_hang || '')
  const byMa = new Map<string, { ten_khach_hang: string; model: string; dia_chi: string; ma_khach_cum: string; ten_cum: string }>()
  for (const m of mays || []) {
    const k = String(m.ma_may).trim()
    if (k && !byMa.has(k)) byMa.set(k, {
      ten_khach_hang: m.ten_khach_hang || '', model: m.model || '', dia_chi: m.dia_chi || '',
      ma_khach_cum: m.ma_khach_cum || '', ten_cum: m.ma_khach_cum ? (cumTen.get(String(m.ma_khach_cum)) || '') : '',
    })
  }
  return byMa
}
