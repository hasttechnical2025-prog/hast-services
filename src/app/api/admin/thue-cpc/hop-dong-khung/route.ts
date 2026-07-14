import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

// GET: danh sách hợp đồng khung kèm danh sách máy đã gán
export async function GET() {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const { data: khung, error } = await supabaseAdmin
      .from('soct_thue_cpc_hop_dong_khung')
      .select('id, ten_hop_dong, phi_co_ban, vat_thue_cpc, ghi_chu, don_gia_bw, don_gia_mau, mien_phi_bw, mien_phi_mau, card_reader, created_at')
      .order('created_at', { ascending: false })
    if (error) throw error

    const { data: mays, error: mErr } = await supabaseAdmin
      .from('soct_khach_hang')
      .select('id, ten_khach_hang, ma_may, model, id_hop_dong_khung, phi_thue_thang')
      .not('id_hop_dong_khung', 'is', null)
    if (mErr) throw mErr

    const byKhung = new Map<string, any[]>()
    for (const m of mays || []) {
      const arr = byKhung.get(m.id_hop_dong_khung) || []
      arr.push(m)
      byKhung.set(m.id_hop_dong_khung, arr)
    }

    const data = (khung || []).map((k: any) => ({ ...k, mays: byKhung.get(k.id) || [] }))
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching hop-dong-khung:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: tạo mới
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const body = await request.json()
    if (!body.ten_hop_dong?.trim()) return NextResponse.json({ error: 'Thiếu tên hợp đồng' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('soct_thue_cpc_hop_dong_khung')
      .insert({
        ten_hop_dong: body.ten_hop_dong.trim(),
        phi_co_ban: parseFloat(body.phi_co_ban) || 0,
        vat_thue_cpc: body.vat_thue_cpc === '' || body.vat_thue_cpc == null ? 8 : (parseFloat(body.vat_thue_cpc) || 0),
        don_gia_bw: parseFloat(body.don_gia_bw) || 0,
        don_gia_mau: parseFloat(body.don_gia_mau) || 0,
        mien_phi_bw: parseInt(body.mien_phi_bw, 10) || 0,
        mien_phi_mau: parseInt(body.mien_phi_mau, 10) || 0,
        card_reader: parseFloat(body.card_reader) || 0,
        ghi_chu: body.ghi_chu?.trim() || null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error creating hop-dong-khung:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT: cập nhật
export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const body = await request.json()
    if (!body.id) return NextResponse.json({ error: 'Thiếu ID hợp đồng' }, { status: 400 })

    const updates: any = {}
    if (body.ten_hop_dong !== undefined) updates.ten_hop_dong = body.ten_hop_dong?.trim() || null
    if (body.phi_co_ban !== undefined) updates.phi_co_ban = parseFloat(body.phi_co_ban) || 0
    if (body.vat_thue_cpc !== undefined) updates.vat_thue_cpc = parseFloat(body.vat_thue_cpc) || 0
    if (body.don_gia_bw !== undefined) updates.don_gia_bw = parseFloat(body.don_gia_bw) || 0
    if (body.don_gia_mau !== undefined) updates.don_gia_mau = parseFloat(body.don_gia_mau) || 0
    if (body.mien_phi_bw !== undefined) updates.mien_phi_bw = parseInt(body.mien_phi_bw, 10) || 0
    if (body.mien_phi_mau !== undefined) updates.mien_phi_mau = parseInt(body.mien_phi_mau, 10) || 0
    if (body.card_reader !== undefined) updates.card_reader = parseFloat(body.card_reader) || 0
    if (body.ghi_chu !== undefined) updates.ghi_chu = body.ghi_chu?.trim() || null

    const { data, error } = await supabaseAdmin
      .from('soct_thue_cpc_hop_dong_khung')
      .update(updates)
      .eq('id', body.id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error updating hop-dong-khung:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE ?id : xóa khung (FK trên soct_khach_hang tự SET NULL)
export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu id hợp đồng' }, { status: 400 })

    const { error } = await supabaseAdmin.from('soct_thue_cpc_hop_dong_khung').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting hop-dong-khung:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
