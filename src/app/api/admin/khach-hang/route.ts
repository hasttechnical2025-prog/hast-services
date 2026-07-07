import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { getCoordinatesFromAddress, getDistanceFromOffice } from '@/lib/routing'
import { requireRole } from '@/lib/session'
import { getCauHinh } from '@/lib/config'

// Lấy danh sách khách hàng
export async function GET() {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    }

    // Lấy toàn bộ (khách hàng/máy có thể vượt 1000 dòng)
    const data = await selectAll((from, to) => supabaseAdmin
      .from('soct_khach_hang')
      .select('id, ten_khach_hang, dia_chi, km_mac_dinh, ma_may, model, hang, loai_hd, ngay_het_han_hdbt')
      .order('ten_khach_hang')
      .range(from, to))

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching customers:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Thêm khách hàng mới kèm tự động tính tọa độ và km mặc định
// Tạo khách hàng mới — cho phép cả staff vì luồng "máy mới" trong form giao việc cần tạo khách hàng
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const body = await request.json()
    const { ten_khach_hang, dia_chi, ma_may, model, hang } = body

    if (!ten_khach_hang || !dia_chi) {
      return NextResponse.json({ error: 'Thiếu tên khách hàng hoặc địa chỉ' }, { status: 400 })
    }

    // 1. Tự động lấy tọa độ từ địa chỉ thông qua Nominatim API
    const coords = await getCoordinatesFromAddress(dia_chi)
    let lat = null
    let lng = null
    let km_mac_dinh = null

    if (coords) {
      lat = coords.lat
      lng = coords.lng
      // 2. Tính khoảng cách từ công ty (tọa độ VP lấy từ cấu hình) qua OSRM
      const cfg = await getCauHinh()
      const vpLat = parseFloat(cfg.vp_lat || '') || 21.011681
      const vpLng = parseFloat(cfg.vp_lng || '') || 105.809180
      const dist = await getDistanceFromOffice(lat, lng, vpLat, vpLng)
      if (dist !== null) {
        // Làm tròn đến 1 chữ số thập phân
        km_mac_dinh = Math.round(dist * 10) / 10
      }
    }

    // 3. Lưu vào database
    const { data, error } = await supabaseAdmin
      .from('soct_khach_hang')
      .insert({
        ten_khach_hang,
        dia_chi,
        lat,
        lng,
        km_mac_dinh,
        ma_may: ma_may || null,
        model: model || null,
        hang: hang || null
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error creating customer:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Cập nhật thông tin khách hàng (bao gồm hợp đồng bảo trì HĐBT)
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const body = await request.json()
    const { id } = body
    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID khách hàng' }, { status: 400 })
    }

    const allowed = ['ten_khach_hang', 'ma_may', 'dia_chi', 'model', 'hang', 'km_mac_dinh', 'loai_hd', 'ngay_het_han_hdbt']
    const updates: any = {}
    for (const k of allowed) {
      if (body[k] === undefined) continue
      if (k === 'km_mac_dinh') updates[k] = body[k] === '' || body[k] === null ? null : (parseFloat(body[k]) || 0)
      else updates[k] = body[k] === '' ? null : body[k]
    }

    const { data, error } = await supabaseAdmin
      .from('soct_khach_hang')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Mã máy này đã tồn tại ở khách hàng khác' }, { status: 400 })
      }
      throw error
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error updating customer:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Xóa khách hàng: toàn bộ (?all=1, khi nhập lại dữ liệu) hoặc theo id
export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const all = searchParams.get('all') === '1'

    if (!all && !id) {
      return NextResponse.json({ error: 'Thiếu id khách hàng' }, { status: 400 })
    }

    const query = supabaseAdmin.from('soct_khach_hang').delete()
    const { error } = all
      ? await query.not('id', 'is', null)
      : await query.eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting customer:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
