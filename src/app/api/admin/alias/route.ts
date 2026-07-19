import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

// Biệt danh/viết tắt cho Trợ lý AI. Chỉ admin.
const normKey = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim()

export async function GET() {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    const { data, error } = await supabaseAdmin.from('soct_alias').select('tu_khoa, mo_rong').order('tu_khoa')
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const body = await request.json()
    const tu_khoa = normKey(body.tu_khoa)
    const mo_rong = String(body.mo_rong || '').trim()
    if (!tu_khoa || !mo_rong) return NextResponse.json({ error: 'Thiếu từ khóa hoặc cụm từ mở rộng' }, { status: 400 })
    const { data, error } = await supabaseAdmin.from('soct_alias').insert({ tu_khoa, mo_rong }).select().single()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: `Từ khóa "${tu_khoa}" đã tồn tại` }, { status: 400 })
      throw error
    }
    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const body = await request.json()
    const tu_khoa = normKey(body.tu_khoa)
    const mo_rong = String(body.mo_rong || '').trim()
    if (!tu_khoa || !mo_rong) return NextResponse.json({ error: 'Thiếu dữ liệu' }, { status: 400 })
    const { error } = await supabaseAdmin.from('soct_alias').update({ mo_rong }).eq('tu_khoa', tu_khoa)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const tu_khoa = new URL(request.url).searchParams.get('tu_khoa')
    if (!tu_khoa) return NextResponse.json({ error: 'Thiếu từ khóa' }, { status: 400 })
    const { error } = await supabaseAdmin.from('soct_alias').delete().eq('tu_khoa', tu_khoa)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
