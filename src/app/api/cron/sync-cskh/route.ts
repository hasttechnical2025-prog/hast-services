import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isBaoTri, clearCauHinhCache } from '@/lib/config'
import { requireRole } from '@/lib/session'
import { logCronRun } from '@/lib/cron-log'
import { broadcastCskhChanged } from '@/lib/realtime'
import { syncCskhFromPhieu } from '@/lib/cskh'

export const runtime = 'nodejs'

// Đồng bộ CSKH từ phiếu giao việc Hoàn thành. Vercel Cron mỗi đêm (giờ VN) HOẶC admin bấm tay.
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const secret = process.env.CRON_SECRET
    const isCron = !!secret && authHeader === `Bearer ${secret}`
    if (!isCron) {
      const session = await requireRole('admin', 'tech_admin')
      if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const source: 'cron' | 'manual' = isCron ? 'cron' : 'manual'
    if (await isBaoTri()) {
      await logCronRun('sync-cskh', 'skipped', source, { reason: 'Bảo trì' })
      return NextResponse.json({ message: 'Đang bảo trì — bỏ qua' })
    }

    const res = await syncCskhFromPhieu()
    const luc = new Date(Date.now() + 7 * 3600 * 1000).toISOString()
    await supabaseAdmin.from('soct_cau_hinh').upsert({ khoa: 'cskh_sync_phieu_luc', gia_tri: luc }, { onConflict: 'khoa' })
    clearCauHinhCache()
    await logCronRun('sync-cskh', 'ok', source, res)
    await broadcastCskhChanged()
    return NextResponse.json({ success: true, ...res })
  } catch (error: any) {
    console.error('Error cron sync-cskh:', error)
    await logCronRun('sync-cskh', 'error', 'cron', { error: error.message }).catch(() => {})
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
