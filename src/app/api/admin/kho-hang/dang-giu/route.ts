import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

// "Đang giữ" = tổng SL vật tư của các phiếu CHƯA 'Hoàn thành' (Chờ nhận/Đã nhận/Đang làm/Chưa hoàn thành),
// bỏ các dòng đã trả kho. Dùng để hiển thị Tồn khả dụng (= Tồn - Đang giữ) khi lập phiếu / đặt hàng.
// Kho chỉ trừ thực khi phiếu Hoàn thành (trigger DB), nên đây là "giữ chỗ mềm" (chỉ tính, không trừ).
export async function GET() {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff', 'kthc')
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

    // "Chờ về" = SL đã ĐẶT (header da_dat) nhưng CHƯA nhận đủ (dòng chưa hoàn thành), gom theo mã.
    // Cùng định nghĩa với cảnh báo tồn kho -> hiển thị nhất quán.
    const cts = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_dat_hang_ct')
      .select('ma_hang, sl_dat, soct_dat_hang!inner ( da_dat ), soct_hang_ve_dot ( so_luong_nhan )')
      .eq('hoan_thanh', false)
      .eq('soct_dat_hang.da_dat', true)
      .range(from, to) as any)
    const choVe: Record<string, number> = {}
    for (const c of cts || []) {
      const daNhan = (c.soct_hang_ve_dot || []).reduce((s: number, h: any) => s + (Number(h.so_luong_nhan) || 0), 0)
      const conVe = Math.max(0, (Number(c.sl_dat) || 0) - daNhan)
      if (conVe > 0 && c.ma_hang) choVe[c.ma_hang] = (choVe[c.ma_hang] || 0) + conVe
    }

    return NextResponse.json({ data: map, choVe })
  } catch (error: any) {
    console.error('Error computing dang_giu:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
