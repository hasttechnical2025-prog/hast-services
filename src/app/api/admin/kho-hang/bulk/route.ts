import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'
import { broadcastKhoChanged } from '@/lib/realtime'

export async function POST(request: Request) {
  try {
    const session = await requireTab('kho_hang', 'kho_hang.ton_kho')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const { items } = await request.json()

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Không có dữ liệu để import' }, { status: 400 })
    }

    // Chỉ nhận cột hợp lệ (chống mass-assignment)
    const ALLOWED = ['ma_hang', 'ten_hang', 'model', 'hang', 'ton_kho']
    const rows = items.map((it: any) => {
      const r: any = {}
      for (const k of ALLOWED) if (it[k] !== undefined) r[k] = it[k]
      return r
    })

    // Insert/Upsert các bản ghi kho hàng dựa vào khoá chính `ma_hang`
    const { data, error } = await supabaseAdmin
      .from('soct_kho_hang')
      .upsert(rows, { onConflict: 'ma_hang' })
      .select()

    if (error) {
      throw error
    }

    await broadcastKhoChanged()
    return NextResponse.json({ success: true, count: data.length, data })
  } catch (error: any) {
    console.error('Lỗi bulk import kho hàng:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
