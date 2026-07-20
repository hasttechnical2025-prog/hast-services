import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { KH_NUMERIC_FIELDS, KH_TEXT_FIELDS } from '@/lib/thue-cpc'
import { broadcastThueCpcChanged } from '@/lib/realtime'

// Các máy thuộc diện billing thuê/CPC
const LOAI_HD_BILLING = ['Máy thuê', 'Máy CPC']

const BILLING_SELECT =
  'id, ten_khach_hang, dia_chi, ma_may, serial, model, hang, loai_hd, ' +
  'phi_thue_thang, don_gia_bw, don_gia_mau, dinh_muc_mien_phi_bw, dinh_muc_mien_phi_mau, ' +
  'cam_ket_toi_thieu_bw, cam_ket_toi_thieu_mau, vat_thue_cpc, trach_nhiem_ky_thuat, ' +
  'ten_doi_tac_ky_thuat, ngay_chot_so, chot_so_ngay, chot_so_cuoi_thang, vi_tri_dat_may, nguoi_lien_he, email, ngay_lap_may, ngay_het_han_hdbt, nv_kinh_doanh, id_hop_dong_khung'

// GET: danh sách máy loai_hd IN ('Máy thuê','Máy CPC') kèm toàn bộ field billing
export async function GET() {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const data = await selectAll((from, to) => supabaseAdmin
      .from('soct_khach_hang')
      .select(BILLING_SELECT)
      .in('loai_hd', LOAI_HD_BILLING)
      .order('ten_khach_hang')
      .range(from, to))

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching thue-cpc customers:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT: cập nhật field billing / gán-bỏ gán HĐ khung cho 1 máy. Chỉ đụng field billing, không đụng field khác.
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const body = await request.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: 'Thiếu ID khách hàng' }, { status: 400 })

    const updates: any = {}
    for (const k of KH_NUMERIC_FIELDS) {
      if (body[k] === undefined) continue
      updates[k] = body[k] === '' || body[k] === null ? null : (parseFloat(body[k]) || 0)
    }
    for (const k of KH_TEXT_FIELDS) {
      if (body[k] === undefined) continue
      updates[k] = body[k] === '' ? null : body[k]
    }
    if (body.ngay_lap_may !== undefined) updates.ngay_lap_may = body.ngay_lap_may === '' ? null : body.ngay_lap_may
    // Ngày hết hạn hợp đồng — dùng chung cột với Danh sách khách hàng
    if (body.ngay_het_han_hdbt !== undefined) updates.ngay_het_han_hdbt = body.ngay_het_han_hdbt === '' ? null : body.ngay_het_han_hdbt
    if (body.id_hop_dong_khung !== undefined) updates.id_hop_dong_khung = body.id_hop_dong_khung === '' ? null : body.id_hop_dong_khung
    // Ngày chốt số có cấu trúc (phục vụ nhắc lấy counter)
    if (body.chot_so_ngay !== undefined) updates.chot_so_ngay = body.chot_so_ngay === '' || body.chot_so_ngay == null ? null : (parseInt(body.chot_so_ngay, 10) || null)
    if (body.chot_so_cuoi_thang !== undefined) updates.chot_so_cuoi_thang = !!body.chot_so_cuoi_thang

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Không có dữ liệu cập nhật' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('soct_khach_hang')
      .update(updates)
      .eq('id', id)
      .select(BILLING_SELECT)
      .single()

    if (error) throw error
    await broadcastThueCpcChanged()
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error updating thue-cpc customer:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
