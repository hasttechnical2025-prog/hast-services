import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

// Danh sách audit log (chỉ admin). ?limit=0 -> toàn bộ, mặc định 50, tối đa 5000.
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const raw = parseInt(new URL(request.url).searchParams.get('limit') || '50')
    const limit = isNaN(raw) ? 50 : raw

    let query = supabaseAdmin.from('soct_audit_log').select('*').order('created_at', { ascending: false })
    if (limit > 0) query = query.limit(Math.min(limit, 5000))
    else query = query.limit(5000) // "Toàn bộ" vẫn giới hạn an toàn 5000 dòng gần nhất

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching audit logs:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
