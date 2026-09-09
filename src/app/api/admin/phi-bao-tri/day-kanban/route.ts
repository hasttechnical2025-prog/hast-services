import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { broadcastJobsChanged } from '@/lib/realtime'
import { logAudit } from '@/lib/audit'
import { LOAI_HD_BAO_TRI } from '@/lib/bao-tri'

export const runtime = 'nodejs'

const sanitize = (s: string) => String(s || '').replace(/[^A-Za-z0-9]+/g, '').slice(0, 40)

// POST { so_hddv, nam, ten_dong }: gom mọi máy HĐBT/MF cùng Số HĐDV -> 1 phiếu billing phí bảo trì
// (nguon='phi_bao_tri') đẩy vào Kanban cột "Chờ xuất HĐ". SL = số máy, đơn giá = don_gia_bt (đồng
// nhất trong HĐ). Dòng dịch vụ = ten_dong (staff sửa tự do). Chống lập trùng theo report PBT-<năm>-<hddv>.
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

    // Gom máy cùng Số HĐDV (chỉ HĐBT/MF). SL = số máy; đơn giá phải đồng nhất.
    const { data: mays, error: mErr } = await supabaseAdmin
      .from('soct_khach_hang')
      .select('id, don_gia_bt, loai_hd')
      .eq('so_hddv', so_hddv)
      .in('loai_hd', LOAI_HD_BAO_TRI)
    if (mErr) throw mErr
    const list = (mays || []).filter((m: any) => Number(m.don_gia_bt) > 0)
    if (list.length === 0) return NextResponse.json({ error: 'HĐ này chưa có máy nào có đơn giá phí BT (>0).' }, { status: 400 })

    const giaSet = new Set(list.map((m: any) => Number(m.don_gia_bt)))
    if (giaSet.size > 1) {
      return NextResponse.json({ error: 'Đơn giá phí BT không đồng nhất giữa các máy cùng HĐ — sửa lại cho khớp trước khi lên hóa đơn.' }, { status: 400 })
    }
    const donGia = Math.round([...giaSet][0])
    const soMay = list.length
    const idKhachHang = list[0].id

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
      so_luong: soMay,
      don_gia: donGia,
      vat: 8,
      thanh_tien: soMay * donGia,
      hoa_don: false,
      ten_hang_hd: ten_dong,
      don_vi_tinh: 'Máy',
      thu_tu: 0,
    })
    if (vtErr) throw vtErr

    await logAudit(session, 'Đẩy phí bảo trì sang Kanban', `HĐ ${so_hddv} năm ${nam}: ${soMay} máy × ${donGia.toLocaleString('vi-VN')} -> phiếu ${phieu.id}`)
    await broadcastJobsChanged()
    return NextResponse.json({ success: true, id_cong_viec: phieu.id, so_may: soMay, don_gia: donGia })
  } catch (error: any) {
    console.error('Error day-kanban phi-bao-tri:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
