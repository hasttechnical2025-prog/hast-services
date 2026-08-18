import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

export const runtime = 'nodejs'

// Danh sách KTV đang hoạt động (TRỪ chính mình) — cho picker "Chuyển việc" trên app KTV.
export async function GET() {
  try {
    const session = await requireRole('ktv')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const { data, error } = await supabaseAdmin
      .from('soct_users')
      .select('id, full_name, is_active')
      .eq('role', 'ktv')
      .order('full_name')
    if (error) throw error

    // Ai đang NGHỈ hôm nay (đơn đã duyệt, khoảng ngày phủ hôm nay) -> đánh dấu để tránh mời nhầm.
    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10) // hôm nay giờ VN
    const { data: leaves } = await supabaseAdmin
      .from('soct_nghi_phep')
      .select('user_id, buoi')
      .eq('trang_thai', 'da_duyet')
      .lte('tu_ngay', today)
      .gte('den_ngay', today)
    const nghiMap = new Map<string, string>()
    for (const l of (leaves || []) as any[]) if (l.user_id) nghiMap.set(l.user_id, l.buoi || '')

    const list = (data || [])
      .filter((u: any) => u.id !== session.id && u.is_active !== false)
      .map((u: any) => ({ id: u.id, full_name: u.full_name, nghi: nghiMap.has(u.id), buoi: nghiMap.get(u.id) || '' }))
    return NextResponse.json({ data: list })
  } catch (error: any) {
    console.error('Error fetching dong-nghiep:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
