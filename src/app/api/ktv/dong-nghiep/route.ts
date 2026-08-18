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

    const list = (data || [])
      .filter((u: any) => u.id !== session.id && u.is_active !== false)
      .map((u: any) => ({ id: u.id, full_name: u.full_name }))
    return NextResponse.json({ data: list })
  } catch (error: any) {
    console.error('Error fetching dong-nghiep:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
