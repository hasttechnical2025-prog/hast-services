import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'
import { broadcastKhoChanged } from '@/lib/realtime'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// Mốc 12 tháng gần nhất (gồm tháng hiện tại): 'YYYY-MM'.
function cutoff12(): string {
  const d = new Date(Date.now() + 7 * 3600 * 1000)
  d.setUTCMonth(d.getUTCMonth() - 11)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// GET: danh sách ỨNG VIÊN cảnh báo tồn = hàng KONICA đã từng nhập trong 12 tháng gần nhất.
// Mỗi mặt hàng kèm: tồn kho, ngưỡng đã đặt (nguong_dat), số lượng ĐANG CHỜ VỀ (đơn đã đặt, chưa nhận đủ).
// Client tự lọc "cần cảnh báo" = nguong_dat > 0 && ton_kho <= nguong_dat.
export async function GET() {
  try {
    const session = await requireTab('kho_hang', 'kho_hang.thong_ke')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    // (1) Mã hàng đã nhập trong 12 tháng gần nhất.
    const nhap = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_nhap_hang_thang')
      .select('ma_hang')
      .gte('thang_nam', cutoff12())
      .gt('so_luong_nhap', 0)
      .range(from, to))
    const maNhap = [...new Set((nhap || []).map((r: any) => r.ma_hang).filter(Boolean))]
    if (maNhap.length === 0) return NextResponse.json({ items: [] })

    // (2) Trong số đó, lấy hàng hãng KONICA (hang chứa "konica", không phân biệt hoa thường / "Konica Minolta").
    const kho = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_kho_hang')
      .select('ma_hang, ten_hang, model, hang, ton_kho, nguong_dat')
      .in('ma_hang', maNhap)
      .ilike('hang', '%konica%')
      .range(from, to))
    const maKonica = (kho || []).map((k: any) => k.ma_hang)
    if (maKonica.length === 0) return NextResponse.json({ items: [] })

    // (3) Số lượng ĐANG CHỜ VỀ: dòng đơn đã ĐẶT (header da_dat), dòng CHƯA hoàn thành -> sl_dat trừ đã nhận.
    const choVe: Record<string, number> = {}
    const cts = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_dat_hang_ct')
      .select('ma_hang, sl_dat, soct_dat_hang!inner ( da_dat ), soct_hang_ve_dot ( so_luong_nhan )')
      .in('ma_hang', maKonica)
      .eq('hoan_thanh', false)
      .eq('soct_dat_hang.da_dat', true)
      .range(from, to))
    for (const c of (cts || [])) {
      const daNhan = (c.soct_hang_ve_dot || []).reduce((s: number, r: any) => s + (Number(r.so_luong_nhan) || 0), 0)
      const conVe = Math.max(0, (Number(c.sl_dat) || 0) - daNhan)
      if (conVe > 0) choVe[c.ma_hang] = (choVe[c.ma_hang] || 0) + conVe
    }

    const items = (kho || []).map((k: any) => ({
      ma_hang: k.ma_hang,
      ten_hang: k.ten_hang,
      model: k.model,
      ton_kho: Number(k.ton_kho) || 0,
      nguong_dat: k.nguong_dat == null ? null : Number(k.nguong_dat),
      cho_ve: choVe[k.ma_hang] || 0,
    }))
    return NextResponse.json({ items })
  } catch (error: any) {
    console.error('Error GET canh-bao-ton:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT { items: [{ ma_hang, nguong_dat }] }: lưu ngưỡng đặt lại hàng (từng mặt hàng). nguong_dat rỗng/null
// = xóa ngưỡng (không cảnh báo). Chỉ ghi cột nguong_dat, không đụng các cột khác của kho.
export async function PUT(request: Request) {
  try {
    const session = await requireTab('kho_hang', 'kho_hang.thong_ke')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const { items } = await request.json()
    if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'Không có dòng nào để lưu' }, { status: 400 })

    let saved = 0
    for (const it of items) {
      const ma_hang = String(it.ma_hang || '').trim()
      if (!ma_hang) continue
      const v = it.nguong_dat === '' || it.nguong_dat == null ? null : Number(it.nguong_dat)
      if (v != null && (!Number.isFinite(v) || v < 0)) return NextResponse.json({ error: `Ngưỡng không hợp lệ (${ma_hang})` }, { status: 400 })
      const { error } = await supabaseAdmin.from('soct_kho_hang').update({ nguong_dat: v }).eq('ma_hang', ma_hang)
      if (error) throw error
      saved++
    }

    await logAudit(session, 'Lưu ngưỡng cảnh báo tồn (Konica)', `${saved} mặt hàng`)
    await broadcastKhoChanged()
    return NextResponse.json({ success: true, saved })
  } catch (error: any) {
    console.error('Error PUT canh-bao-ton:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
