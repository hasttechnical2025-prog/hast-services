import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
// Fallback non-rỗng để `next build` (bước "Collecting page data" evaluate module scope)
// không ném "supabaseKey is required" khi môi trường build thiếu env (VD Preview scope
// chưa cấu hình). Runtime vẫn cần key THẬT — placeholder không gọi mạng được.
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key'

// Client này chỉ được import và sử dụng ở phía SERVER (API routes)
// Tuyệt đối không import ở các file React Component client-side
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

// Supabase giới hạn ~1000 dòng/mỗi request. Helper này lặp .range() để lấy TOÀN BỘ
// dòng (dùng cho các danh sách có thể vượt 1000 như phiếu giao việc, khách hàng...).
// `build(from, to)` phải trả về 1 query đã .range(from, to).
export async function selectAll<T = any>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) {
      // PostgREST trả lỗi "range not satisfiable" khi offset vượt số dòng (VD tổng dòng
      // đúng bội số của pageSize) -> coi như đã hết, không phải lỗi thật
      if (error.code === 'PGRST103' || /range not satisfiable/i.test(error.message || '')) break
      throw error
    }
    const batch = data || []
    all.push(...batch)
    if (batch.length < pageSize) break
    if (all.length >= 100000) break // chặn an toàn, tránh vòng lặp vô hạn
  }
  return all
}
