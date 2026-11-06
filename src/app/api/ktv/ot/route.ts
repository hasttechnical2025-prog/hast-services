import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

export const runtime = 'nodejs'

const YM = /^\d{4}-\d{2}$/
function nextMonthStart(thang: string): string {
  const [y, m] = thang.split('-').map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return `${ny}-${String(nm).padStart(2, '0')}-01`
}
function thisMonth(): string {
  const d = new Date(Date.now() + 7 * 3600 * 1000) // giờ VN
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// GET ?thang=YYYY-MM : ca OT CỦA CHÍNH MÌNH trong tháng (read-only — KTV không tự đăng ký).
export async function GET(request: Request) {
  try {
    const session = await requireRole()
    if (!session) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const sp = new URL(request.url).searchParams
    const thang = YM.test(sp.get('thang') || '') ? sp.get('thang')! : thisMonth()
    const start = `${thang}-01`
    const end = nextMonthStart(thang)

    const data = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_ot')
      .select('id, ngay, tu_gio, den_gio, dia_diem, dau_viec, ket_qua, ghi_chu')
      .eq('nhan_vien_id', session.id)
      .gte('ngay', start).lt('ngay', end)
      .order('ngay', { ascending: true }).range(from, to))

    return NextResponse.json({ data: data || [], thang })
  } catch (error: any) {
    console.error('Error GET ktv/ot:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
