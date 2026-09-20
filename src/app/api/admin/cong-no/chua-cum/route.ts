import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

export const runtime = 'nodejs'

// GET: các ĐIỂM MÁY đang có công nợ nhưng CHƯA gán khách cụm (ma_khach_cum null).
// Dùng cho chuông cảnh báo admin-only -> nhắc gán cụm để gom công nợ đúng.
// Điều kiện "có công nợ" đồng bộ với /api/admin/cong-no (Hoàn thành, có số phiếu,
// trang_thai_hd chưa lên HĐ, và KHÔNG phải phiếu đã trả kho toàn bộ).
export async function GET() {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const data = await selectAll((from, to) => supabaseAdmin
      .from('soct_cong_viec')
      .select(`id, id_khach_hang,
        soct_khach_hang ( ten_khach_hang, dia_chi, ma_may, ma_khach_cum ),
        soct_chi_tiet_vat_tu ( da_tra )`)
      .eq('ket_qua', 'Hoàn thành')
      .not('report', 'is', null)
      .neq('report', '')
      .not('trang_thai_hd', 'in', '("Chờ xuất HĐ","Đang xử lý HĐ","Đã lên hóa đơn","Đã thanh toán","Miễn phí")')
      .range(from, to))

    // Bỏ phiếu đã trả kho toàn bộ (giống công nợ); chỉ giữ điểm máy CHƯA gán cụm.
    const map = new Map<string, { id_khach_hang: string; ten_khach_hang: string; dia_chi: string; ma_may: string | null; so_phieu: number }>()
    for (const t of ((data || []) as any[])) {
      const lines = t.soct_chi_tiet_vat_tu || []
      if (lines.length >= 1 && lines.every((v: any) => v.da_tra)) continue
      const kh = t.soct_khach_hang
      if (!kh || kh.ma_khach_cum) continue          // đã gán cụm -> bỏ qua
      const key = t.id_khach_hang
      if (!key) continue
      const cur = map.get(key)
      if (cur) cur.so_phieu++
      else map.set(key, {
        id_khach_hang: key,
        ten_khach_hang: kh.ten_khach_hang || '(không tên)',
        dia_chi: kh.dia_chi || '',
        ma_may: kh.ma_may || null,
        so_phieu: 1,
      })
    }

    const items = Array.from(map.values()).sort((a, b) => b.so_phieu - a.so_phieu)
    return NextResponse.json({ count: items.length, items })
  } catch (error: any) {
    console.error('Error fetching cong-no chua-cum:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
