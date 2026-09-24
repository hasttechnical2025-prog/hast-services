import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { broadcastLenhXuatChanged } from '@/lib/realtime'

export const runtime = 'nodejs'

// ===== THU TIỀN + XÁC THỰC (Lát 5, luồng KINH DOANH) — bảng soct_thu_tien (mig 82) =====
// Chống biển thủ: NV/sale_admin KHAI từng khoản thu/đặt cọc (trạng thái 'cho_duyet') -> kthc DUYỆT
// ('da_duyet', đã cầm cash nộp quỹ) -> mới tính vào "đã thu"/công nợ. KHÔNG đụng soct_hd_thu (kỹ thuật).
// Chỉ khai/duyệt khi lệnh ĐÃ SANG CỘT 2 (Đang xử lý HĐ trở đi) — lúc đó kthc mới nhìn thấy.

const COT2_TRO_DI = ['Đang xử lý HĐ', 'Đã lên hóa đơn', 'Đã thanh toán']

async function isSaleAdmin(session: any): Promise<boolean> {
  if (session.role === 'admin') return true
  if (session.role !== 'kinh_doanh') return false
  const { data } = await supabaseAdmin.from('soct_users').select('kd_quan_ly').eq('id', session.id).maybeSingle()
  return !!data?.kd_quan_ly
}

// GET ?lenh_id=... -> danh sách khoản thu của 1 lệnh (kèm tên người ghi/duyệt). Scope: NV chỉ lệnh của mình.
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'kthc', 'kinh_doanh')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const lenhId = searchParams.get('lenh_id')
    if (!lenhId) return NextResponse.json({ error: 'Thiếu lenh_id' }, { status: 400 })

    // Kinh doanh thường chỉ xem khoản của lệnh MÌNH.
    if (session.role === 'kinh_doanh' && !(await isSaleAdmin(session))) {
      const { data: lenh } = await supabaseAdmin.from('soct_lenh_xuat').select('nguoi_kinh_doanh_id').eq('id', lenhId).maybeSingle()
      if (!lenh || lenh.nguoi_kinh_doanh_id !== session.id) {
        return NextResponse.json({ error: 'Không có quyền xem khoản thu của lệnh này' }, { status: 403 })
      }
    }

    const rows = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_thu_tien')
      .select(`*, ng_ghi:soct_users!nguoi_ghi(full_name), ng_duyet:soct_users!nguoi_duyet(full_name)`)
      .eq('lenh_id', lenhId).order('thoi_diem', { ascending: true }).range(from, to))

    const data = (rows || []).map((r: any) => ({
      id: r.id, so_tien: Number(r.so_tien) || 0, loai: r.loai, trang_thai: r.trang_thai,
      so_hoa_don: r.so_hoa_don, ghi_chu: r.ghi_chu, thoi_diem: r.thoi_diem, duyet_luc: r.duyet_luc,
      nguoi_ghi: r.nguoi_ghi, nguoi_ghi_ten: r.ng_ghi?.full_name || '',
      nguoi_duyet_ten: r.ng_duyet?.full_name || '',
    }))
    const daDuyet = data.filter(x => x.trang_thai === 'da_duyet').reduce((s, x) => s + x.so_tien, 0)
    const choDuyet = data.filter(x => x.trang_thai === 'cho_duyet').reduce((s, x) => s + x.so_tien, 0)
    return NextResponse.json({ data, da_duyet: Math.round(daDuyet), cho_duyet: Math.round(choDuyet) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST -> KHAI khoản thu/đặt cọc (NV/sale_admin/kthc/admin). Lệnh phải đã sang cột 2+.
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'kthc', 'kinh_doanh')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    const b = await request.json()
    const lenhId = b.lenh_id
    const soTien = Math.round(Number(b.so_tien) || 0)
    const loai = b.loai === 'dat_coc' ? 'dat_coc' : 'thanh_toan'
    if (!lenhId) return NextResponse.json({ error: 'Thiếu lenh_id' }, { status: 400 })
    if (soTien <= 0) return NextResponse.json({ error: 'Số tiền phải lớn hơn 0.' }, { status: 400 })

    const { data: lenh } = await supabaseAdmin
      .from('soct_lenh_xuat').select('nguoi_kinh_doanh_id, tren_kanban, trang_thai_hd, so_hoa_don').eq('id', lenhId).maybeSingle()
    if (!lenh) return NextResponse.json({ error: 'Không tìm thấy lệnh' }, { status: 404 })
    if (!lenh.tren_kanban || !COT2_TRO_DI.includes(lenh.trang_thai_hd)) {
      return NextResponse.json({ error: 'Chỉ khai thu tiền khi lệnh đã bàn giao kế toán (từ cột 2 trở đi).' }, { status: 409 })
    }
    // NV thường: chỉ khai cho lệnh của mình.
    if (session.role === 'kinh_doanh' && !(await isSaleAdmin(session)) && lenh.nguoi_kinh_doanh_id !== session.id) {
      return NextResponse.json({ error: 'Không có quyền khai thu cho lệnh này' }, { status: 403 })
    }

    const { error } = await supabaseAdmin.from('soct_thu_tien').insert({
      lenh_id: lenhId, nguon: 'lenh_xuat', so_hoa_don: lenh.so_hoa_don || null,
      so_tien: soTien, loai, trang_thai: 'cho_duyet', nguoi_ghi: session.id,
      ghi_chu: (b.ghi_chu || '').trim() || null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit(session, 'Khai thu tiền lệnh xuất', `${loai} ${soTien.toLocaleString('vi-VN')} · lệnh ${lenhId}`)
    await broadcastLenhXuatChanged()
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PUT -> DUYỆT khoản (chỉ kthc/admin). Đóng dấu người duyệt + thời điểm + lấy số HĐ hiện tại của lệnh.
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin', 'kthc')
    if (!session) return NextResponse.json({ error: 'Chỉ kế toán (KT-HC) mới được duyệt khoản thu.' }, { status: 401 })
    const b = await request.json()
    const id = b.id
    if (!id) return NextResponse.json({ error: 'Thiếu id khoản thu' }, { status: 400 })

    const { data: kh } = await supabaseAdmin.from('soct_thu_tien').select('trang_thai, lenh_id').eq('id', id).maybeSingle()
    if (!kh) return NextResponse.json({ error: 'Không tìm thấy khoản thu' }, { status: 404 })
    if (kh.trang_thai === 'da_duyet') return NextResponse.json({ error: 'Khoản này đã duyệt.' }, { status: 409 })

    // Lấy số HĐ hiện tại của lệnh (có thể vừa lên HĐ sau khi đặt cọc) để đối chiếu báo cáo.
    const { data: lenh } = await supabaseAdmin.from('soct_lenh_xuat').select('so_hoa_don').eq('id', kh.lenh_id).maybeSingle()

    const { error } = await supabaseAdmin.from('soct_thu_tien').update({
      trang_thai: 'da_duyet', nguoi_duyet: session.id, duyet_luc: new Date().toISOString(),
      so_hoa_don: lenh?.so_hoa_don || undefined,
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit(session, 'Duyệt thu tiền lệnh xuất', `khoản ${id}`)
    await broadcastLenhXuatChanged()
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE ?id=... -> HỦY khoản CHƯA duyệt. Người ghi tự hủy được; kthc/admin hủy bất kỳ khoản chờ duyệt.
export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin', 'kthc', 'kinh_doanh')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu id khoản thu' }, { status: 400 })

    const { data: kh } = await supabaseAdmin.from('soct_thu_tien').select('trang_thai, nguoi_ghi').eq('id', id).maybeSingle()
    if (!kh) return NextResponse.json({ error: 'Không tìm thấy khoản thu' }, { status: 404 })
    if (kh.trang_thai === 'da_duyet') {
      return NextResponse.json({ error: 'Khoản đã duyệt — không hủy được (nhờ kế toán điều chỉnh nếu sai).' }, { status: 409 })
    }
    const isKeToan = session.role === 'admin' || session.role === 'kthc'
    if (!isKeToan && kh.nguoi_ghi !== session.id) {
      return NextResponse.json({ error: 'Chỉ người khai hoặc kế toán mới hủy được khoản này.' }, { status: 403 })
    }

    const { error } = await supabaseAdmin.from('soct_thu_tien').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit(session, 'Hủy khoản thu lệnh xuất', `khoản ${id}`)
    await broadcastLenhXuatChanged()
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
