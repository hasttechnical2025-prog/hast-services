import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

const norm = (s: any) => String(s ?? '').trim().toUpperCase()
const eqList = (s: any) => String(s ?? '').split(',').map(norm).filter(Boolean)

// Kho hàng bảo hành: danh mục mã (RIÊNG, không nối kho app) + TỒN tính động từ Sổ bảo hành,
// gộp theo NHÓM TƯƠNG ĐƯƠNG (ma_thay_the, 2 chiều — giống kho chính). Tồn = Σ(hàng về +1) −
// Σ(trả khách −1) theo mã THỰC NHẬN (ma_tra_ve || product_code) trong cùng nhóm.
export async function GET() {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const [cat, cases] = await Promise.all([
      selectAll<any>((from, to) => supabaseAdmin.from('soct_bh_dmhang').select('*').order('ma_hang', { ascending: true }).range(from, to)),
      selectAll<any>((from, to) => supabaseAdmin.from('soct_bh_fbvn').select('product_code, ma_tra_ve, goods_received, back_to_customer').range(from, to)),
    ])

    // 1) Delta tồn theo MÃ THỰC NHẬN: hàng về +1, trả khách −1.
    const delta: Record<string, number> = {}
    for (const c of cases || []) {
      const code = norm(c.ma_tra_ve) || norm(c.product_code)
      if (!code) continue
      let d = 0
      if (c.goods_received) d += 1
      if (c.back_to_customer) d -= 1
      if (d) delta[code] = (delta[code] || 0) + d
    }

    // 2) Union-Find gộp nhóm tương đương theo ma_thay_the (2 chiều).
    const parent: Record<string, string> = {}
    const ensure = (x: string) => { if (!(x in parent)) parent[x] = x }
    const find = (x: string): string => { ensure(x); while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
    const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb }
    for (const k of Object.keys(delta)) ensure(k)
    for (const row of cat || []) {
      const m = norm(row.ma_hang); ensure(m)
      for (const eq of eqList(row.ma_thay_the)) union(m, eq)
    }

    // 3) Tồn nhóm + chi tiết từng mã trong nhóm.
    const groupTon: Record<string, number> = {}
    const groupDetail: Record<string, { ma: string; ton: number }[]> = {}
    for (const [code, d] of Object.entries(delta)) {
      const r = find(code)
      groupTon[r] = (groupTon[r] || 0) + d
      ;(groupDetail[r] = groupDetail[r] || []).push({ ma: code, ton: d })
    }
    const hasCat: Record<string, boolean> = {}
    for (const row of cat || []) { const r = find(norm(row.ma_hang)); hasCat[r] = true; if (!(r in groupTon)) groupTon[r] = 0 }

    // 3b) Thành viên NHÓM theo gốc (để hiển thị ≡ 2 CHIỀU: dòng nào cũng thấy các mã tương đương).
    const groupMembers: Record<string, string[]> = {}
    for (const code of Object.keys(parent)) { const r = find(code); (groupMembers[r] = groupMembers[r] || []).push(code) }

    // 4) Làm giàu dòng danh mục: ton (THỰC theo mã) + nhom_other (≡ 2 chiều) + ton_nhom/chi_tiet (tooltip).
    const data = (cat || []).map((row: any) => {
      const m = norm(row.ma_hang)
      const r = find(m)
      const nhomOther = (groupMembers[r] || []).filter(x => x !== m).sort((a, b) => a.localeCompare(b))
      return {
        ...row,
        ton: delta[m] || 0,                                   // tồn THỰC của riêng mã này
        nhom_other: nhomOther,                                // mã tương đương (2 chiều, gồm cả mã kia khai ngược)
        ton_nhom: groupTon[r] || 0,                           // tổng tồn nhóm (chỉ dùng cho tooltip)
        chi_tiet: (groupDetail[r] || []).sort((a, b) => a.ma.localeCompare(b.ma)),
      }
    })

    // 5) Mã NGOÀI DANH MỤC: có phát sinh nhập/xuất nhưng nhóm KHÔNG chứa mã danh mục nào.
    const orphan: { ma_hang: string; ton_nhom: number }[] = []
    const seenRoot = new Set<string>()
    for (const code of Object.keys(delta)) {
      const r = find(code)
      if (hasCat[r] || seenRoot.has(r)) continue
      seenRoot.add(r)
      orphan.push({ ma_hang: code, ton_nhom: groupTon[r] || 0 })
    }
    orphan.sort((a, b) => a.ma_hang.localeCompare(b.ma_hang))

    return NextResponse.json({ data, orphan })
  } catch (error: any) {
    console.error('Error GET bh/dmhang:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: thêm 1 mã hoặc bulk { items } (upsert theo ma_hang).
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const b = await request.json()
    const map = (it: any) => {
      const r: any = {
        ma_hang: String(it.ma_hang ?? '').trim(),
        ten_hang: String(it.ten_hang ?? '').trim() || null,
        model: String(it.model ?? '').trim() || null,
        ghi_chu: String(it.ghi_chu ?? '').trim() || null,
      }
      // Chỉ ghi ma_thay_the / ngung_su_dung khi item có mặt key (tránh import 4 cột cũ xóa mất
      // mã tương đương đã khai). ma_thay_the = chuỗi mã IN HOA, cách dấu phẩy.
      if ('ma_thay_the' in it) r.ma_thay_the = eqList(it.ma_thay_the).join(', ') || null
      if ('ngung_su_dung' in it) r.ngung_su_dung = it.ngung_su_dung === true || it.ngung_su_dung === 'true' || it.ngung_su_dung === 1
      return r
    }
    const items = Array.isArray(b.items) ? b.items : [b]
    const rows = items.map(map).filter((r: any) => r.ma_hang)
    if (!rows.length) return NextResponse.json({ error: 'Không có dòng hợp lệ (thiếu mã hàng)' }, { status: 400 })
    const { error } = await supabaseAdmin.from('soct_bh_dmhang').upsert(rows, { onConflict: 'ma_hang' })
    if (error) throw error
    await logAudit(session, 'Nhập DM Hàng (BH)', `${rows.length} mã`)
    return NextResponse.json({ success: true, count: rows.length })
  } catch (error: any) {
    console.error('Error POST bh/dmhang:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })
    const { error } = await supabaseAdmin.from('soct_bh_dmhang').delete().eq('id', id)
    if (error) throw error
    await logAudit(session, 'Xóa mã DM Hàng (BH)', id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error DELETE bh/dmhang:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
