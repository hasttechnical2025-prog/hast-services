import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

// GET /api/ktv/lich-su?ma_may=<mã>&exclude=<id ca hiện tại>
// Trả LẦN GẦN NHẤT trước đó của mã máy (last call): { ngay, loai_cong_viec, ghi_chu_ktv }
export async function GET(request: Request) {
  try {
    const session = await requireRole('ktv')
    if (!session) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const maMay = (searchParams.get('ma_may') || '').trim()
    const exclude = searchParams.get('exclude') || ''
    if (!maMay) return NextResponse.json({ data: null })

    // Lấy dư 1 dòng để loại trừ chính ca hiện tại (nếu nó là dòng đầu)
    const { data, error } = await supabaseAdmin
      .from('soct_cong_viec')
      .select('id, ngay, loai_cong_viec, ghi_chu_ktv')
      .eq('ma_may', maMay)
      .order('ngay', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(2)

    if (error) throw error
    const rows = (data || []).filter((r: any) => r.id !== exclude)
    return NextResponse.json({ data: rows[0] || null })
  } catch (error: any) {
    console.error('Error getting machine history:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
