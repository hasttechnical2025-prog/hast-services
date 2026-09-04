import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { reconcileNghiPhep, chamcongConfigured, type DonNghi } from '@/lib/chamcong'
import type { Buoi, LoaiNghi } from '@/lib/nghi-phep'

export const runtime = 'nodejs'

// POST: ĐỒNG BỘ LẠI toàn bộ nghỉ phép đã duyệt -> app Chấm công (self-heal khi lỡ đẩy lẻ).
// Đẩy TẤT CẢ đơn 'da_duyet' (không lọc ngày) để phần "xóa mồ côi" tính đúng phạm vi.
export async function POST() {
  try {
    const session = await requireRole('admin', 'tech_admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    if (!chamcongConfigured()) {
      return NextResponse.json({ error: 'Chưa cấu hình CHAMCONG_SUPABASE_URL/KEY trên server' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('soct_nghi_phep')
      .select('id, loai, tu_ngay, den_ngay, buoi, soct_users!user_id ( full_name )')
      .eq('trang_thai', 'da_duyet')
      .range(0, 9999)
    if (error) throw error

    const dons: DonNghi[] = ((data || []) as any[]).map(r => ({
      id: r.id, loai: r.loai as LoaiNghi, tu_ngay: r.tu_ngay, den_ngay: r.den_ngay,
      buoi: r.buoi as Buoi, full_name: r.soct_users?.full_name || '',
    }))

    const res = await reconcileNghiPhep(dons)
    if (!res.ok) return NextResponse.json({ error: res.err || 'Lỗi đồng bộ' }, { status: 500 })

    await logAudit(session, 'Đồng bộ nghỉ phép → chấm công', `${res.upserted} ngày / ${dons.length} đơn, xóa ${res.deleted} mồ côi, lỗi ${res.loi}`)
    return NextResponse.json({ success: true, ...res, don: dons.length })
  } catch (e: any) {
    console.error('Đồng bộ nghỉ phép lỗi:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
