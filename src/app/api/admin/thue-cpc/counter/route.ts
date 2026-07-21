import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { kyTruoc } from '@/lib/thue-cpc'
import { broadcastThueCpcChanged } from '@/lib/realtime'

const LOAI_HD_BILLING = ['Máy thuê', 'Máy CPC']

// GET ?thang_nam=YYYY-MM : danh sách máy billing + counter kỳ này & kỳ trước (đầu kỳ tham khảo)
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const thang_nam = searchParams.get('thang_nam') || ''
    if (!/^\d{4}-\d{2}$/.test(thang_nam)) {
      return NextResponse.json({ error: 'Tháng không hợp lệ (YYYY-MM)' }, { status: 400 })
    }
    const prev = kyTruoc(thang_nam)

    const mays = await selectAll((from, to) => supabaseAdmin
      .from('soct_khach_hang')
      .select('id, ten_khach_hang, ma_may, serial, model, loai_hd, may_mau, vi_tri_dat_may, trach_nhiem_ky_thuat, ten_doi_tac_ky_thuat, ngay_chot_so, chot_so_ngay, chot_so_cuoi_thang')
      .in('loai_hd', LOAI_HD_BILLING)
      .order('ten_khach_hang')
      .range(from, to))

    const { data: counters, error: cErr } = await supabaseAdmin
      .from('soct_thue_cpc_counter')
      .select('id_khach_hang, thang_nam, so_bw, so_mau, ghi_chu')
      .in('thang_nam', [thang_nam, prev])
    if (cErr) throw cErr

    const thisMap = new Map<string, any>()
    const prevMap = new Map<string, any>()
    for (const c of counters || []) {
      if (c.thang_nam === thang_nam) thisMap.set(c.id_khach_hang, c)
      else prevMap.set(c.id_khach_hang, c)
    }

    const rows = (mays || []).map((m: any) => ({
      ...m,
      so_bw: thisMap.get(m.id)?.so_bw ?? null,
      so_mau: thisMap.get(m.id)?.so_mau ?? null,
      ghi_chu: thisMap.get(m.id)?.ghi_chu ?? '',
      so_bw_truoc: prevMap.get(m.id)?.so_bw ?? null,
      so_mau_truoc: prevMap.get(m.id)?.so_mau ?? null,
    }))

    return NextResponse.json({ data: { thang_nam, prev, rows } })
  } catch (error: any) {
    console.error('Error fetching thue-cpc counters:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: upsert counter 1 máy 1 kỳ. Body { id_khach_hang, thang_nam, so_bw, so_mau, ghi_chu }
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const body = await request.json()
    const { id_khach_hang, thang_nam } = body
    if (!id_khach_hang || !/^\d{4}-\d{2}$/.test(thang_nam || '')) {
      return NextResponse.json({ error: 'Thiếu khách hàng hoặc tháng không hợp lệ' }, { status: 400 })
    }

    const toBig = (v: any) => (v === '' || v === null || v === undefined ? null : (parseInt(v, 10) || 0))
    const payload = {
      id_khach_hang,
      thang_nam,
      so_bw: toBig(body.so_bw),
      so_mau: toBig(body.so_mau),
      ghi_chu: body.ghi_chu === '' ? null : body.ghi_chu ?? null,
      nguoi_nhap: session.id,
    }

    const { data, error } = await supabaseAdmin
      .from('soct_thue_cpc_counter')
      .upsert(payload, { onConflict: 'id_khach_hang,thang_nam' })
      .select('id_khach_hang, thang_nam, so_bw, so_mau, ghi_chu')
      .single()

    if (error) throw error
    await broadcastThueCpcChanged()
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error saving thue-cpc counter:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
