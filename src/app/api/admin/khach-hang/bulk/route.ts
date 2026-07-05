import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { getCoordinatesFromAddress, getDistanceFromOffice } from '@/lib/routing'
import { getCauHinh } from '@/lib/config'

// Cho phép chạy lâu (geocode tuần tự nhiều dòng) trên Vercel
export const maxDuration = 300

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function POST(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const { customers } = await request.json()

    if (!Array.isArray(customers) || customers.length === 0) {
      return NextResponse.json({ error: 'Không có dữ liệu để import' }, { status: 400 })
    }

    // Tọa độ văn phòng (từ cấu hình) để tính KM
    const cfg = await getCauHinh()
    const vpLat = parseFloat(cfg.vp_lat || '') || 21.011681
    const vpLng = parseFloat(cfg.vp_lng || '') || 105.809180

    // Chỉ geocode dòng THIẾU KM (km_mac_dinh rỗng/null). Dòng đã có KM giữ nguyên.
    // Chạy tuần tự, giãn ~1.1s giữa các lần gọi để tôn trọng giới hạn Nominatim (~1 req/s).
    let geocoded = 0
    const rows: any[] = []
    for (const c of customers) {
      const row: any = { ...c }
      const missingKm = row.km_mac_dinh == null || row.km_mac_dinh === ''
      if (missingKm && row.dia_chi) {
        const coords = await getCoordinatesFromAddress(row.dia_chi)
        if (coords) {
          row.lat = coords.lat
          row.lng = coords.lng
          const dist = await getDistanceFromOffice(coords.lat, coords.lng, vpLat, vpLng)
          if (dist !== null) row.km_mac_dinh = Math.round(dist * 10) / 10
          geocoded++
        }
        await sleep(1100)
      }
      rows.push(row)
    }

    // Upsert theo mã máy (trùng thì cập nhật)
    const { data, error } = await supabaseAdmin
      .from('soct_khach_hang')
      .upsert(rows, { onConflict: 'ma_may' })
      .select()

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true, count: data.length, geocoded, data })
  } catch (error: any) {
    console.error('Lỗi bulk import:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
