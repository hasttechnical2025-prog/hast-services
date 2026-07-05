import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { sendTelegramMessage } from '@/lib/telegram'
import { getCauHinh } from '@/lib/config'

// Danh sách phiếu cần kiểm soát: có số phiếu + đã Hoàn thành (cả đã/chưa nộp)
export async function GET() {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const { data, error } = await supabaseAdmin
      .from('soct_cong_viec')
      .select(`id, ngay, report, loai_cong_viec, ket_qua, da_nop_phieu, ngay_nop_phieu, ktv_id,
        soct_khach_hang ( ten_khach_hang ),
        soct_users ( full_name )`)
      .not('report', 'is', null)
      .neq('report', '')
      .eq('ket_qua', 'Hoàn thành')
      .order('ngay', { ascending: true })

    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching phieu cung:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Đánh dấu đã nộp / chưa nộp (chỉ người phụ trách: admin/tech_admin/staff)
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const { id, da_nop_phieu } = await request.json()
    if (!id) return NextResponse.json({ error: 'Thiếu ID phiếu' }, { status: 400 })

    const nop = !!da_nop_phieu
    const { data, error } = await supabaseAdmin
      .from('soct_cong_viec')
      .update({ da_nop_phieu: nop, ngay_nop_phieu: nop ? new Date().toISOString().split('T')[0] : null })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error updating phieu cung:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Nhắc KTV còn nợ phiếu qua Telegram (DM tới từng KTV đã liên kết)
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const onlyKtvId: string | undefined = body.ktv_id // nhắc riêng 1 KTV (tùy chọn)

    const cfg = await getCauHinh()
    const nguong = parseInt(cfg.phieu_cung_canh_bao_ngay || '3') || 3
    const today = new Date(); today.setHours(0, 0, 0, 0)

    // Lấy các phiếu chưa nộp (có số phiếu + hoàn thành + đã gán KTV)
    const { data: rows, error } = await supabaseAdmin
      .from('soct_cong_viec')
      .select('report, ngay, ktv_id')
      .not('report', 'is', null)
      .neq('report', '')
      .eq('ket_qua', 'Hoàn thành')
      .eq('da_nop_phieu', false)
      .not('ktv_id', 'is', null)
    if (error) throw error

    // Gom theo KTV
    const byKtv = new Map<string, { report: string, ngay: string, tre: boolean }[]>()
    for (const r of rows || []) {
      if (onlyKtvId && r.ktv_id !== onlyKtvId) continue
      const days = Math.floor((today.getTime() - new Date(r.ngay).getTime()) / 86400000)
      const arr = byKtv.get(r.ktv_id) || []
      arr.push({ report: r.report, ngay: r.ngay, tre: days >= nguong })
      byKtv.set(r.ktv_id, arr)
    }

    if (byKtv.size === 0) return NextResponse.json({ sent: 0, skipped: 0, message: 'Không có phiếu nào cần nhắc.' })

    // Lấy telegram_id + tên KTV
    const { data: users } = await supabaseAdmin
      .from('soct_users')
      .select('id, full_name, telegram_id')
      .in('id', [...byKtv.keys()])

    const fmtD = (s: string) => { const d = new Date(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` }
    let sent = 0, skipped = 0
    for (const u of users || []) {
      const list = byKtv.get(u.id) || []
      if (!u.telegram_id) { skipped++; continue }
      const dsp = list.map(x => `• Phiếu <b>${x.report}</b> (${fmtD(x.ngay)})${x.tre ? ' ⚠️ trễ' : ''}`).join('\n')
      const msg = `📄 <b>Nhắc hoàn trả phiếu cứng</b>\nXin chào ${u.full_name}, bạn còn <b>${list.length}</b> phiếu chưa nộp bản cứng về văn phòng:\n${dsp}\n\nVui lòng hoàn trả sớm. Cảm ơn!`
      const ok = await sendTelegramMessage(u.telegram_id, msg)
      if (ok) sent++; else skipped++
    }

    return NextResponse.json({ sent, skipped, ktv: byKtv.size })
  } catch (error: any) {
    console.error('Error reminding phieu cung:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
