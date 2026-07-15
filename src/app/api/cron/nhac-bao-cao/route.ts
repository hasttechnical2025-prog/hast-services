import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendTelegramMessage } from '@/lib/telegram'

// Hàm format ngày DD/MM
const formatShortDate = (d: Date) => {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}
const formatYMD = (d: Date) => {
  return d.toISOString().split('T')[0]
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const secret = process.env.CRON_SECRET
    // Nếu có CRON_SECRET trong env, bắt buộc Request phải truyền Authorization: Bearer <secret>
    if (secret && authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID

    if (!groupChatId) {
      return NextResponse.json({ message: 'Không có group chat id' })
    }

    // 1. Tính toán danh sách ngày cần quét (từ hôm qua, lùi về 7 ngày)
    const datesToCheck: { ymd: string, label: string }[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Bắt đầu từ hôm qua (i = 1) đến 7 ngày trước (i <= 7)
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today.getTime() - i * 86400000)
      const dayOfWeek = d.getDay()
      // Bỏ qua Thứ 7 (6) và Chủ Nhật (0)
      if (dayOfWeek === 0 || dayOfWeek === 6) continue

      datesToCheck.push({
        ymd: formatYMD(d),
        label: formatShortDate(d)
      })
    }

    if (datesToCheck.length === 0) return NextResponse.json({ message: 'Không có ngày làm việc nào cần quét' })

    const dateStrs = datesToCheck.map(d => d.ymd)

    // 2. Tải danh sách ngày nghỉ lễ từ DB để loại trừ tiếp
    const { data: ngayNghiList } = await supabaseAdmin
      .from('soct_ngay_nghi')
      .select('ngay')
      .in('ngay', dateStrs)

    const ngayNghiSet = new Set((ngayNghiList || []).map(n => n.ngay))
    const validDates = datesToCheck.filter(d => !ngayNghiSet.has(d.ymd))

    if (validDates.length === 0) return NextResponse.json({ message: 'Tất cả các ngày quét đều là ngày nghỉ' })
    const validDateStrs = validDates.map(d => d.ymd)

    // 3. Tải danh sách KTV đang hoạt động
    const { data: ktvs } = await supabaseAdmin
      .from('soct_users')
      .select('id, full_name')
      .eq('role', 'ktv')
      .eq('is_active', true)

    if (!ktvs || ktvs.length === 0) return NextResponse.json({ message: 'Không có KTV nào hoạt động' })

    // 4. Lấy trạng thái báo cáo đã nộp của các KTV trong các ngày hợp lệ
    const { data: submitted } = await supabaseAdmin
      .from('soct_trang_thai_bao_cao')
      .select('ktv_id, ngay_bao_cao')
      .in('ngay_bao_cao', validDateStrs)
      .eq('da_nop', true)

    // Đưa vào Set để tra cứu nhanh: `ktvId_ngay`
    const submittedSet = new Set((submitted || []).map(s => `${s.ktv_id}_${s.ngay_bao_cao}`))

    // Nghỉ phép/ốm CẢ NGÀY đã duyệt -> loại KTV đó khỏi nhắc những ngày đó
    const minD = validDateStrs.reduce((a, b) => (a < b ? a : b))
    const maxD = validDateStrs.reduce((a, b) => (a > b ? a : b))
    const { data: leaves } = await supabaseAdmin
      .from('soct_nghi_phep')
      .select('user_id, tu_ngay, den_ngay')
      .eq('trang_thai', 'da_duyet')
      .eq('buoi', 'ca_ngay')
      .lte('tu_ngay', maxD)
      .gte('den_ngay', minD)
    const leaveSet = new Set<string>()
    for (const lv of leaves || []) {
      for (const d of validDates) {
        if (d.ymd >= lv.tu_ngay && d.ymd <= lv.den_ngay) leaveSet.add(`${lv.user_id}_${d.ymd}`)
      }
    }

    // Lấy tất cả ca máy thuộc các ngày quét để check xem ca nào chưa điền counter/ghi chú KTV
    const { data: jobs } = await supabaseAdmin
      .from('soct_cong_viec')
      .select('id, ngay, ktv_id, ktv2_id, counter, ghi_chu_ktv')
      .in('ngay', validDateStrs)
      .in('ket_qua', ['Hoàn thành', 'Đang làm', 'Lắp tiếp'])

    // 5. Đối chiếu KTV nợ báo cáo
    const missingReports: { ktvName: string, days: string[] }[] = []

    for (const ktv of ktvs) {
      const missingDays: string[] = []
      // Duyệt qua từng ngày (đã loại cuối tuần và ngày lễ, sắp xếp từ gần đến xa)
      for (const d of validDates) {
        // KTV nghỉ cả ngày (đã duyệt) -> không tính thiếu báo cáo ngày đó
        if (leaveSet.has(`${ktv.id}_${d.ymd}`)) continue
        const hasSubmitted = submittedSet.has(`${ktv.id}_${d.ymd}`)

        // Tìm các ca máy của KTV này trong ngày d
        const ktvJobs = (jobs || []).filter(j =>
          j.ngay === d.ymd && (j.ktv_id === ktv.id || j.ktv2_id === ktv.id)
        )
        // Check xem có ca nào chưa chọn tình trạng máy (ghi_chu_ktv rỗng) hay không
        // Cột counter rỗng không bị coi là thiếu báo cáo
        const hasEmptyReport = ktvJobs.some(j => !j.ghi_chu_ktv || !j.ghi_chu_ktv.trim())

        if (!hasSubmitted) {
          missingDays.push(d.label) // Thêm ngày bị thiếu hoàn toàn
        } else if (hasEmptyReport) {
          missingDays.push(`${d.label} (chưa báo ca máy)`) // Thêm ngày bị thiếu nội dung ca máy phát sinh
        }
      }

      if (missingDays.length > 0) {
        missingReports.push({ ktvName: ktv.full_name, days: missingDays })
      }
    }

    if (missingReports.length === 0) {
      return NextResponse.json({ message: 'Tất cả KTV đã nộp đủ báo cáo' })
    }

    // 6. Xây dựng tin nhắn và bắn Telegram
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://techservice.app'
    let msg = `🔔 <b>NHẮC NHỞ NỘP BÁO CÁO NHẬT KÝ</b>\n`
    msg += `Các kỹ thuật viên vui lòng hoàn thành báo cáo ngày cho các ngày làm việc còn thiếu:\n\n`

    missingReports.forEach(m => {
      msg += `👤 <b>${m.ktvName}:</b> thiếu ngày ${m.days.join(', ')}\n`
    })

    msg += `\n👉 <a href="${appUrl}/ktv">Mở App KTV để nộp báo cáo bổ sung</a>`

    await sendTelegramMessage(groupChatId, msg)

    return NextResponse.json({ success: true, count: missingReports.length })
  } catch (error: any) {
    console.error('Error in cron job nhac-bao-cao:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
