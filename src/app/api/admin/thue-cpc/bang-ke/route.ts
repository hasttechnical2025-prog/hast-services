import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { tinhDongMay, tinhTongBangKe, kyTruoc, MayBilling } from '@/lib/thue-cpc'

const MAY_BILLING_SELECT =
  'id, ten_khach_hang, ma_may, model, dia_chi, don_gia_bw, don_gia_mau, ' +
  'dinh_muc_mien_phi_bw, dinh_muc_mien_phi_mau, cam_ket_toi_thieu_bw, cam_ket_toi_thieu_mau, ' +
  'phi_thue_thang, vat_thue_cpc'

// GET: danh sách bảng kê (?thang_nam) hoặc chi tiết 1 bảng kê (?id)
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (id) {
      const { data: bk, error } = await supabaseAdmin
        .from('soct_thue_cpc_bk')
        .select('*, soct_khach_hang(ten_khach_hang, ma_may), soct_thue_cpc_hop_dong_khung(ten_hop_dong)')
        .eq('id', id)
        .single()
      if (error) throw error

      const { data: ct, error: ctErr } = await supabaseAdmin
        .from('soct_thue_cpc_bk_ct')
        .select('*, soct_khach_hang(ten_khach_hang, ma_may, model)')
        .eq('id_bk', id)
      if (ctErr) throw ctErr

      return NextResponse.json({ data: { ...bk, ct: ct || [] } })
    }

    const thang_nam = searchParams.get('thang_nam')
    let q = supabaseAdmin
      .from('soct_thue_cpc_bk')
      .select('id, thang_nam, loai, tong_truoc_vat, vat_rate, tong_sau_vat, so_hoa_don_ke_toan, created_at, soct_khach_hang(ten_khach_hang, ma_may), soct_thue_cpc_hop_dong_khung(ten_hop_dong)')
      .order('created_at', { ascending: false })
    if (thang_nam) q = q.eq('thang_nam', thang_nam)
    const { data, error } = await q
    if (error) throw error
    return NextResponse.json({ data: data || [] })
  } catch (error: any) {
    console.error('Error fetching bang-ke:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: tính & lưu bảng kê. Body { thang_nam, loai:'rieng'|'gop', id_khach_hang?|id_hop_dong_khung?, so_hoa_don_ke_toan? }
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const body = await request.json()
    const { thang_nam, loai } = body
    if (!/^\d{4}-\d{2}$/.test(thang_nam || '')) return NextResponse.json({ error: 'Tháng không hợp lệ (YYYY-MM)' }, { status: 400 })
    if (loai !== 'rieng' && loai !== 'gop') return NextResponse.json({ error: 'Loại bảng kê không hợp lệ' }, { status: 400 })

    const prev = kyTruoc(thang_nam)

    // 1. Lấy danh sách máy cần tính + vat_rate + phí cơ bản (nếu gộp)
    let mays: any[] = []
    let vatRate = 8
    let phiCoBan = 0
    let headerBase: any = { thang_nam, loai, so_hoa_don_ke_toan: body.so_hoa_don_ke_toan?.trim() || null, created_by: session.id }

    if (loai === 'rieng') {
      if (!body.id_khach_hang) return NextResponse.json({ error: 'Thiếu khách hàng' }, { status: 400 })
      const { data: mayData, error } = await supabaseAdmin.from('soct_khach_hang').select(MAY_BILLING_SELECT).eq('id', body.id_khach_hang).single()
      if (error) throw error
      const may: any = mayData
      mays = [may]
      vatRate = Number(may.vat_thue_cpc ?? 8)
      headerBase.id_khach_hang = body.id_khach_hang
    } else {
      if (!body.id_hop_dong_khung) return NextResponse.json({ error: 'Thiếu hợp đồng khung' }, { status: 400 })
      const { data: khungData, error: kErr } = await supabaseAdmin.from('soct_thue_cpc_hop_dong_khung').select('*').eq('id', body.id_hop_dong_khung).single()
      if (kErr) throw kErr
      const khung: any = khungData
      vatRate = Number(khung.vat_thue_cpc ?? 8)
      phiCoBan = Number(khung.phi_co_ban ?? 0)
      const { data: list, error: lErr } = await supabaseAdmin.from('soct_khach_hang').select(MAY_BILLING_SELECT).eq('id_hop_dong_khung', body.id_hop_dong_khung).order('ten_khach_hang')
      if (lErr) throw lErr
      mays = list || []
      headerBase.id_hop_dong_khung = body.id_hop_dong_khung
    }

    if (mays.length === 0) return NextResponse.json({ error: 'Không có máy nào để lập bảng kê' }, { status: 400 })

    // 2. Lấy counter kỳ này + kỳ trước cho các máy
    const mayIds = mays.map(m => m.id)
    const { data: counters, error: cErr } = await supabaseAdmin
      .from('soct_thue_cpc_counter')
      .select('id_khach_hang, thang_nam, so_bw, so_mau')
      .in('id_khach_hang', mayIds)
      .in('thang_nam', [thang_nam, prev])
    if (cErr) throw cErr
    const thisMap = new Map<string, any>()
    const prevMap = new Map<string, any>()
    for (const c of counters || []) {
      if (c.thang_nam === thang_nam) thisMap.set(c.id_khach_hang, c)
      else prevMap.set(c.id_khach_hang, c)
    }

    // 3. Tính từng dòng
    const dongList = mays.map(m => tinhDongMay(m as MayBilling, thisMap.get(m.id) || null, prevMap.get(m.id) || null))
    const { tong_truoc_vat, tong_sau_vat } = tinhTongBangKe(dongList, vatRate, phiCoBan)

    // 4. Lưu header
    const { data: header, error: hErr } = await supabaseAdmin
      .from('soct_thue_cpc_bk')
      .insert({ ...headerBase, tong_truoc_vat, vat_rate: vatRate, tong_sau_vat })
      .select('id')
      .single()
    if (hErr) throw hErr

    // 5. Lưu dòng chi tiết
    const ctRows = mays.map((m, i) => ({
      id_bk: header.id,
      id_khach_hang: m.id,
      so_bw_dau_ky: dongList[i].so_bw_dau_ky,
      so_bw_cuoi_ky: dongList[i].so_bw_cuoi_ky,
      so_mau_dau_ky: dongList[i].so_mau_dau_ky,
      so_mau_cuoi_ky: dongList[i].so_mau_cuoi_ky,
      so_bw_tinh_phi: dongList[i].so_bw_tinh_phi,
      so_mau_tinh_phi: dongList[i].so_mau_tinh_phi,
      tien_ban_in: Math.round(dongList[i].tien_ban_in),
      phi_thue_co_dinh: Math.round(dongList[i].phi_thue_co_dinh),
      thanh_tien: Math.round(dongList[i].thanh_tien),
    }))
    const { error: ctErr } = await supabaseAdmin.from('soct_thue_cpc_bk_ct').insert(ctRows)
    if (ctErr) throw ctErr

    return NextResponse.json({ data: { id: header.id, tong_truoc_vat, tong_sau_vat, vat_rate: vatRate } })
  } catch (error: any) {
    console.error('Error creating bang-ke:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT: cập nhật số hóa đơn kế toán. Body { id, so_hoa_don_ke_toan }
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    const body = await request.json()
    if (!body.id) return NextResponse.json({ error: 'Thiếu ID bảng kê' }, { status: 400 })
    const { data, error } = await supabaseAdmin
      .from('soct_thue_cpc_bk')
      .update({ so_hoa_don_ke_toan: body.so_hoa_don_ke_toan?.trim() || null })
      .eq('id', body.id)
      .select('id, so_hoa_don_ke_toan')
      .single()
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error updating bang-ke:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE ?id : xóa bảng kê (ct tự CASCADE)
export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu id bảng kê' }, { status: 400 })
    const { error } = await supabaseAdmin.from('soct_thue_cpc_bk').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting bang-ke:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
