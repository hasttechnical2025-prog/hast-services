import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { broadcastJobsChanged, broadcastThueCpcChanged } from '@/lib/realtime'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// POST { id }: sinh 1 PHIẾU giao việc từ bảng kê Thuê/CPC -> đẩy vào Kanban (cột "Chờ lên hóa đơn")
// cho kthc lên hóa đơn. Dòng vật tư = dịch vụ thuê máy + số bản (đen/màu) [+ card reader nếu gộp].
// - rieng: 1 máy, giá theo máy. gop: hợp đồng khung, giá cấp khung, tên người mua = tên hợp đồng.
// - Phiếu đánh dấu nguon='thue_cpc' (ẩn khỏi Sổ công tác). Vẫn xuất Word bảng kê song song.

type Line = { ma_hang: string; ten: string; dvt: string; sl: number; dg: number }

export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: 'Thiếu id bảng kê' }, { status: 400 })

    const { data: bk, error } = await supabaseAdmin
      .from('soct_thue_cpc_bk')
      .select('*, soct_thue_cpc_hop_dong_khung(ten_hop_dong, phi_co_ban, don_gia_bw, don_gia_mau, mien_phi_bw, mien_phi_mau, card_reader)')
      .eq('id', id).single()
    if (error) throw error

    // Chống đẩy trùng: nếu đã có phiếu liên kết còn tồn tại -> chặn.
    if (bk.id_cong_viec) {
      const { data: existed } = await supabaseAdmin.from('soct_cong_viec').select('id, report').eq('id', bk.id_cong_viec).maybeSingle()
      if (existed) return NextResponse.json({ error: 'Bảng kê này đã đẩy sang Kanban rồi. Thu hồi/xóa phiếu cũ nếu muốn đẩy lại.' }, { status: 409 })
    }

    const { data: ct, error: ctErr } = await supabaseAdmin
      .from('soct_thue_cpc_bk_ct')
      .select('*, soct_khach_hang(id, ten_khach_hang, model, don_gia_bw, don_gia_mau, phi_thue_thang)')
      .eq('id_bk', id)
    if (ctErr) throw ctErr
    const rows = ct || []
    if (rows.length === 0) return NextResponse.json({ error: 'Bảng kê không có dòng nào' }, { status: 400 })

    const [nam, thang] = String(bk.thang_nam).split('-')
    const kyLabel = `tháng ${Number(thang)}/${nam}`
    const vat = Number(bk.vat_rate ?? 8)

    const lines: Line[] = []
    let idKhachHang: string
    let tenKhachHd: string | null = null

    if (bk.loai === 'gop') {
      const khung: any = bk.soct_thue_cpc_hop_dong_khung || {}
      let sumBw = 0, sumMau = 0, sumRental = 0
      for (const r of rows as any[]) {
        sumBw += (r.so_bw_cuoi_ky || 0) - (r.so_bw_dau_ky || 0)
        sumMau += (r.so_mau_cuoi_ky || 0) - (r.so_mau_dau_ky || 0)
        sumRental += Number(r.soct_khach_hang?.phi_thue_thang || 0)
      }
      const tpBw = Math.max(sumBw - Number(khung.mien_phi_bw || 0), 0)
      const tpMau = Math.max(sumMau - Number(khung.mien_phi_mau || 0), 0)
      const giaThue = Number(khung.phi_co_ban || 0) + sumRental
      const card = Number(khung.card_reader || 0)
      if (giaThue > 0) lines.push({ ma_hang: 'DVTM', ten: `Dịch vụ thuê máy ${kyLabel}`, dvt: 'Tháng', sl: 1, dg: giaThue })
      if (tpBw > 0) lines.push({ ma_hang: 'DVBDT', ten: 'Số bản sử dụng đen trắng trong kỳ', dvt: 'Bản', sl: tpBw, dg: Number(khung.don_gia_bw || 0) })
      if (tpMau > 0) lines.push({ ma_hang: 'DVBM', ten: 'Số bản sử dụng màu trong kỳ', dvt: 'Bản', sl: tpMau, dg: Number(khung.don_gia_mau || 0) })
      if (card > 0) lines.push({ ma_hang: 'DVCR', ten: 'Dịch vụ đầu đọc thẻ', dvt: 'Chiếc', sl: 1, dg: card })
      idKhachHang = rows[0].id_khach_hang // 1 máy đại diện (MST/địa chỉ); tên người mua ghi đè bên dưới
      tenKhachHd = khung.ten_hop_dong || null
    } else {
      const r: any = rows[0]
      const kh: any = r.soct_khach_hang || {}
      if (Number(r.phi_thue_co_dinh) > 0) lines.push({ ma_hang: 'DVTM', ten: `Dịch vụ thuê máy ${kh.model || ''} ${kyLabel}`.replace(/\s+/g, ' ').trim(), dvt: 'Tháng', sl: 1, dg: Number(r.phi_thue_co_dinh) })
      if (Number(r.so_bw_tinh_phi) > 0) lines.push({ ma_hang: 'DVBDT', ten: 'Số bản sử dụng đen trắng trong kỳ', dvt: 'Bản', sl: Number(r.so_bw_tinh_phi), dg: Number(kh.don_gia_bw || 0) })
      if (Number(r.so_mau_tinh_phi) > 0) lines.push({ ma_hang: 'DVBM', ten: 'Số bản sử dụng màu trong kỳ', dvt: 'Bản', sl: Number(r.so_mau_tinh_phi), dg: Number(kh.don_gia_mau || 0) })
      idKhachHang = r.id_khach_hang
    }

    if (lines.length === 0) return NextResponse.json({ error: 'Bảng kê không có khoản tính phí (toàn 0đ) — không cần hóa đơn.' }, { status: 400 })

    // Ngày phiếu = hôm nay (giờ VN). trang_thai_hd='Chờ xuất HĐ' -> vào Kanban cột 1 ngay.
    // ket_qua='Hoàn thành' INSERT (không trigger trừ kho — trigger là AFTER UPDATE).
    const ngay = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
    const { data: phieu, error: pErr } = await supabaseAdmin
      .from('soct_cong_viec')
      .insert({
        ngay,
        id_khach_hang: idKhachHang,
        loai_cong_viec: 'Thuê/CPC',
        ket_qua: 'Hoàn thành',
        trang_thai_hd: 'Chờ xuất HĐ',
        nguon: 'thue_cpc',
        ten_khach_hd: tenKhachHd,
        report: `TC-${bk.thang_nam}-${String(idKhachHang).slice(0, 6)}`,
        so_luong: 1,
        created_by: session.id,
        telegram_sent: true,
      })
      .select('id')
      .single()
    if (pErr) throw pErr

    const vatTuInserts = lines.map((l, idx) => ({
      id_cong_viec: phieu.id,
      ma_hang: l.ma_hang,
      so_luong: Math.max(1, Math.round(l.sl)),
      don_gia: Math.round(l.dg),
      vat,
      thanh_tien: Math.round(l.sl) * Math.round(l.dg),
      hoa_don: false,
      ten_hang_hd: l.ten,      // tên hiển thị trên hóa đơn (động theo kỳ/model)
      don_vi_tinh: l.dvt,      // Tháng / Bản / Chiếc
      thu_tu: idx,
    }))
    const { error: vtErr } = await supabaseAdmin.from('soct_chi_tiet_vat_tu').insert(vatTuInserts)
    if (vtErr) throw vtErr

    // Liên kết bảng kê -> phiếu (chống đẩy trùng + truy vết)
    await supabaseAdmin.from('soct_thue_cpc_bk').update({ id_cong_viec: phieu.id }).eq('id', id)

    await logAudit(session, 'Đẩy bảng kê Thuê/CPC sang Kanban', `bảng kê ${id} -> phiếu ${phieu.id}`)
    await broadcastJobsChanged()
    await broadcastThueCpcChanged()
    return NextResponse.json({ success: true, id_cong_viec: phieu.id })
  } catch (error: any) {
    console.error('Error day-kanban thue-cpc:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
