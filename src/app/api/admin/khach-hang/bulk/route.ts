import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: Request) {
  try {
    const { customers } = await request.json()

    if (!Array.isArray(customers) || customers.length === 0) {
      return NextResponse.json({ error: 'Không có dữ liệu để import' }, { status: 400 })
    }

    // Insert records. Supabase `upsert` method is perfect here for avoiding duplicate errors on `ma_may`.
    // It requires the unique column in onConflict option.
    const { data, error } = await supabaseAdmin
      .from('soct_khach_hang')
      .upsert(customers, { onConflict: 'ma_may' })
      .select()

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true, count: data.length, data })
  } catch (error: any) {
    console.error('Lỗi bulk import:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
