import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { LOAI_HD_BAO_TRI } from '@/lib/bao-tri'

export const runtime = 'nodejs'

// GET: danh sách máy HĐBT/MF + cấu hình phí bảo trì (so_hddv/ngay_ky_hddv/don_gia_bt) để màn hình
// "Phí bảo trì" gom theo Số HĐDV. Kèm `billed` = danh sách report các phiếu phí BT đã tạo
// (report dạng "PBT-<năm>-<hddv>") -> client biết HĐ nào đã lập kỳ nào.
export async function GET() {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const data = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_khach_hang')
      .select(`id, ten_khach_hang, ma_may, model, loai_hd, ma_khach_cum, vi_tri_dat_may,
        ngay_het_han_hdbt, so_hddv, ngay_ky_hddv, don_gia_bt,
        soct_khach_cum ( ma_khach_hang, ten_khach_hang )`)
      .in('loai_hd', LOAI_HD_BAO_TRI)
      .not('ma_may', 'is', null)
      .order('so_hddv', { ascending: true })
      .range(from, to))

    const { data: phieu } = await supabaseAdmin
      .from('soct_cong_viec')
      .select('report')
      .eq('nguon', 'phi_bao_tri')
      .not('report', 'is', null)
    const billed = [...new Set((phieu || []).map((p: any) => p.report))]

    return NextResponse.json({ data: data || [], billed })
  } catch (error: any) {
    console.error('Error fetching phi-bao-tri:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH: cập nhật CHỈ 3 cột cấu hình phí BT của 1 máy (điểm máy). Dành cho staff nhập tại màn hình
// Phí bảo trì — KHÔNG đụng route sửa khách hàng (admin-only). Chỉ set field được gửi.
export async function PATCH(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const body = await request.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: 'Thiếu id máy' }, { status: 400 })

    const updates: any = {}
    if ('so_hddv' in body) updates.so_hddv = String(body.so_hddv || '').trim() || null
    if ('ngay_ky_hddv' in body) updates.ngay_ky_hddv = body.ngay_ky_hddv || null
    if ('don_gia_bt' in body) {
      const v = body.don_gia_bt === '' || body.don_gia_bt == null ? null : Number(body.don_gia_bt)
      if (v != null && (!Number.isFinite(v) || v < 0)) return NextResponse.json({ error: 'Đơn giá không hợp lệ' }, { status: 400 })
      updates.don_gia_bt = v
    }
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Không có trường nào để cập nhật' }, { status: 400 })

    // Chỉ cho sửa máy thuộc diện bảo trì (HĐBT/MF) — chặn dùng endpoint này để đụng máy khác.
    const { data: may } = await supabaseAdmin.from('soct_khach_hang').select('loai_hd').eq('id', id).maybeSingle()
    if (!may) return NextResponse.json({ error: 'Không tìm thấy máy' }, { status: 404 })
    if (!LOAI_HD_BAO_TRI.includes(String(may.loai_hd || '').trim())) {
      return NextResponse.json({ error: 'Máy không thuộc diện HĐBT/MF' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('soct_khach_hang').update(updates).eq('id', id)
    if (error) throw error

    await logAudit(session, 'Cập nhật cấu hình phí bảo trì', `máy ${id}: ${Object.keys(updates).join(', ')}`)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating phi-bao-tri config:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
