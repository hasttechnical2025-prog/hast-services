import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { broadcastJobsChanged } from '@/lib/realtime'
import { logAudit } from '@/lib/audit'

// POST: GỘP / TÁCH thủ công các thẻ ở Kanban CỘT 1 (Chờ xuất HĐ).
// Đơn vị gộp = hd_lo (lô đẩy, migration 85): 1 lô = 1 thẻ = 1 hóa đơn.
//  - gop : gán CHUNG 1 hd_lo mới cho nhóm phiếu đã chọn (>=2 phiếu, cùng khách).
//  - tach: xóa hd_lo cho các phiếu -> về thẻ lẻ; lô còn <=1 phiếu thì xóa nốt (khỏi lô 1-phiếu thừa).
// Chỉ tác động phiếu CÒN Ở "Chờ xuất HĐ" & CHƯA đóng dấu M-invoice (khớp feature chặn-reset HĐ).
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const body = await request.json()
    const action: string = body?.action
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : []

    if (action !== 'gop' && action !== 'tach') {
      return NextResponse.json({ error: 'Thao tác không hợp lệ' }, { status: 400 })
    }
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Thiếu phiếu để thao tác' }, { status: 400 })
    }
    if (action === 'gop' && ids.length < 2) {
      return NextResponse.json({ error: 'Chọn ít nhất 2 thẻ để gộp.' }, { status: 400 })
    }

    // Nạp phiếu đích để áp lan can.
    const { data: rows, error: loadErr } = await supabaseAdmin
      .from('soct_cong_viec')
      .select('id, report, trang_thai_hd, minvoice_luc, nguon, id_khach_hang, hd_lo, khoa_boi, soct_khach_hang ( ma_khach_cum )')
      .in('id', ids)
    if (loadErr) throw loadErr
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Không tìm thấy phiếu' }, { status: 404 })
    }

    // Lan can 4 — KHÓA: phiếu đang bị người KHÁC khóa -> non-admin không thao tác.
    if (session.role !== 'admin') {
      const locked = rows.find((r: any) => r.khoa_boi && r.khoa_boi !== session.id)
      if (locked) {
        const { data: u } = await supabaseAdmin.from('soct_users').select('full_name').eq('id', locked.khoa_boi).single()
        return NextResponse.json({ error: `Phiếu đang được ${u?.full_name || 'người khác'} khóa — không thao tác được.` }, { status: 403 })
      }
    }

    // Lan can 1 — chỉ cột 1 & chưa đóng dấu M-invoice.
    const viPham = rows.find((r: any) => r.trang_thai_hd !== 'Chờ xuất HĐ' || !!r.minvoice_luc)
    if (viPham) {
      return NextResponse.json({ error: 'Thẻ đã vào luồng hóa đơn — hãy "Thu hồi HĐ" ở Kanban trước rồi mới gộp/tách.' }, { status: 409 })
    }

    if (action === 'gop') {
      // Lan can 3 — Thuê/CPC & Phí bảo trì luôn 1 thẻ/phiếu.
      const billing = rows.find((r: any) => r.nguon === 'thue_cpc' || r.nguon === 'phi_bao_tri')
      if (billing) {
        return NextResponse.json({ error: 'Phiếu Thuê/CPC hoặc Phí bảo trì luôn đứng riêng — không gộp được.' }, { status: 409 })
      }
      // Lan can 2 — cùng khách (cụm hoặc điểm máy).
      const billKey = (r: any) => r.soct_khach_hang?.ma_khach_cum ? `cum:${r.soct_khach_hang.ma_khach_cum}` : `may:${r.id_khach_hang}`
      const keys = [...new Set(rows.map(billKey))]
      if (keys.length > 1) {
        return NextResponse.json({ error: 'Các phiếu khác khách hàng — không gộp chung hóa đơn.' }, { status: 409 })
      }

      const lo = `lo_${randomUUID()}`
      const { error: upErr } = await supabaseAdmin.from('soct_cong_viec').update({ hd_lo: lo }).in('id', ids)
      if (upErr) throw upErr

      await broadcastJobsChanged()
      const reports = rows.map((r: any) => r.report || '?').join(', ')
      await logAudit(session, 'Gộp lô HĐ', `${rows.length} phiếu: ${reports}`)
      return NextResponse.json({ success: true, hd_lo: lo, count: rows.length })
    }

    // action === 'tach': xóa hd_lo cho các phiếu được chọn.
    const loAffected = [...new Set(rows.map((r: any) => r.hd_lo).filter(Boolean))]
    const { error: upErr } = await supabaseAdmin.from('soct_cong_viec').update({ hd_lo: null }).in('id', ids)
    if (upErr) throw upErr

    // Tự thu dọn: lô nào còn <=1 phiếu thì xóa nốt (khỏi lô 1-phiếu thừa).
    if (loAffected.length) {
      const { data: rem } = await supabaseAdmin
        .from('soct_cong_viec')
        .select('id, hd_lo')
        .in('hd_lo', loAffected)
      const countByLo = new Map<string, string[]>()
      for (const r of (rem || []) as any[]) {
        if (!r.hd_lo) continue
        if (!countByLo.has(r.hd_lo)) countByLo.set(r.hd_lo, [])
        countByLo.get(r.hd_lo)!.push(r.id)
      }
      const orphanIds: string[] = []
      for (const list of countByLo.values()) if (list.length <= 1) orphanIds.push(...list)
      if (orphanIds.length) await supabaseAdmin.from('soct_cong_viec').update({ hd_lo: null }).in('id', orphanIds)
    }

    await broadcastJobsChanged()
    const reports = rows.map((r: any) => r.report || '?').join(', ')
    await logAudit(session, 'Tách lô HĐ', `${rows.length} phiếu: ${reports}`)
    return NextResponse.json({ success: true, count: rows.length })
  } catch (error: any) {
    console.error('Lỗi gộp/tách lô Kanban:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
