import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isBaoTri } from '@/lib/config'

export const runtime = 'nodejs'
const H = 3600 * 1000

// CUỐN NGÀY phiếu chưa thực hiện sang ngày làm việc hiện tại. Chạy Vercel Cron mỗi sáng sớm (giờ VN).
// - Bỏ qua Thứ 7 / Chủ Nhật / ngày nghỉ lễ (soct_ngay_nghi) -> nhờ vậy "về hôm nay" = cuốn tới
//   đúng ngày làm việc kế tiếp mà không cần tính tay.
// - Chỉ phiếu KTV thật (nguon IS NULL) đang Chờ nhận / Đã nhận / Chưa hoàn thành (KHÔNG gồm
//   'Đang làm' và 'Hoàn thành'); logic ở hàm SQL soct_cuon_ngay_phieu (migration 66).
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const secret = process.env.CRON_SECRET
    if (secret && authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (await isBaoTri()) return NextResponse.json({ message: 'Đang bảo trì — bỏ qua' })

    // Ngày + thứ theo giờ VN (Date dựng bằng +7h -> đọc bằng getUTC*).
    const vn = new Date(Date.now() + 7 * H)
    const dow = vn.getUTCDay() // 0 = Chủ Nhật, 6 = Thứ 7
    const today = vn.toISOString().slice(0, 10) // YYYY-MM-DD (giờ VN)

    if (dow === 0 || dow === 6) {
      return NextResponse.json({ skipped: 'Cuối tuần (T7/CN) — không cuốn', today })
    }
    const { data: le } = await supabaseAdmin.from('soct_ngay_nghi').select('ngay').eq('ngay', today).maybeSingle()
    if (le) {
      return NextResponse.json({ skipped: 'Ngày nghỉ lễ — không cuốn', today })
    }

    // Cuốn (hàm SQL tự tăng so_lan_cuon, trả danh sách phiếu đã cuốn).
    const { data, error } = await supabaseAdmin.rpc('soct_cuon_ngay_phieu', { p_today: today })
    if (error) throw error
    const rolled = (data || []) as any[]
    // Phiếu TỒN ĐỌNG: bị cuốn từ 5 lần trở lên -> nhiều khả năng bị bỏ quên.
    const tonDong = rolled.filter(r => (r.so_lan_cuon || 0) >= 5)

    return NextResponse.json({
      today,
      cuon: rolled.length,
      ton_dong: tonDong.length,
      chi_tiet_ton_dong: tonDong.slice(0, 30).map(r => ({ report: r.report, ten_khach: r.ten_khach, so_lan_cuon: r.so_lan_cuon })),
    })
  } catch (e: any) {
    console.error('cuon-ngay-phieu error', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
