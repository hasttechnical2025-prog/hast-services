import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'

// Lấy danh sách biên bản giám định kèm vật tư đề xuất
export async function GET(request: Request) {
  try {
    const session = await requireTab('theo_doi_may', 'theo_doi_may.giam_dinh')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const ma_may = searchParams.get('ma_may')
    const chuaThay = searchParams.get('chua_thay') // '1' -> chỉ lấy biên bản chưa thay

    let query = supabaseAdmin
      .from('soct_giam_dinh')
      .select(`
        *,
        soct_khach_hang ( ten_khach_hang, dia_chi, model ),
        soct_giam_dinh_vat_tu (
          id, ma_hang, so_luong, ghi_chu,
          soct_kho_hang ( ten_hang, model, ton_kho )
        )
      `)
      .order('ngay_giam_dinh', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (ma_may) query = query.eq('ma_may', ma_may)
    if (chuaThay === '1') query = query.eq('da_thay', false)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching giam_dinh:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Tạo biên bản giám định mới (kèm các dòng vật tư đề xuất)
export async function POST(request: Request) {
  try {
    const session = await requireTab('theo_doi_may', 'theo_doi_may.giam_dinh')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const body = await request.json()
    const {
      ma_may, id_khach_hang, ngay_giam_dinh, ktv_giam_dinh, vi_tri,
      so_dem, tinh_trang_may, da_bao_gia, ghi_chu, vat_tu
    } = body

    if (!ma_may) {
      return NextResponse.json({ error: 'Thiếu mã máy' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('soct_giam_dinh')
      .insert({
        ma_may,
        id_khach_hang: id_khach_hang || null,
        ngay_giam_dinh: ngay_giam_dinh || new Date().toISOString().split('T')[0],
        ktv_giam_dinh: ktv_giam_dinh || null,
        vi_tri: vi_tri || null,
        so_dem: so_dem ? parseInt(String(so_dem).replace(/\D/g, ''), 10) || null : null,
        tinh_trang_may: tinh_trang_may || null,
        da_bao_gia: !!da_bao_gia,
        ghi_chu: ghi_chu || null,
      })
      .select()
      .single()

    if (error) throw error

    await insertVatTu(data.id, vat_tu)

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error creating giam_dinh:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Cập nhật biên bản: sửa thông tin, đóng (đã thay), và/hoặc thay danh sách vật tư
export async function PUT(request: Request) {
  try {
    const session = await requireTab('theo_doi_may', 'theo_doi_may.giam_dinh')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const body = await request.json()
    const { id, vat_tu, ...fields } = body
    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID biên bản' }, { status: 400 })
    }

    const allowed = ['ma_may', 'id_khach_hang', 'ngay_giam_dinh', 'ktv_giam_dinh', 'vi_tri', 'so_dem', 'tinh_trang_may', 'da_bao_gia', 'da_thay', 'ngay_thay', 'so_report', 'ghi_chu']
    const updates: any = {}
    for (const k of allowed) {
      if (fields[k] === undefined) continue
      if (k === 'so_dem') updates[k] = fields[k] ? parseInt(String(fields[k]).replace(/\D/g, ''), 10) || null : null
      else if (k === 'da_bao_gia' || k === 'da_thay') updates[k] = !!fields[k]
      else updates[k] = fields[k] || null
    }

    const { data, error } = await supabaseAdmin
      .from('soct_giam_dinh')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Nếu gửi kèm danh sách vật tư -> thay toàn bộ dòng cũ
    if (Array.isArray(vat_tu)) {
      await supabaseAdmin.from('soct_giam_dinh_vat_tu').delete().eq('id_giam_dinh', id)
      await insertVatTu(id, vat_tu)
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error updating giam_dinh:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Xóa biên bản giám định (kéo theo vật tư nhờ ON DELETE CASCADE)
export async function DELETE(request: Request) {
  try {
    const session = await requireTab('theo_doi_may', 'theo_doi_may.giam_dinh')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID biên bản' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('soct_giam_dinh').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting giam_dinh:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

async function insertVatTu(id_giam_dinh: string, vat_tu: any) {
  if (!Array.isArray(vat_tu)) return
  const valid = vat_tu.filter((v: any) => v.ma_hang)
  if (valid.length === 0) return
  const rows = valid.map((v: any) => ({
    id_giam_dinh,
    ma_hang: v.ma_hang,
    so_luong: parseInt(v.so_luong, 10) || 1,
    ghi_chu: v.ghi_chu || null,
  }))
  const { error } = await supabaseAdmin.from('soct_giam_dinh_vat_tu').insert(rows)
  if (error) console.error('Lỗi thêm vật tư giám định:', error)
}
