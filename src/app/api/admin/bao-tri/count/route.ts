import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { canBaoTriThang, LOAI_HD_BAO_TRI } from '@/lib/bao-tri'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET ?thang_nam=YYYY-MM : số MÁY CHƯA bảo trì trong tháng (cần bảo trì nhưng chưa có record). Badge sidebar.
export async function GET(request: Request) {
  try {
    const session = await requireRole()
    if (!session) return NextResponse.json({ count: 0 }, { status: 401 })
    const thang = (new URL(request.url).searchParams.get('thang_nam') || '').slice(0, 7)
      || new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7)

    const [mays, records] = await Promise.all([
      selectAll<any>((f, t) => supabaseAdmin.from('soct_khach_hang')
        .select('ma_may, loai_hd, thang_bao_tri, bat_dau_tu_thang, tam_dung_tu_thang, tam_dung_den_thang, tam_hoan_cum_tu_thang, tam_hoan_cum_den_thang')
        .in('loai_hd', LOAI_HD_BAO_TRI).range(f, t)),
      selectAll<any>((f, t) => supabaseAdmin.from('soct_bao_tri').select('ma_may').eq('thang_nam', thang).range(f, t)),
    ])
    const done = new Set((records || []).map((r: any) => String(r.ma_may).toLowerCase()))
    let count = 0
    for (const m of mays || []) {
      if (canBaoTriThang(m, thang) && !done.has(String(m.ma_may).toLowerCase())) count++
    }
    return NextResponse.json({ count, thang_nam: thang })
  } catch (error: any) {
    console.error('Error GET bao-tri/count:', error)
    return NextResponse.json({ count: 0 }, { status: 200 })
  }
}
