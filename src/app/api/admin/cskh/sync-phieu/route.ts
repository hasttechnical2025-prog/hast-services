import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { broadcastCskhChanged } from '@/lib/realtime'
import { syncCskhFromPhieu } from '@/lib/cskh'
import { clearCauHinhCache } from '@/lib/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST: Đồng bộ CSKH từ phiếu giao việc đã Hoàn thành (nút "Đồng bộ từ phiếu"). Toàn bộ.
export async function POST() {
  try {
    const session = await requireTab('cong_viec', 'cong_viec.cham_soc_kh')
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })

    const res = await syncCskhFromPhieu()
    const luc = new Date(Date.now() + 7 * 3600 * 1000).toISOString()
    await supabaseAdmin.from('soct_cau_hinh').upsert({ khoa: 'cskh_sync_phieu_luc', gia_tri: luc }, { onConflict: 'khoa' })
    clearCauHinhCache()

    await logAudit(session, 'Đồng bộ CSKH từ phiếu', `${res.may} máy · +${res.lichsu_them} lượt · ${res.tao_moi} máy mới`)
    await broadcastCskhChanged()
    return NextResponse.json({ success: true, ...res, sync_luc: luc })
  } catch (error: any) {
    console.error('Error sync cskh từ phiếu:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
