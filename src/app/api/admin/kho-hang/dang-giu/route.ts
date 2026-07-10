import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

// "Đang giữ" = tổng SL vật tư của các phiếu CHƯA 'Hoàn thành' (Chờ nhận/Đã nhận/Đang làm/Lắp tiếp),
// bỏ các dòng đã trả kho. Dùng để hiển thị Tồn khả dụng (= Tồn - Đang giữ) khi lập phiếu / đặt hàng.
// Kho chỉ trừ thực khi phiếu Hoàn thành (trigger DB), nên đây là "giữ chỗ mềm" (chỉ tính, không trừ).
export async function GET() {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const rows = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_chi_tiet_vat_tu')
      .select('ma_hang, so_luong, soct_cong_viec!inner(ket_qua)')
      .eq('da_tra', false)
      .neq('soct_cong_viec.ket_qua', 'Hoàn thành')
      .range(from, to) as any)

    const map: Record<string, number> = {}
    for (const r of rows) {
      const mh = r?.ma_hang
      if (!mh) continue
      map[mh] = (map[mh] || 0) + (Number(r.so_luong) || 0)
    }

    return NextResponse.json({ data: map })
  } catch (error: any) {
    console.error('Error computing dang_giu:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
