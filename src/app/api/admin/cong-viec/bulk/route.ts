import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export const maxDuration = 120

const KET_QUA = ['Chờ nhận', 'Đang làm', 'Hoàn thành', 'Lắp tiếp']
const TT_HD = ['Chưa hóa đơn', 'Đã báo giá', 'Đã lên hóa đơn']

// Import hàng loạt phiếu giao việc (lịch sử) kèm vật tư. Client đã resolve
// id_khach_hang / ktv_id / ma_hang trước khi gửi.
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const { jobs } = await request.json()
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return NextResponse.json({ error: 'Không có dữ liệu để import' }, { status: 400 })
    }

    // Chuẩn hoá + validate từng phiếu
    const jobRows: any[] = []
    const jobVatTu: any[][] = [] // vật tư tương ứng theo index
    for (const j of jobs) {
      if (!j.id_khach_hang || !j.loai_cong_viec) continue // bỏ dòng thiếu bắt buộc
      const ket_qua = KET_QUA.includes(j.ket_qua) ? j.ket_qua : 'Hoàn thành'
      const trang_thai_hd = TT_HD.includes(j.trang_thai_hd) ? j.trang_thai_hd : 'Chưa hóa đơn'
      jobRows.push({
        ngay: j.ngay || new Date().toISOString().split('T')[0],
        ma_may: j.ma_may || null,
        id_khach_hang: j.id_khach_hang,
        loai_cong_viec: j.loai_cong_viec,
        km: Number(j.km) || 0,
        so_luong: parseInt(j.so_luong) || 1,
        ktv_id: j.ktv_id || null,
        report: j.report || null,
        ghi_chu: j.ghi_chu || null,
        ket_qua,
        trang_thai_hd,
      })
      jobVatTu.push(Array.isArray(j.vat_tu) ? j.vat_tu : [])
    }

    if (jobRows.length === 0) {
      return NextResponse.json({ error: 'Không có phiếu hợp lệ (thiếu mã máy/khách hoặc loại việc)' }, { status: 400 })
    }

    // Insert phiếu (trả về theo đúng thứ tự để gắn vật tư)
    const { data: inserted, error } = await supabaseAdmin
      .from('soct_cong_viec')
      .insert(jobRows)
      .select('id')
    if (error) throw error

    // Gắn vật tư cho từng phiếu vừa tạo
    const vatTuRows: any[] = []
    inserted!.forEach((row: any, i: number) => {
      for (const v of jobVatTu[i]) {
        if (!v.ma_hang || !(Number(v.so_luong) > 0)) continue
        const sl = parseInt(v.so_luong, 10) || 0
        const dg = parseFloat(v.don_gia) || 0
        vatTuRows.push({
          id_cong_viec: row.id, ma_hang: v.ma_hang, so_luong: sl, don_gia: dg,
          vat: parseFloat(v.vat) || 0, thanh_tien: dg * sl, hoa_don: !!v.hoa_don,
        })
      }
    })
    let vatTuCount = 0
    if (vatTuRows.length > 0) {
      const { error: vtErr, count } = await supabaseAdmin
        .from('soct_chi_tiet_vat_tu')
        .insert(vatTuRows, { count: 'exact' })
      if (vtErr) console.error('Lỗi thêm vật tư import:', vtErr)
      else vatTuCount = count || vatTuRows.length
    }

    await logAudit(session, 'Import phiếu giao việc', `${inserted!.length} phiếu, ${vatTuCount} dòng vật tư`)
    return NextResponse.json({ success: true, count: inserted!.length, vatTu: vatTuCount })
  } catch (error: any) {
    console.error('Lỗi bulk import cong-viec:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
