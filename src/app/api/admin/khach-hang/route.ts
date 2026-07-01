import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getCoordinatesFromAddress, getDistanceFromOffice } from '@/lib/routing'

// Lấy danh sách khách hàng
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('soct_khach_hang')
      .select('*')
      .order('ten_khach_hang')

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching customers:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Thêm khách hàng mới kèm tự động tính tọa độ và km mặc định
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { ten_khach_hang, dia_chi, ma_may, model } = body

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
      // 2. Tính khoảng cách từ công ty đến địa điểm này thông qua OSRM API
      const dist = await getDistanceFromOffice(lat, lng)
      if (dist !== null) {
        // Làm tròn đến 1 chữ số thập phân
        km_mac_dinh = Math.round(dist * 10) / 10
      }
    }

    // 3. Lưu vào database
    const { data, error } = await supabase
      .from('soct_khach_hang')
      .insert({
        ten_khach_hang,
        dia_chi,
        lat,
        lng,
        km_mac_dinh,
        ma_may: ma_may || null,
        model: model || null
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
