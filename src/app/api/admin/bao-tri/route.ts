import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'
import { broadcastBaoTriChanged } from '@/lib/realtime'

// Lấy danh sách máy đã bảo trì trong một tháng (YYYY-MM)
export async function GET(request: Request) {
  try {
    const session = await requireTab('theo_doi_may', 'theo_doi_may.bao_tri')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const thang_nam = searchParams.get('thang_nam')
    const ma_may = searchParams.get('ma_may')   // tra cứu lịch sử theo mã máy
    const nam = searchParams.get('nam')         // lọc theo năm (YYYY)

    // selectAll: lấy cả năm (vài trăm máy x 12 tháng) sẽ vượt giới hạn ~1000 dòng của PostgREST
    const data = await selectAll((from, to) => {
      let query = supabaseAdmin
        .from('soct_bao_tri')
        .select('id, ma_may, thang_nam, ngay, ktv_id, ghi_chu')
        .order('ngay', { ascending: false })
        .range(from, to)

      if (thang_nam) query = query.eq('thang_nam', thang_nam)
      if (ma_may) query = query.eq('ma_may', ma_may)
      if (nam && /^\d{4}$/.test(nam)) query = query.like('thang_nam', `${nam}-%`)
      return query
    })

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching bao_tri:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Nhập nhanh: đánh dấu 1 hoặc nhiều mã máy đã bảo trì trong tháng
export async function POST(request: Request) {
  try {
    const session = await requireTab('theo_doi_may', 'theo_doi_may.bao_tri')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const body = await request.json()
    const { thang_nam, ma_mays, ngay } = body

    if (!thang_nam || !/^\d{4}-\d{2}$/.test(thang_nam)) {
      return NextResponse.json({ error: 'Tháng không hợp lệ (định dạng YYYY-MM)' }, { status: 400 })
    }
    if (!Array.isArray(ma_mays) || ma_mays.length === 0) {
      return NextResponse.json({ error: 'Không có mã máy để lưu' }, { status: 400 })
    }

    // Chuẩn hóa + loại trùng
    const uniqueMaMays = Array.from(new Set(
      ma_mays.map((m: string) => String(m).trim()).filter(Boolean)
    ))

    const rows = uniqueMaMays.map(ma_may => ({
      ma_may,
      thang_nam,
      ngay: ngay || new Date().toISOString().split('T')[0],
    }))

    const { data, error } = await supabaseAdmin
      .from('soct_bao_tri')
      .upsert(rows, { onConflict: 'ma_may,thang_nam' })
      .select()

    if (error) throw error

    await broadcastBaoTriChanged()
    return NextResponse.json({ success: true, count: data.length, data })
  } catch (error: any) {
    console.error('Error saving bao_tri:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Bỏ đánh dấu bảo trì (theo id, hoặc theo ma_may + thang_nam)
export async function DELETE(request: Request) {
  try {
    const session = await requireTab('theo_doi_may', 'theo_doi_may.bao_tri')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const ma_may = searchParams.get('ma_may')
    const thang_nam = searchParams.get('thang_nam')
    const all = searchParams.get('all') === '1'

    let query = supabaseAdmin.from('soct_bao_tri').delete()
    if (all) {
      // Xóa toàn bộ (nếu có thang_nam thì chỉ tháng đó)
      query = thang_nam ? query.eq('thang_nam', thang_nam) : query.not('id', 'is', null)
    } else if (id) {
      query = query.eq('id', id)
    } else if (ma_may && thang_nam) {
      query = query.eq('ma_may', ma_may).eq('thang_nam', thang_nam)
    } else {
      return NextResponse.json({ error: 'Thiếu id hoặc (ma_may + thang_nam)' }, { status: 400 })
    }

    const { error } = await query
    if (error) throw error

    await broadcastBaoTriChanged()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting bao_tri:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
