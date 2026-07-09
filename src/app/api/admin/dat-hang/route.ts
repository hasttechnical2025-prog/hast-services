import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'

// Danh sách đơn đặt hàng kèm dòng chi tiết + các đợt hàng về
export async function GET() {
  try {
    const session = await requireTab('kho_hang', 'kho_hang.dat_hang')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    }

    const data = await selectAll((from, to) => supabaseAdmin
      .from('soct_dat_hang')
      .select(`
        id, ngay_dat, nha_cung_cap, so_don_hang, da_dat, hoan_thanh, ghi_chu,
        soct_dat_hang_ct (
          id, ma_hang, sl_dat, hoan_thanh,
          soct_kho_hang ( ten_hang, ton_kho ),
          soct_hang_ve_dot ( id, ngay_nhan, so_luong_nhan )
        )
      `)
      .order('created_at', { ascending: false })
      .range(from, to))

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching dat_hang:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Tạo đơn đặt hàng mới (nhiều dòng mã hàng)
export async function POST(request: Request) {
  try {
    const session = await requireTab('kho_hang', 'kho_hang.dat_hang')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const { ngay_dat, nha_cung_cap, so_don_hang, da_dat, ghi_chu, lines } = await request.json()

    const validLines = Array.isArray(lines)
      ? lines.filter((l: any) => l.ma_hang && parseInt(l.sl_dat, 10) > 0)
      : []
    if (validLines.length === 0) {
      return NextResponse.json({ error: 'Đơn phải có ít nhất một dòng hàng hợp lệ' }, { status: 400 })
    }

    const { data: order, error } = await supabaseAdmin
      .from('soct_dat_hang')
      .insert({
        ngay_dat: ngay_dat || new Date().toISOString().split('T')[0],
        nha_cung_cap: nha_cung_cap || null,
        so_don_hang: so_don_hang || null,
        da_dat: !!da_dat,
        ghi_chu: ghi_chu || null,
      })
      .select()
      .single()

    if (error) throw error

    const ctRows = validLines.map((l: any) => ({
      id_dat_hang: order.id,
      ma_hang: l.ma_hang,
      sl_dat: parseInt(l.sl_dat, 10),
    }))
    const { error: ctErr } = await supabaseAdmin.from('soct_dat_hang_ct').insert(ctRows)
    if (ctErr) {
      // Dọn đơn header nếu chèn dòng lỗi
      await supabaseAdmin.from('soct_dat_hang').delete().eq('id', order.id)
      throw ctErr
    }

    return NextResponse.json({ data: order })
  } catch (error: any) {
    console.error('Error creating dat_hang:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Sửa thông tin đơn (bao gồm chuyển nháp -> đã đặt)
export async function PUT(request: Request) {
  try {
    const session = await requireTab('kho_hang', 'kho_hang.dat_hang')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const body = await request.json()
    const { id, lines } = body
    if (!id) return NextResponse.json({ error: 'Thiếu ID đơn' }, { status: 400 })

    const updates: any = {}
    for (const k of ['ngay_dat', 'nha_cung_cap', 'so_don_hang', 'ghi_chu']) {
      if (body[k] !== undefined) updates[k] = body[k] || null
    }
    if (body.da_dat !== undefined) updates.da_dat = !!body.da_dat

    const { data: order, error } = await supabaseAdmin
      .from('soct_dat_hang')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Nếu có truyền mảng lines lên (sửa đơn nháp / cập nhật giỏ hàng)
    if (Array.isArray(lines)) {
      // 1. Lấy tất cả các dòng chi tiết cũ để xóa đợt hàng về của chúng trước (hoàn tồn kho an toàn)
      const { data: oldCts } = await supabaseAdmin.from('soct_dat_hang_ct').select('id').eq('id_dat_hang', id)
      const oldCids = (oldCts || []).map(c => c.id)
      if (oldCids.length > 0) {
        const { error: hvDelErr } = await supabaseAdmin.from('soct_hang_ve_dot').delete().in('id_dat_hang_ct', oldCids)
        if (hvDelErr) throw hvDelErr
      }

      // 2. Xóa các dòng chi tiết cũ
      const { error: ctDelErr } = await supabaseAdmin.from('soct_dat_hang_ct').delete().eq('id_dat_hang', id)
      if (ctDelErr) throw ctDelErr

      // 3. Chèn các dòng chi tiết mới
      const validLines = lines.filter((l: any) => l.ma_hang && parseInt(l.sl_dat, 10) > 0)
      if (validLines.length > 0) {
        const newCtRows = validLines.map((l: any) => ({
          id_dat_hang: id,
          ma_hang: l.ma_hang,
          sl_dat: parseInt(l.sl_dat, 10)
        }))
        const { error: ctInsErr } = await supabaseAdmin.from('soct_dat_hang_ct').insert(newCtRows)
        if (ctInsErr) throw ctInsErr
      }
    }

    return NextResponse.json({ data: order })
  } catch (error: any) {
    console.error('Error updating dat_hang:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Xóa đơn (all) hoặc xóa 1 dòng chi tiết đơn hàng (line_id)
export async function DELETE(request: Request) {
  try {
    const session = await requireTab('kho_hang', 'kho_hang.dat_hang')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const lineId = searchParams.get('line_id')

    if (!id && !lineId) {
      return NextResponse.json({ error: 'Thiếu ID đơn hoặc ID mục hàng cần xóa' }, { status: 400 })
    }

    // Trường hợp 1: Xóa 1 mục hàng (1 dòng chi tiết) của đơn
    if (lineId) {
      const { data: ctRow, error: fetchErr } = await supabaseAdmin
        .from('soct_dat_hang_ct')
        .select('id_dat_hang')
        .eq('id', lineId)
        .single()

      if (fetchErr || !ctRow) {
        return NextResponse.json({ error: 'Không tìm thấy mục hàng cần xóa' }, { status: 404 })
      }

      // Xóa các đợt hàng về của dòng này trước (trigger tự động hoàn tồn kho thực tế)
      const { error: hvErr } = await supabaseAdmin.from('soct_hang_ve_dot').delete().eq('id_dat_hang_ct', lineId)
      if (hvErr) throw hvErr

      // Xóa dòng chi tiết
      const { error: ctErr } = await supabaseAdmin.from('soct_dat_hang_ct').delete().eq('id', lineId)
      if (ctErr) throw ctErr

      // Kiểm tra xem đơn hàng cha còn dòng chi tiết nào không
      const { count, error: countErr } = await supabaseAdmin
        .from('soct_dat_hang_ct')
        .select('id', { count: 'exact', head: true })
        .eq('id_dat_hang', ctRow.id_dat_hang)

      if (countErr) throw countErr

      let parentDeleted = false
      if (count === 0) {
        // Đơn rỗng -> xóa luôn đơn hàng cha
        const { error: pErr } = await supabaseAdmin.from('soct_dat_hang').delete().eq('id', ctRow.id_dat_hang)
        if (pErr) throw pErr
        parentDeleted = true
      }

      return NextResponse.json({ success: true, parentDeleted })
    }

    // Trường hợp 2: Xóa toàn bộ đơn đặt hàng
    // Lấy các dòng chi tiết, xóa đợt hàng về của chúng trước (trigger hoàn tồn kho)
    const { data: cts } = await supabaseAdmin.from('soct_dat_hang_ct').select('id').eq('id_dat_hang', id)
    const ctIds = (cts || []).map(c => c.id)
    if (ctIds.length > 0) {
      const { error: hvErr } = await supabaseAdmin.from('soct_hang_ve_dot').delete().in('id_dat_hang_ct', ctIds)
      if (hvErr) throw hvErr
    }

    const { error } = await supabaseAdmin.from('soct_dat_hang').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting dat_hang:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
