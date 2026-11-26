import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { broadcastJobsChanged } from '@/lib/realtime'
import { logAudit } from '@/lib/audit'
import { LOAI_HD_BAO_TRI } from '@/lib/bao-tri'

export const runtime = 'nodejs'

const sanitize = (s: string) => String(s || '').replace(/[^A-Za-z0-9]+/g, '').slice(0, 40)

// POST { so_hddv, nam, ten_dong, kieu?, dvt? }: gom mọi máy HĐBT/MF cùng Số HĐDV -> 1 phiếu billing
// phí bảo trì (nguon='phi_bao_tri') đẩy vào Kanban cột "Chờ xuất HĐ". Dòng dịch vụ = ten_dong.
// Hai dạng dòng (mẫu hóa đơn thật):
//   • "theo_may": mọi máy ĐỒNG GIÁ -> ĐVT "Máy", SL = số máy, đơn giá = đơn giá/máy, thành tiền = SL×đơn giá.
//   • "gop":      LỆCH GIÁ (hoặc staff chọn gộp) -> ĐVT "Năm", SL = 1, đơn giá = thành tiền = TỔNG (Σ máy).
// Nếu không gửi `kieu`, server TỰ nhận: đồng giá -> theo_may, lệch -> gop. Chống lập trùng report PBT-<năm>-<hddv>.
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const body = await request.json()
    const so_hddv = String(body.so_hddv || '').trim()
    const nam = parseInt(String(body.nam || ''), 10)
    const ten_dong = String(body.ten_dong || '').trim()
    if (!so_hddv) return NextResponse.json({ error: 'Thiếu Số HĐDV' }, { status: 400 })
    if (!/^\d{4}$/.test(String(nam))) return NextResponse.json({ error: 'Năm không hợp lệ' }, { status: 400 })
    if (!ten_dong) return NextResponse.json({ error: 'Thiếu nội dung dòng dịch vụ' }, { status: 400 })

    // Gom máy cùng Số HĐDV (chỉ HĐBT/MF), chỉ máy có đơn giá > 0.
    const { data: mays, error: mErr } = await supabaseAdmin
      .from('soct_khach_hang')
      .select('id, don_gia_bt, so_thang_bt, loai_hd')
      .eq('so_hddv', so_hddv)
      .in('loai_hd', LOAI_HD_BAO_TRI)
    if (mErr) throw mErr
    const list = (mays || []).filter((m: any) => Number(m.don_gia_bt) > 0)
    if (list.length === 0) return NextResponse.json({ error: 'HĐ này chưa có máy nào có đơn giá phí BT (>0).' }, { status: 400 })

    const soMay = list.length
    const idKhachHang = list[0].id
    // Số tháng/máy: NULL = 12 (đủ kỳ). Thành tiền máy (chính xác) = đơn giá × số tháng / 12. Đơn giá có thể LẺ.
    const thangOf = (m: any) => { const t = m.so_thang_bt == null ? 12 : parseInt(String(m.so_thang_bt), 10); return Number.isFinite(t) ? Math.min(12, Math.max(0, t)) : 12 }
    const ttOf = (m: any) => Number(m.don_gia_bt) * thangOf(m) / 12
    const giaSet = new Set(list.map((m: any) => Math.round(Number(m.don_gia_bt)))) // so sánh đồng giá (làm tròn)
    const allFull = list.every((m: any) => thangOf(m) === 12) // mọi máy đủ 12 tháng
    // TỔNG = LÀM TRÒN tổng thành tiền chính xác (Σ số lẻ rồi mới làm tròn) để khớp office tới từng đồng.
    const donGong = Math.round(list.reduce((s: number, m: any) => s + ttOf(m), 0))

    // Dạng dòng: "Theo máy" (SL = số máy, đơn giá nguyên) chỉ hợp lệ khi ĐỒNG GIÁ và MỌI máy đủ 12 tháng.
    // Lệch giá hoặc có máy thiếu tháng -> thành tiền mỗi máy khác nhau -> phải Gộp cả kỳ.
    const theoMayOk = giaSet.size === 1 && allFull
    const kieu = (body.kieu === 'theo_may' || body.kieu === 'gop') ? body.kieu : (theoMayOk ? 'theo_may' : 'gop')
    if (kieu === 'theo_may' && !theoMayOk) {
      return NextResponse.json({ error: 'Đơn giá lệch hoặc có máy không đủ 12 tháng — chọn dạng "Gộp cả kỳ".' }, { status: 400 })
    }

    // SL / ĐVT / đơn giá / thành tiền theo dạng dòng.
    let soLuong: number, donGia: number, thanhTien: number, dvt: string
    if (kieu === 'theo_may') {
      soLuong = soMay
      donGia = Number(list[0].don_gia_bt)        // giữ nguyên thập phân cho đồng-giá (vd 1666666.667)
      thanhTien = Math.round(soMay * donGia)      // thành tiền làm tròn tới đồng
      dvt = String(body.dvt || '').trim() || 'Máy'
    } else {
      soLuong = 1
      donGia = donGong
      thanhTien = donGong
      dvt = String(body.dvt || '').trim() || 'Năm'
    }

    const report = `PBT-${nam}-${sanitize(so_hddv)}`
    const { data: existed } = await supabaseAdmin.from('soct_cong_viec').select('id').eq('report', report).maybeSingle()
    if (existed) return NextResponse.json({ error: `HĐ số ${so_hddv} đã lập phí bảo trì cho năm ${nam} rồi (thu hồi phiếu cũ nếu muốn lập lại).` }, { status: 409 })

    const ngay = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
    const { data: phieu, error: pErr } = await supabaseAdmin
      .from('soct_cong_viec')
      .insert({
        ngay,
        id_khach_hang: idKhachHang,
        loai_cong_viec: 'Phí bảo trì',
        ket_qua: 'Hoàn thành',
        trang_thai_hd: 'Chờ xuất HĐ',
        nguon: 'phi_bao_tri',
        report,
        so_luong: 1,
        created_by: session.id,
        telegram_sent: true,
      })
      .select('id')
      .single()
    if (pErr) throw pErr

    const { error: vtErr } = await supabaseAdmin.from('soct_chi_tiet_vat_tu').insert({
      id_cong_viec: phieu.id,
      ma_hang: 'PHIBT',
      so_luong: soLuong,
      don_gia: donGia,
      vat: 8,
      thanh_tien: thanhTien,
      hoa_don: false,
      ten_hang_hd: ten_dong,
      don_vi_tinh: dvt,
      thu_tu: 0,
    })
    if (vtErr) throw vtErr

    await logAudit(session, 'Đẩy phí bảo trì sang Kanban', `HĐ ${so_hddv} năm ${nam} [${kieu}]: ${soMay} máy, tổng ${thanhTien.toLocaleString('vi-VN')} -> phiếu ${phieu.id}`)
    await broadcastJobsChanged()
    return NextResponse.json({ success: true, id_cong_viec: phieu.id, so_may: soMay, kieu, thanh_tien: thanhTien })
  } catch (error: any) {
    console.error('Error day-kanban phi-bao-tri:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
