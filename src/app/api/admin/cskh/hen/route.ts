import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const gate = () => requireTab('cong_viec', 'cong_viec.cham_soc_kh')

// GET: MÁY có hẹn gọi lại ĐẾN HẠN (ngay_hen <= hôm nay) mà CHƯA xử lý (không có lượt chăm sóc nào
// sau ngày hẹn). Dùng cho chuông header. Gate = cham_soc_kh (admin-only) -> role khác 401 -> ẩn mục.
export async function GET() {
  try {
    const session = await gate()
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
    const [logs, mays] = await Promise.all([
      selectAll<any>((f, t) => supabaseAdmin.from('soct_cskh_log').select('ma_may, ngay, ngay_hen').range(f, t)),
      selectAll<any>((f, t) => supabaseAdmin.from('soct_cskh_may').select('ma_may, ten_khach_hang').eq('an', false).range(f, t)),
    ])
    const tenMay = new Map<string, string>()
    for (const m of mays || []) tenMay.set(m.ma_may, m.ten_khach_hang || m.ma_may)

    // Ngày có lượt chăm sóc theo máy (để xét hẹn đã xử lý chưa).
    const actDates = new Map<string, string[]>()
    for (const l of logs || []) { if (!l.ngay) continue; const a = actDates.get(l.ma_may) || []; a.push(l.ngay); actDates.set(l.ma_may, a) }

    const pend = new Map<string, string>()  // ma_may -> ngày hẹn trễ nhất còn treo
    for (const l of logs || []) {
      if (!l.ngay_hen || l.ngay_hen > today) continue
      // chỉ tính máy còn trong danh sách (chưa ẩn)
      if (!tenMay.has(l.ma_may)) continue
      const after = (actDates.get(l.ma_may) || []).some(d => d > l.ngay_hen)
      if (after) continue
      const cur = pend.get(l.ma_may)
      if (!cur || l.ngay_hen > cur) pend.set(l.ma_may, l.ngay_hen)
    }

    const data = Array.from(pend.entries()).map(([ma_may, ngay_hen]) => ({
      ma_may, ten: tenMay.get(ma_may) || ma_may, ngay_hen, qua_han: ngay_hen < today,
    })).sort((a, b) => String(a.ngay_hen).localeCompare(String(b.ngay_hen)))

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error GET cskh/hen:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
