import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { broadcastJobsChanged } from '@/lib/realtime'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// GET: trả về danh sách tx_key các giao dịch ĐÃ đối chiếu trước đó -> client bỏ qua khi import lại
// (chống thu đúp). Chỉ kế toán.
export async function GET() {
  try {
    const session = await requireRole('admin', 'kthc')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    const { data } = await supabaseAdmin.from('soct_sao_ke_nh').select('tx_key')
    return NextResponse.json({ keys: (data || []).map((r: any) => r.tx_key) })
  } catch (error: any) {
    console.error('Error GET doi-chieu-nh:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST { items: [{ tx_key, ngan_hang, ref, ngay, so_tien, nguoi_chuyen, noi_dung, so_hoa_don, id_cong_viec, tong }] }
// Ghi nhận các cặp KHỚP đã được kế toán duyệt: đặt số đã thu = so_tien cho HĐ, đủ thì chuyển "Đã thanh
// toán" (mốc thu = NGÀY GIAO DỊCH ngân hàng để đúng kỳ cột 4), và lưu giao dịch vào soct_sao_ke_nh.
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'kthc')
    if (!session) return NextResponse.json({ error: 'Không có quyền ghi nhận thanh toán' }, { status: 401 })

    const { items } = await request.json()
    if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'Không có cặp nào để ghi nhận' }, { status: 400 })

    // Mốc thu = 12h trưa (giờ VN) của ngày giao dịch -> slice(0,7) ra đúng 'YYYY-MM' theo lịch VN.
    const tsFromNgay = (ngay: any) => {
      const s = String(ngay || '').slice(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00+07:00`).toISOString()
      return new Date(Date.now() + 7 * 3600 * 1000).toISOString()
    }

    let thu = 0, chuyen = 0
    const failed: { hd: string; reason: string }[] = []
    for (const it of items) {
      const so_hoa_don = String(it.so_hoa_don || '').trim()
      const so_tien = Number(it.so_tien) || 0
      const tong = Number(it.tong) || 0
      const tx_key = String(it.tx_key || '').trim()
      if (!so_hoa_don || so_tien <= 0 || !tx_key) { failed.push({ hd: so_hoa_don || '?', reason: 'Thiếu số HĐ / số tiền / khóa giao dịch' }); continue }

      // Bỏ qua nếu giao dịch này đã được ghi nhận trước đó (chống thu đúp khi import lại).
      const { data: existed } = await supabaseAdmin.from('soct_sao_ke_nh').select('id').eq('tx_key', tx_key).maybeSingle()
      if (existed) { failed.push({ hd: so_hoa_don, reason: 'Giao dịch đã đối chiếu trước đó' }); continue }

      // Đặt số đã thu = số tiền giao dịch (ghi đè, idempotent như import FAST).
      const { error: eThu } = await supabaseAdmin.from('soct_hd_thu')
        .upsert({ so_hoa_don, so_tien_da_thu: so_tien, updated_at: new Date().toISOString() }, { onConflict: 'so_hoa_don' })
      if (eThu) { failed.push({ hd: so_hoa_don, reason: eThu.message }); continue }
      thu++

      // Đủ (thu >= tổng, dung sai 1.000đ) -> chuyển các phiếu của HĐ sang 'Đã thanh toán'.
      const du = tong > 0 && so_tien + 1000 >= tong
      if (du) {
        const { error: eMove } = await supabaseAdmin.from('soct_cong_viec')
          .update({ trang_thai_hd: 'Đã thanh toán', thanh_toan_luc: tsFromNgay(it.ngay) })
          .eq('so_hoa_don', so_hoa_don)
          .eq('trang_thai_hd', 'Đã lên hóa đơn')
        if (eMove) { failed.push({ hd: so_hoa_don, reason: eMove.message }); continue }
        chuyen++
      }

      // Lưu vết giao dịch đã đối chiếu.
      await supabaseAdmin.from('soct_sao_ke_nh').insert({
        tx_key,
        ngan_hang: String(it.ngan_hang || '').trim() || null,
        ref: it.ref ? String(it.ref).trim() : null,
        ngay: /^\d{4}-\d{2}-\d{2}$/.test(String(it.ngay || '').slice(0, 10)) ? String(it.ngay).slice(0, 10) : null,
        so_tien,
        nguoi_chuyen: it.nguoi_chuyen ? String(it.nguoi_chuyen).slice(0, 300) : null,
        noi_dung: it.noi_dung ? String(it.noi_dung).slice(0, 500) : null,
        so_hoa_don,
        id_cong_viec: it.id_cong_viec || null,
        created_by: session.id,
      })
    }

    await logAudit(session, 'Đối chiếu sao kê ngân hàng', `ghi thu ${thu} HĐ, chuyển thanh toán ${chuyen}`)
    await broadcastJobsChanged()
    return NextResponse.json({ success: true, thu, chuyen, failed })
  } catch (error: any) {
    console.error('Error POST doi-chieu-nh:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
