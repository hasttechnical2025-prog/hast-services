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
      .select('id, loai, mau, mau_label, nguoi_ten, created_at')
      .eq('job_id', id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ data: data || [] })
  } catch (error: any) {
    console.error('Error GET chung-tu-log:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
