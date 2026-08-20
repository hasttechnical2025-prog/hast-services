import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { clearCauHinhCache } from '@/lib/config'

export const runtime = 'nodejs'

// PUT: Lưu "Ký hiệu HĐ M-invoice" (key soct_cau_hinh.minvoice_ky_hieu).
// Cho KẾ TOÁN (admin + kthc) tự chủ — không phải nhờ admin vào Cấu hình. Chỉ đụng đúng 1 key.
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin', 'kthc')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const { gia_tri } = await request.json()
    const val = String(gia_tri ?? '').trim()

    const { error } = await supabaseAdmin
      .from('soct_cau_hinh')
      .upsert({ khoa: 'minvoice_ky_hieu', gia_tri: val }, { onConflict: 'khoa' })
    if (error) throw error
    clearCauHinhCache()

    return NextResponse.json({ success: true, gia_tri: val })
  } catch (error: any) {
    console.error('Error minvoice-kyhieu:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
