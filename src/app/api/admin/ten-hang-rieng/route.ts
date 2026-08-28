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
async function applyToLines(ticketIds: string[], byMa: Map<string, { ten?: string; gia?: number; thu_tu?: number; dvt?: string }>) {
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
    if (u.dvt !== undefined) patch.don_vi_tinh = String(u.dvt).trim() || null
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
      const byMa = new Map<string, { ten?: string; gia?: number; thu_tu?: number; dvt?: string }>()
      for (const it of items) {
        const ma = String(it.ma_hang || '').trim()
        if (!ma) continue
        const tt = Number(it.thu_tu)
        byMa.set(ma, {
          ten: it.ten_hang !== undefined ? String(it.ten_hang) : undefined,
          gia: parseGia(it.don_gia),
          thu_tu: it.thu_tu !== undefined && Number.isFinite(tt) ? tt : undefined, // vị trí dòng Excel -> thứ tự
          dvt: it.don_vi_tinh !== undefined ? String(it.don_vi_tinh) : undefined,   // ĐVT (rỗng -> null -> "Cái")
        })
      }
      if (byMa.size === 0) return NextResponse.json({ error: 'Không có mã hàng hợp lệ' }, { status: 400 })
      await applyToLines(ids, byMa)

      // Nhập Excel kèm scope_key -> LƯU LUÔN MẪU cho khách (tên/giá/ĐVT) để kỳ sau tự áp.
      const scopeSave = String(body.scope_key || '').trim()
      if (scopeSave) {
        const rows = [...byMa.entries()].map(([ma, u]) => ({
          scope_key: scopeSave, ma_hang: ma,
          ten_hang: u.ten !== undefined ? (String(u.ten).trim() || null) : null,
          don_gia: u.gia !== undefined && Number.isFinite(u.gia) ? u.gia : null,
          don_vi_tinh: u.dvt !== undefined ? (String(u.dvt).trim() || null) : null,
          updated_at: new Date().toISOString(),
        })).filter(r => r.ten_hang != null || r.don_gia != null || r.don_vi_tinh != null)
        if (rows.length) {
          const { error: eT } = await supabaseAdmin.from('soct_ten_hang_rieng').upsert(rows, { onConflict: 'scope_key,ma_hang' })
          if (eT) throw eT
        }
      }
      await logAudit(session, 'Sửa tên/giá/ĐVT hàng (hóa đơn)', `${byMa.size} mã · ${ids.length} phiếu${scopeSave ? ' + lưu mẫu khách' : ''}`)

    } else if (pham_vi === 'khach') {
      const scope_key = String(body.scope_key || '').trim()
      const ma_hang = String(body.ma_hang || '').trim()
      if (!scope_key || !ma_hang) return NextResponse.json({ error: 'Thiếu khách / mã hàng' }, { status: 400 })
      const { data: cur } = await supabaseAdmin.from('soct_ten_hang_rieng')
        .select('ten_hang, don_gia, don_vi_tinh').eq('scope_key', scope_key).eq('ma_hang', ma_hang).maybeSingle()
      const newTen = body.ten_hang !== undefined ? (String(body.ten_hang).trim() || null) : (cur?.ten_hang ?? null)
      const giaIn = parseGia(body.don_gia)
      const newGia = body.don_gia !== undefined ? (giaIn ?? null) : (cur?.don_gia ?? null)
      const newDvt = body.don_vi_tinh !== undefined ? (String(body.don_vi_tinh).trim() || null) : (cur?.don_vi_tinh ?? null)
      if (newTen == null && newGia == null && newDvt == null) {
        await supabaseAdmin.from('soct_ten_hang_rieng').delete().eq('scope_key', scope_key).eq('ma_hang', ma_hang)
      } else {
        const { error } = await supabaseAdmin.from('soct_ten_hang_rieng')
          .upsert({ scope_key, ma_hang, ten_hang: newTen, don_gia: newGia, don_vi_tinh: newDvt, updated_at: new Date().toISOString() }, { onConflict: 'scope_key,ma_hang' })
        if (error) throw error
      }
      // Áp NGAY vào dòng phiếu đang mở cho ĐÚNG mã hàng vừa sửa (không chỉ nhớ kỳ sau) — dùng chính
      // giá trị người dùng vừa nhập. Chặn nếu phiếu đã chuyển kế toán. ticket_ids do client gửi kèm.
      const ids: string[] = Array.isArray(body.ticket_ids) ? body.ticket_ids : []
      if (ids.length > 0) {
        const lockMsg = await lockedTickets(ids)
        if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 409 })
        const byMa = new Map<string, { ten?: string; gia?: number; thu_tu?: number; dvt?: string }>()
        byMa.set(ma_hang, {
          ten: body.ten_hang !== undefined ? String(body.ten_hang) : undefined,
          gia: parseGia(body.don_gia),
          dvt: body.don_vi_tinh !== undefined ? String(body.don_vi_tinh) : undefined,
        })
        await applyToLines(ids, byMa)
      }
      await logAudit(session, 'Lưu mẫu tên/giá/ĐVT khách', `${scope_key} · ${ma_hang}${ids.length ? ' + áp hóa đơn' : ''}`)

    } else if (pham_vi === 'ap_khach') {
      const ids: string[] = Array.isArray(body.ticket_ids) ? body.ticket_ids : []
      const scope_key = String(body.scope_key || '').trim()
      if (ids.length === 0 || !scope_key) return NextResponse.json({ error: 'Thiếu phiếu / khách' }, { status: 400 })
      const lockMsg = await lockedTickets(ids)
      if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 409 })
      const { data: tpl } = await supabaseAdmin.from('soct_ten_hang_rieng')
        .select('ma_hang, ten_hang, don_gia, don_vi_tinh').eq('scope_key', scope_key)
      const byMa = new Map<string, { ten?: string; gia?: number; thu_tu?: number; dvt?: string }>()
      for (const t of (tpl || []) as any[]) {
        byMa.set(t.ma_hang, {
          ten: t.ten_hang != null ? String(t.ten_hang) : undefined,
          gia: t.don_gia != null ? Number(t.don_gia) : undefined,
          dvt: t.don_vi_tinh != null ? String(t.don_vi_tinh) : undefined,
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
