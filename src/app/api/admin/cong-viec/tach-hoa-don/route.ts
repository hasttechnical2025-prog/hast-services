import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'
import { broadcastJobsChanged, broadcastCongNoChanged } from '@/lib/realtime'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// POST { id_goc, lines: [{ line_id, keep_qty }] }
// TÁCH HÓA ĐƠN theo SỐ LƯỢNG từng dòng: `keep_qty` = số lượng GIỮ ở phiếu gốc (lên HĐ); phần
// còn lại (so_luong - keep_qty) CHUYỂN sang 1 PHIẾU CON MỚI ('Chưa hóa đơn' -> ở lại Công nợ).
//  - keep_qty = full -> giữ nguyên dòng ở gốc. keep_qty = 0 -> chuyển CẢ dòng sang con.
//    0 < keep_qty < full -> XẺ ĐÔI: gốc giữ keep_qty, con nhận phần dư (cùng mã/đơn giá).
//  - Số phiếu con = số gốc + hậu tố tăng dần bắt đầu -1 (958026 -> 958026-1, -2, ...).
//  - Con: nguon='tach_hd' (ẩn khỏi Sổ công tác/Hoàn phiếu), phieu_goc_id trỏ gốc, KHÔNG gán KTV.
//    Không đụng kho (tổng SL không đổi; INSERT ket_qua='Hoàn thành' không kích hoạt trigger trừ kho).
export async function POST(request: Request) {
  try {
    const session = await requireTab('cong_no')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const body = await request.json()
    const idGoc = String(body.id_goc || '').trim()
    const lineReq: { line_id: string; keep_qty: number }[] = Array.isArray(body.lines)
      ? body.lines.map((x: any) => ({ line_id: String(x.line_id), keep_qty: Math.floor(Number(x.keep_qty)) }))
      : []
    if (!idGoc) return NextResponse.json({ error: 'Thiếu phiếu gốc' }, { status: 400 })

    // Lấy phiếu gốc + vật tư (đủ trường để xẻ dòng + tạo dòng con)
    const { data: goc, error: e1 } = await supabaseAdmin
      .from('soct_cong_viec')
      .select('id, ngay, id_khach_hang, ma_may, loai_cong_viec, report, mien_phi, trang_thai_hd, phieu_goc_id, soct_chi_tiet_vat_tu ( id, da_tra, ma_hang, so_luong, don_gia, vat, hoa_don, ten_hang_hd, don_vi_tinh, thu_tu )')
      .eq('id', idGoc)
      .single()
    if (e1 || !goc) return NextResponse.json({ error: 'Không tìm thấy phiếu gốc' }, { status: 404 })
    if (!['Chưa hóa đơn', 'Đã báo giá'].includes(goc.trang_thai_hd)) {
      return NextResponse.json({ error: 'Chỉ tách được phiếu đang ở Công nợ (Chưa hóa đơn / Đã báo giá).' }, { status: 409 })
    }

    const active = (goc.soct_chi_tiet_vat_tu || []).filter((v: any) => !v.da_tra)
    const keepMap = new Map<string, number>(lineReq.map(x => [x.line_id, x.keep_qty]))
    // Chuẩn hoá: keep kẹp trong [0, so_luong]; mặc định giữ hết nếu không gửi.
    let keptTotal = 0, movedTotal = 0
    const plan = active.map((v: any) => {
      const total = Number(v.so_luong) || 0
      const raw = keepMap.has(String(v.id)) ? Number(keepMap.get(String(v.id))) : total
      const keep = Math.max(0, Math.min(total, isFinite(raw) ? raw : total))
      keptTotal += keep; movedTotal += (total - keep)
      return { v, total, keep, move: total - keep }
    })
    if (keptTotal <= 0) return NextResponse.json({ error: 'Phải giữ lại ít nhất 1 (SL) để lên hóa đơn.' }, { status: 400 })
    if (movedTotal <= 0) return NextResponse.json({ error: 'Không có gì để tách (giữ hết số lượng).' }, { status: 400 })

    // Số phiếu con: base (bỏ hậu tố -N) + hậu tố kế tiếp trong nhánh cùng gốc.
    const base = String(goc.report || '').replace(/-\d+$/, '')
    if (!base) return NextResponse.json({ error: 'Phiếu gốc chưa có số phiếu — không tách được.' }, { status: 400 })
    const rootId = goc.phieu_goc_id || goc.id
    const { data: sib } = await supabaseAdmin
      .from('soct_cong_viec').select('report').eq('phieu_goc_id', rootId)
    let maxSuffix = 0
    for (const s of (sib || []) as any[]) {
      const m = String(s.report || '').match(/-(\d+)$/)
      if (m) maxSuffix = Math.max(maxSuffix, parseInt(m[1], 10))
    }
    const childReport = `${base}-${maxSuffix + 1}`

    // Tạo phiếu con
    const { data: child, error: e2 } = await supabaseAdmin
      .from('soct_cong_viec')
      .insert({
        ngay: goc.ngay,
        id_khach_hang: goc.id_khach_hang,
        ma_may: goc.ma_may || null,
        loai_cong_viec: goc.loai_cong_viec,
        so_luong: 1,
        km: 0,
        ket_qua: 'Hoàn thành',
        trang_thai_hd: 'Chưa hóa đơn',
        report: childReport,
        nguon: 'tach_hd',
        phieu_goc_id: rootId,
        mien_phi: !!goc.mien_phi,
        ghi_chu: `Tách từ phiếu ${goc.report} (phần chưa lên HĐ)`,
        created_by: session.id,
        telegram_sent: true,
      })
      .select('id, report')
      .single()
    if (e2) throw e2

    // Áp dụng theo plan (không đụng kho — tổng SL không đổi):
    //  - move = total (keep 0)  -> chuyển CẢ dòng sang con.
    //  - 0 < keep < total       -> gốc giữ keep (cập nhật so_luong+thanh_tien), con nhận dòng mới phần dư.
    const newChildLines: any[] = []
    for (const p of plan) {
      if (p.move <= 0) continue // giữ hết ở gốc
      const dg = Number(p.v.don_gia) || 0
      if (p.keep === 0) {
        const { error } = await supabaseAdmin.from('soct_chi_tiet_vat_tu').update({ id_cong_viec: child.id }).eq('id', p.v.id)
        if (error) throw error
      } else {
        // gốc giữ keep
        const { error: eu } = await supabaseAdmin.from('soct_chi_tiet_vat_tu')
          .update({ so_luong: p.keep, thanh_tien: dg * p.keep }).eq('id', p.v.id)
        if (eu) throw eu
        // con nhận phần dư (dòng mới)
        newChildLines.push({
          id_cong_viec: child.id, ma_hang: p.v.ma_hang, so_luong: p.move, don_gia: dg,
          vat: Number(p.v.vat) || 0, thanh_tien: dg * p.move, hoa_don: !!p.v.hoa_don,
          ten_hang_hd: p.v.ten_hang_hd ?? null, don_vi_tinh: p.v.don_vi_tinh ?? null, thu_tu: p.v.thu_tu ?? 0,
        })
      }
    }
    if (newChildLines.length > 0) {
      const { error: ei } = await supabaseAdmin.from('soct_chi_tiet_vat_tu').insert(newChildLines)
      if (ei) throw ei
    }

    await logAudit(session, 'Tách hóa đơn', `${goc.report} → giữ SL ${keptTotal} lên HĐ, tách SL ${movedTotal} sang ${childReport}`)
    await broadcastJobsChanged()
    await broadcastCongNoChanged()
    return NextResponse.json({ success: true, child_report: childReport, moved_qty: movedTotal })
  } catch (error: any) {
    console.error('Error tach-hoa-don:', error)
    return NextResponse.json({ error: error?.message || 'Lỗi tách hóa đơn' }, { status: 500 })
  }
}
