import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { sendTelegramMessage } from '@/lib/telegram'
import { broadcastLeaveChanged } from '@/lib/realtime'
import { isLoai, isBuoi, tinhSoNgay, moTaKhoang, LOAI_LABEL } from '@/lib/nghi-phep'

const YMD = /^\d{4}-\d{2}-\d{2}$/
function esc(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// GET: danh sách đơn nghỉ của chính mình
export async function GET() {
  try {
    const session = await requireRole()
    if (!session) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const { data, error } = await supabaseAdmin
      .from('soct_nghi_phep')
      .select('id, loai, tu_ngay, den_ngay, buoi, so_ngay, ly_do, trang_thai, ghi_chu_duyet, created_at, decided_at')
      .eq('user_id', session.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ data: data || [] })
  } catch (error: any) {
    console.error('Error fetching nghi-phep (ktv):', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: đăng ký đơn nghỉ mới (trạng thái chờ duyệt) + báo nhóm Telegram
export async function POST(request: Request) {
  try {
    const session = await requireRole()
    if (!session) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const body = await request.json()
    const loai = body.loai
    const tu_ngay = body.tu_ngay
    const den_ngay = body.den_ngay || body.tu_ngay
    const buoi = body.buoi || 'ca_ngay'
    const ly_do = (body.ly_do || '').trim() || null

    if (!isLoai(loai)) return NextResponse.json({ error: 'Loại nghỉ không hợp lệ' }, { status: 400 })
    if (!YMD.test(tu_ngay || '') || !YMD.test(den_ngay || '')) return NextResponse.json({ error: 'Ngày không hợp lệ' }, { status: 400 })
    if (den_ngay < tu_ngay) return NextResponse.json({ error: 'Đến ngày phải sau hoặc bằng Từ ngày' }, { status: 400 })
    if (!isBuoi(buoi)) return NextResponse.json({ error: 'Buổi nghỉ không hợp lệ' }, { status: 400 })
    // Buổi lẻ chỉ áp cho nghỉ 1 ngày
    const buoiFinal = tu_ngay === den_ngay ? buoi : 'ca_ngay'
    const so_ngay = tinhSoNgay(tu_ngay, den_ngay, buoiFinal)
    if (so_ngay <= 0) return NextResponse.json({ error: 'Khoảng nghỉ không hợp lệ' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('soct_nghi_phep')
      .insert({ user_id: session.id, loai, tu_ngay, den_ngay, buoi: buoiFinal, so_ngay, ly_do })
      .select('id')
      .single()
    if (error) throw error

    // Báo nhóm office để tech_admin duyệt
    const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID
    if (groupChatId) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
      let msg = `🌴 <b>ĐĂNG KÝ NGHỈ — CHỜ DUYỆT</b>\n`
      msg += `👤 <b>${esc(session.full_name)}</b> đăng ký <b>${esc(LOAI_LABEL[loai])}</b>\n`
      msg += `🗓 ${esc(moTaKhoang(tu_ngay, den_ngay, buoiFinal))}\n`
      if (ly_do) msg += `📝 Lý do: ${esc(ly_do)}\n`
      if (appUrl) msg += `\n👉 <a href="${appUrl}/m">Mở app để duyệt</a>`
      await sendTelegramMessage(groupChatId, msg)
    }
    await broadcastLeaveChanged()

    return NextResponse.json({ data: { id: data.id } })
  } catch (error: any) {
    console.error('Error creating nghi-phep:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE ?id : tự hủy đơn của mình khi còn "chờ duyệt"
export async function DELETE(request: Request) {
  try {
    const session = await requireRole()
    if (!session) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })

    const { data: don, error: getErr } = await supabaseAdmin
      .from('soct_nghi_phep')
      .select('id, user_id, trang_thai')
      .eq('id', id)
      .single()
    if (getErr) throw getErr
    if (don.user_id !== session.id) return NextResponse.json({ error: 'Không phải đơn của bạn' }, { status: 403 })
    if (don.trang_thai !== 'cho_duyet') return NextResponse.json({ error: 'Chỉ hủy được đơn đang chờ duyệt' }, { status: 400 })

    const { error } = await supabaseAdmin.from('soct_nghi_phep').delete().eq('id', id)
    if (error) throw error
    await broadcastLeaveChanged()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting nghi-phep:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
