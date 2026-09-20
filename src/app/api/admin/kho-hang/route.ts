import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole, requireTab } from '@/lib/session'
import { broadcastKhoChanged } from '@/lib/realtime'

// Lấy danh sách hàng hóa trong kho
export async function GET() {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff', 'kthc')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    }

    // Lấy toàn bộ (kho hàng có thể vượt 1000 mã)
    const data = await selectAll((from, to) => supabaseAdmin
      .from('soct_kho_hang')
      .select('*')
      .order('ma_hang')
      .range(from, to))

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching inventory:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Thêm hàng hóa mới hoặc cập nhật tồn kho (nếu cần cho dropdown tùy biến)
export async function POST(request: Request) {
  try {
    const session = await requireTab('kho_hang', 'kho_hang.ton_kho')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const body = await request.json()
    const { ma_hang, ten_hang, model, hang, ton_kho, ngung_su_dung, ma_thay_the } = body

    if (!ma_hang || !ten_hang) {
      return NextResponse.json({ error: 'Thiếu mã hàng hoặc tên hàng' }, { status: 400 })
    }

    // Mã tương đương: danh sách phân tách bằng dấu phẩy, chuẩn hóa IN HOA, bỏ trùng.
    const parseList = (s: any) => [...new Set(String(s || '').split(',').map(t => t.trim().toUpperCase()).filter(Boolean))]
    const fmtList = (arr: string[]) => (arr.length ? arr.join(', ') : null)
    const Aup = String(ma_hang).trim().toUpperCase()
    const newList = parseList(ma_thay_the).filter(c => c !== Aup) // loại chính nó

    // Danh sách cũ của mã này (để biết mã nào thêm / gỡ khi đồng bộ 2 chiều).
    const { data: cur } = await supabaseAdmin.from('soct_kho_hang').select('ma_thay_the').eq('ma_hang', ma_hang).maybeSingle()
    const oldList = parseList(cur?.ma_thay_the)

    const { data, error } = await supabaseAdmin
      .from('soct_kho_hang')
      .upsert({
        ma_hang,
        ten_hang,
        model: model || null,
        hang: hang || null,
        ton_kho: ton_kho || 0,
        ngung_su_dung: !!ngung_su_dung,
        ma_thay_the: fmtList(newList)
      })
      .select()
      .single()

    if (error) throw error

    // ĐỒNG BỘ 2 CHIỀU (pairwise): mã B được thêm -> tự thêm mã này (A) vào danh sách của B;
    // mã B bị gỡ -> tự gỡ A khỏi B. Chỉ đụng các mã có thật trong kho.
    const added = newList.filter(c => !oldList.includes(c))
    const removed = oldList.filter(c => !newList.includes(c))
    const affected = [...new Set([...added, ...removed])]
    if (affected.length) {
      const { data: rows } = await supabaseAdmin.from('soct_kho_hang').select('ma_hang, ma_thay_the').in('ma_hang', affected)
      for (const b of (rows || [])) {
        const bUp = String(b.ma_hang).toUpperCase()
        const bList = parseList(b.ma_thay_the)
        let changed = false
        if (added.includes(bUp) && !bList.includes(Aup)) { bList.push(Aup); changed = true }
        if (removed.includes(bUp) && bList.includes(Aup)) { bList.splice(bList.indexOf(Aup), 1); changed = true }
        if (changed) await supabaseAdmin.from('soct_kho_hang').update({ ma_thay_the: fmtList(bList) }).eq('ma_hang', b.ma_hang)
      }
    }

    await broadcastKhoChanged()
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error updating inventory item:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Xóa hàng hóa khỏi kho hàng
export async function DELETE(request: Request) {
  try {
    const session = await requireTab('kho_hang', 'kho_hang.ton_kho')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const ma_hang = searchParams.get('ma_hang')
    const all = searchParams.get('all') === '1'

    if (!all && !ma_hang) {
      return NextResponse.json({ error: 'Thiếu mã hàng' }, { status: 400 })
    }

    // Xóa cứng: toàn bộ (khi nhập lại dữ liệu) hoặc theo một mã
    const query = supabaseAdmin.from('soct_kho_hang').delete()
    const { error } = all
      ? await query.not('ma_hang', 'is', null)
      : await query.eq('ma_hang', ma_hang)

    if (error) throw error

    await broadcastKhoChanged()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting inventory item:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
