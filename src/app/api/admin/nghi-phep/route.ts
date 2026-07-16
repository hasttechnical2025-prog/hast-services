import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { sendTelegramMessage } from '@/lib/telegram'
import { broadcastLeaveChanged } from '@/lib/realtime'
import { moTaKhoang, LOAI_LABEL, type Buoi, type LoaiNghi } from '@/lib/nghi-phep'

function esc(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const SEL = 'id, loai, tu_ngay, den_ngay, buoi, so_ngay, ly_do, trang_thai, ghi_chu_duyet, created_at, decided_at, soct_users!user_id ( full_name )'

// GET: ?count=1 -> số đơn chờ duyệt (badge). Mặc định -> { pending, upcoming }
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    if (new URL(request.url).searchParams.get('count')) {
      const { count, error } = await supabaseAdmin
        .from('soct_nghi_phep')
        .select('id', { count: 'exact', head: true })
        .eq('trang_thai', 'cho_duyet')
      if (error) throw error
      return NextResponse.json({ count: count || 0 })
    }

    const { data: pending, error: pErr } = await supabaseAdmin
      .from('soct_nghi_phep').select(SEL)
      .eq('trang_thai', 'cho_duyet')
      .order('tu_ngay', { ascending: true })
    if (pErr) throw pErr

    const { data: upcoming, error: uErr } = await supabaseAdmin
      .from('soct_nghi_phep').select(SEL)
      .eq('trang_thai', 'da_duyet')
      .gte('den_ngay', todayStr())
      .order('tu_ngay', { ascending: true })
    if (uErr) throw uErr

    return NextResponse.json({ pending: pending || [], upcoming: upcoming || [] })
  } catch (error: any) {
    console.error('Error fetching nghi-phep (admin):', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT: duyệt / từ chối. Body { id, action:'duyet'|'tu_choi', ghi_chu? }
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const body = await request.json()
    const { id, action } = body
    const ghi_chu = (body.ghi_chu || '').trim() || null
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })
    if (action !== 'duyet' && action !== 'tu_choi') return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 })

    const trang_thai = action === 'duyet' ? 'da_duyet' : 'tu_choi'
    const { data: row, error } = await supabaseAdmin
      .from('soct_nghi_phep')
      .update({ trang_thai, nguoi_duyet_id: session.id, ghi_chu_duyet: ghi_chu, decided_at: new Date().toISOString() })
      .eq('id', id)
      .eq('trang_thai', 'cho_duyet') // chỉ duyệt đơn đang chờ (tránh double)
      .select('id, user_id, loai, tu_ngay, den_ngay, buoi, so_ngay, soct_users!user_id ( full_name, telegram_id )')
      .single()
    if (error) {
      if (error.code === 'PGRST116') return NextResponse.json({ error: 'Đơn đã được xử lý hoặc không tồn tại' }, { status: 409 })
      throw error
    }

    const u: any = row.soct_users
    const khoang = moTaKhoang(row.tu_ngay, row.den_ngay, row.buoi as Buoi)
    const loaiLabel = LOAI_LABEL[row.loai as LoaiNghi]

    // Báo riêng người đăng ký
    if (u?.telegram_id) {
      const t = action === 'duyet'
        ? `✅ <b>Đơn nghỉ đã được DUYỆT</b>\n${esc(loaiLabel)}: ${esc(khoang)}${ghi_chu ? `\n📝 ${esc(ghi_chu)}` : ''}`
        : `❌ <b>Đơn nghỉ bị TỪ CHỐI</b>\n${esc(loaiLabel)}: ${esc(khoang)}${ghi_chu ? `\n📝 Lý do: ${esc(ghi_chu)}` : ''}`
      await sendTelegramMessage(u.telegram_id, t)
    }
    // Báo nhóm khi đã duyệt (cả team nắm ai nghỉ)
    const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID
    if (groupChatId && action === 'duyet') {
      await sendTelegramMessage(groupChatId, `✅ <b>${esc(u?.full_name)}</b> nghỉ <b>${esc(loaiLabel)}</b>: ${esc(khoang)} — đã duyệt bởi <b>${esc(session.full_name)}</b>.`)
    }
    await broadcastLeaveChanged()

    return NextResponse.json({ data: { id: row.id, trang_thai } })
  } catch (error: any) {
    console.error('Error deciding nghi-phep:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
