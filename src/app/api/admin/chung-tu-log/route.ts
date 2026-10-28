import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

export const runtime = 'nodejs'

// GET ?id=<phiếu> : lịch sử xuất chứng từ (BBBG/BBGĐ) của 1 phiếu, mới nhất trước.
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu phiếu' }, { status: 400 })
    const { data, error } = await supabaseAdmin
      .from('soct_chung_tu_log')
      .select('id, loai, mau, mau_label, nguoi_id, nguoi_ten, created_at')
      .eq('job_id', id)
      .order('created_at', { ascending: false })
    if (error) throw error
    // Ẩn các lần xuất do tài khoản admin (dùng để test) cho đỡ nhiễu lịch sử.
    // Audit Logs (Hệ thống) vẫn ghi/hiển thị đầy đủ — chỉ lọc ở lịch sử xuất chứng từ.
    const rows = (data || []) as any[]
    const ids = Array.from(new Set(rows.map(r => r.nguoi_id).filter(Boolean)))
    let adminIds = new Set<string>()
    if (ids.length > 0) {
      const { data: us } = await supabaseAdmin.from('soct_users').select('id').eq('role', 'admin').in('id', ids)
      adminIds = new Set((us || []).map((u: any) => u.id))
    }
    const filtered = rows.filter(r => !(r.nguoi_id && adminIds.has(r.nguoi_id))).map(({ nguoi_id, ...r }) => r)
    return NextResponse.json({ data: filtered })
  } catch (error: any) {
    console.error('Error GET chung-tu-log:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
