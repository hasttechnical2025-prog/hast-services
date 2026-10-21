import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'
import { autoPhanLoai, nguongPhanLoai } from '@/lib/cskh'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const gate = () => requireTab('cong_viec', 'cong_viec.cham_soc_kh')

// GET: đếm MÁY cần kéo lại = phân loại 'nguy_co' hoặc 'da_mat' (tự suy, trừ khi đè tay) và CHƯA chốt
// (giai_doan khác da_quay_lai/tu_choi). Dùng cho badge menu "Chăm sóc KH" (can_lam).
export async function GET() {
  try {
    const session = await gate()
    if (!session) return NextResponse.json({ can_lam: 0 }, { status: 200 })
    const [mays, { nguyco, mat }] = await Promise.all([
      selectAll<any>((f, t) => supabaseAdmin.from('soct_cskh_may').select('lan_cuoi, phan_loai, phan_loai_tay, giai_doan').eq('an', false).range(f, t)),
      nguongPhanLoai(),
    ])
    let can_lam = 0
    for (const m of mays || []) {
      if (m.giai_doan === 'da_quay_lai' || m.giai_doan === 'tu_choi') continue
      const pl = m.phan_loai_tay && m.phan_loai ? m.phan_loai : autoPhanLoai(m.lan_cuoi, nguyco, mat)
      if (pl === 'nguy_co' || pl === 'da_mat') can_lam++
    }
    return NextResponse.json({ can_lam })
  } catch (error: any) {
    console.error('Error GET cskh/can-cham-soc:', error)
    return NextResponse.json({ can_lam: 0 }, { status: 200 })
  }
}
