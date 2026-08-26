import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { broadcastJobsChanged, broadcastCongNoChanged } from '@/lib/realtime'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// Ghi đè TÊN + ĐƠN GIÁ hàng hóa cho hóa đơn. Ba phạm vi:
//  - 'hoa_don' : ghi thẳng vào dòng phiếu (ten_hang_hd + don_gia THẬT). Dùng cho sửa lẻ + nhập Excel.
//  - 'khach'   : lưu MẪU theo khách (soct_ten_hang_rieng: ten_hang và/hoặc don_gia). KHÔNG tự áp.
//  - 'ap_khach': áp MẪU của khách vào các dòng phiếu (bấm nút -> buộc rà soát, không tự điền ngầm).

// Áp {ma_hang -> {ten?, gia?, thu_tu?}} vào dòng vật tư của ticketIds. ten: chuỗi (rỗng = trả tên
// kho) | undefined (giữ nguyên). gia: số | undefined (giữ nguyên). thu_tu: số (thứ tự dòng theo
// Excel) | undefined (giữ nguyên). Ghi cả thanh_tien = don_gia * so_luong.
async function applyToLines(ticketIds: string[], byMa: Map<string, { ten?: string; gia?: number; thu_tu?: number }>) {
  if (byMa.size === 0) return
  const { data: lines, error } = await supabaseAdmin
    .from('soct_chi_tiet_vat_tu').select('id, ma_hang, so_luong').in('id_cong_viec', ticketIds)
  if (error) throw error
  for (const l of (lines || []) as any[]) {
    const u = byMa.get(l.ma_hang)
    if (!u) continue
    const patch: any = {}
    if (u.ten !== undefined) patch.ten_hang_hd = String(u.ten).trim() || null
    if (u.gia !== undefined && Number.isFinite(u.gia)) { patch.don_gia = u.gia; patch.thanh_tien = u.gia * (Number(l.so_luong) || 0) }
    if (u.thu_tu !== undefined && Number.isFinite(u.thu_tu)) patch.thu_tu = u.thu_tu
    if (Object.keys(patch).length) {
      const { error: e2 } = await supabaseAdmin.from('soct_chi_tiet_vat_tu').update(patch).eq('id', l.id)
      if (e2) throw e2
    }
  }
}

// Chặn sửa tên/giá khi phiếu ĐÃ CHUYỂN SANG KẾ TOÁN (không còn ở "Chờ xuất HĐ").
// Bịt kẽ hở: gọi API trực tiếp, hoặc modal mở sẵn bị "kẹt" khi người khác đã kéo thẻ đi.
// Áp cho MỌI role (kể cả admin) cho nhất quán — muốn sửa thì kéo thẻ về cột "Chờ lên hóa đơn" trước.
// Trả về chuỗi lỗi nếu có phiếu bị khóa, ngược lại null.
async function lockedTickets(ticketIds: string[]): Promise<string | null> {
  if (ticketIds.length === 0) return null
  const { data, error } = await supabaseAdmin
    .from('soct_cong_viec').select('id, report, trang_thai_hd').in('id', ticketIds)
  if (error) throw error
  const locked = (data || []).filter((t: any) => t.trang_thai_hd !== 'Chờ xuất HĐ')
  if (locked.length === 0) return null
  const rep = locked.map((t: any) => t.report || t.id).slice(0, 3).join(', ')
  return `Phiếu đã chuyển sang kế toán — không sửa được (${rep}${locked.length > 3 ? '…' : ''}). Kéo thẻ về cột "Chờ lên hóa đơn" trước khi sửa.`
}

const parseGia = (v: any): number | undefined => {
  if (v === '' || v === null || v === undefined) return undefined
  const n = Number(String(v).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff', 'kthc')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const body = await request.json()
    const pham_vi = body.pham_vi

    if (pham_vi === 'hoa_don') {
      const ids: string[] = Array.isArray(body.ticket_ids) ? body.ticket_ids : []
      if (ids.length === 0) return NextResponse.json({ error: 'Thiếu phiếu' }, { status: 400 })
      const lockMsg = await lockedTickets(ids)
      if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 409 })
      // Chấp nhận 1 mục (ma_hang + ten_hang?/don_gia?) hoặc mảng items (nhập Excel).
      const items = Array.isArray(body.items) ? body.items
        : [{ ma_hang: body.ma_hang, ten_hang: body.ten_hang, don_gia: body.don_gia }]
      const byMa = new Map<string, { ten?: string; gia?: number; thu_tu?: number }>()
      for (const it of items) {
        const ma = String(it.ma_hang || '').trim()
        if (!ma) continue
        const tt = Number(it.thu_tu)
        byMa.set(ma, {
          ten: it.ten_hang !== undefined ? String(it.ten_hang) : undefined,
          gia: parseGia(it.don_gia),
          thu_tu: it.thu_tu !== undefined && Number.isFinite(tt) ? tt : undefined, // vị trí dòng Excel -> thứ tự
        })
      }
      if (byMa.size === 0) return NextResponse.json({ error: 'Không có mã hàng hợp lệ' }, { status: 400 })
      await applyToLines(ids, byMa)
      await logAudit(session, 'Sửa tên/giá hàng (hóa đơn)', `${byMa.size} mã · ${ids.length} phiếu`)

    } else if (pham_vi === 'khach') {
      const scope_key = String(body.scope_key || '').trim()
      const ma_hang = String(body.ma_hang || '').trim()
      if (!scope_key || !ma_hang) return NextResponse.json({ error: 'Thiếu khách / mã hàng' }, { status: 400 })
      const { data: cur } = await supabaseAdmin.from('soct_ten_hang_rieng')
        .select('ten_hang, don_gia').eq('scope_key', scope_key).eq('ma_hang', ma_hang).maybeSingle()
      const newTen = body.ten_hang !== undefined ? (String(body.ten_hang).trim() || null) : (cur?.ten_hang ?? null)
      const giaIn = parseGia(body.don_gia)
      const newGia = body.don_gia !== undefined ? (giaIn ?? null) : (cur?.don_gia ?? null)
      if (newTen == null && newGia == null) {
        await supabaseAdmin.from('soct_ten_hang_rieng').delete().eq('scope_key', scope_key).eq('ma_hang', ma_hang)
      } else {
        const { error } = await supabaseAdmin.from('soct_ten_hang_rieng')
          .upsert({ scope_key, ma_hang, ten_hang: newTen, don_gia: newGia, updated_at: new Date().toISOString() }, { onConflict: 'scope_key,ma_hang' })
        if (error) throw error
      }
      await logAudit(session, 'Lưu mẫu tên/giá khách', `${scope_key} · ${ma_hang}`)

    } else if (pham_vi === 'ap_khach') {
      const ids: string[] = Array.isArray(body.ticket_ids) ? body.ticket_ids : []
      const scope_key = String(body.scope_key || '').trim()
      if (ids.length === 0 || !scope_key) return NextResponse.json({ error: 'Thiếu phiếu / khách' }, { status: 400 })
      const lockMsg = await lockedTickets(ids)
      if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 409 })
      const { data: tpl } = await supabaseAdmin.from('soct_ten_hang_rieng')
        .select('ma_hang, ten_hang, don_gia').eq('scope_key', scope_key)
      const byMa = new Map<string, { ten?: string; gia?: number; thu_tu?: number }>()
      for (const t of (tpl || []) as any[]) {
        byMa.set(t.ma_hang, {
          ten: t.ten_hang != null ? String(t.ten_hang) : undefined,
          gia: t.don_gia != null ? Number(t.don_gia) : undefined,
        })
      }
      if (byMa.size === 0) return NextResponse.json({ error: 'Khách này chưa có mẫu tên/giá nào đã lưu.' }, { status: 400 })
      await applyToLines(ids, byMa)
      await logAudit(session, 'Áp mẫu tên/giá khách', `${scope_key} · ${ids.length} phiếu`)

    } else {
      return NextResponse.json({ error: 'Phạm vi không hợp lệ' }, { status: 400 })
    }

    await broadcastJobsChanged()
    await broadcastCongNoChanged()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error ten-hang-rieng:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
