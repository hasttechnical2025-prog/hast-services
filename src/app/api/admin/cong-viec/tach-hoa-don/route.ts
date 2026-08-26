import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'
import { broadcastJobsChanged, broadcastCongNoChanged } from '@/lib/realtime'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// POST { id_goc, keep_line_ids: string[] }
// TÁCH HÓA ĐƠN: giữ các dòng vật tư `keep_line_ids` ở PHIẾU GỐC (để lên HĐ), CHUYỂN các dòng
// còn lại sang 1 PHIẾU CON MỚI (trạng thái 'Chưa hóa đơn' -> ở lại Công nợ chờ kỳ sau).
//  - Số phiếu con = số gốc + hậu tố tăng dần bắt đầu -1 (958026 -> 958026-1, -2, ...).
//  - Phiếu con: nguon='tach_hd' (ẩn khỏi Sổ công tác/Hoàn phiếu), phieu_goc_id trỏ về gốc,
//    KHÔNG gán KTV (không tính vào báo cáo KTV). Không đụng kho (chỉ di chuyển dòng, kho đã trừ
//    lúc Hoàn thành; INSERT ket_qua='Hoàn thành' không kích hoạt trigger trừ kho — trigger AFTER UPDATE).
export async function POST(request: Request) {
  try {
    const session = await requireTab('cong_no')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const body = await request.json()
    const idGoc = String(body.id_goc || '').trim()
    const keepIds: string[] = Array.isArray(body.keep_line_ids) ? body.keep_line_ids.map(String) : []
    if (!idGoc) return NextResponse.json({ error: 'Thiếu phiếu gốc' }, { status: 400 })

    // Lấy phiếu gốc + vật tư
    const { data: goc, error: e1 } = await supabaseAdmin
      .from('soct_cong_viec')
      .select('id, ngay, id_khach_hang, ma_may, loai_cong_viec, report, mien_phi, trang_thai_hd, phieu_goc_id, soct_chi_tiet_vat_tu ( id, da_tra )')
      .eq('id', idGoc)
      .single()
    if (e1 || !goc) return NextResponse.json({ error: 'Không tìm thấy phiếu gốc' }, { status: 404 })
    if (!['Chưa hóa đơn', 'Đã báo giá'].includes(goc.trang_thai_hd)) {
      return NextResponse.json({ error: 'Chỉ tách được phiếu đang ở Công nợ (Chưa hóa đơn / Đã báo giá).' }, { status: 409 })
    }

    const active = (goc.soct_chi_tiet_vat_tu || []).filter((v: any) => !v.da_tra)
    const keepSet = new Set(keepIds)
    const moveLines = active.filter((v: any) => !keepSet.has(String(v.id)))
    const keepLines = active.filter((v: any) => keepSet.has(String(v.id)))
    if (keepLines.length === 0) return NextResponse.json({ error: 'Phải giữ lại ít nhất 1 dòng để lên hóa đơn.' }, { status: 400 })
    if (moveLines.length === 0) return NextResponse.json({ error: 'Không có dòng nào để tách (mọi dòng đều giữ lại).' }, { status: 400 })

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

    // Chuyển các dòng còn lại sang phiếu con (không đụng kho)
    const moveIds = moveLines.map((v: any) => v.id)
    const { error: e3 } = await supabaseAdmin
      .from('soct_chi_tiet_vat_tu').update({ id_cong_viec: child.id }).in('id', moveIds)
    if (e3) throw e3

    await logAudit(session, 'Tách hóa đơn', `${goc.report} → giữ ${keepLines.length} dòng lên HĐ, tách ${moveLines.length} dòng sang ${childReport}`)
    await broadcastJobsChanged()
    await broadcastCongNoChanged()
    return NextResponse.json({ success: true, child_report: childReport, moved: moveLines.length })
  } catch (error: any) {
    console.error('Error tach-hoa-don:', error)
    return NextResponse.json({ error: error?.message || 'Lỗi tách hóa đơn' }, { status: 500 })
  }
}
