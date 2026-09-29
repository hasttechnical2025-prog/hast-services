import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { getCauHinh } from '@/lib/config'
import { readSheetGrid } from '@/lib/gsheet'
import { broadcastThueCpcChanged } from '@/lib/realtime'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

const LOAI_HD_BILLING = ['Máy thuê', 'Máy CPC']
const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').trim().toLowerCase()
const onlyDigits = (x: any): number | null => { const d = String(x ?? '').replace(/[^\d]/g, ''); return d ? parseInt(d, 10) : null }

// Tách ô counter "bw/color": có "/" -> [bw, color]; 1 số -> bw (color trống); "-"/rỗng -> null (bỏ qua).
function parseCounter(cell: any): { bw: number | null; color: number | null } | null {
  const s = String(cell ?? '').trim()
  if (!s || s === '-') return null
  const parts = s.split('/')
  const bw = onlyDigits(parts[0])
  const color = parts.length > 1 ? onlyDigits(parts[1]) : null
  if (bw == null && color == null) return null
  return { bw, color }
}

// Đọc + parse Google Sheet cho 1 kỳ -> phân loại theo máy app. Dùng chung cho GET (preview) & POST (verify).
async function buildSync(thang_nam: string) {
  const cfg = await getCauHinh()
  const sheetId = (cfg.gsheet_thue_id || '').trim()
  const tab = (cfg.gsheet_thue_tab || 'Danh sách').trim()
  const grid = await readSheetGrid(sheetId, tab)
  if (!grid.length) throw new Error('Sheet rỗng hoặc không đọc được.')

  // 1) Hàng tiêu đề THÁNG: chọn hàng có nhiều nhãn MM/YYYY nhất -> map cột -> kỳ 'YYYY-MM'.
  const monthRe = /^\s*(\d{1,2})\/(\d{4})\s*$/
  let colToKy = new Map<number, string>()
  let bestHits = 0
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const row = grid[r] || []
    const tmp = new Map<number, string>()
    for (let c = 0; c < row.length; c++) { const m = monthRe.exec(String(row[c] ?? '')); if (m) tmp.set(c, `${m[2]}-${m[1].padStart(2, '0')}`) }
    if (tmp.size > bestHits) { bestHits = tmp.size; colToKy = tmp }
  }
  if (bestHits === 0) throw new Error('Không tìm thấy hàng tiêu đề tháng (MM/YYYY) trong sheet.')
  let colKy = -1
  for (const [c, ky] of colToKy) if (ky === thang_nam) { colKy = c; break }
  if (colKy < 0) throw new Error(`Sheet chưa có cột tháng ${thang_nam.slice(5)}/${thang_nam.slice(0, 4)}.`)

  // 2) Cột "Mã máy": dò trong 15 hàng đầu.
  let colMa = -1
  for (let r = 0; r < Math.min(grid.length, 15) && colMa < 0; r++) {
    const row = grid[r] || []
    for (let c = 0; c < row.length; c++) if (norm(row[c]) === 'ma may') { colMa = c; break }
  }
  if (colMa < 0) throw new Error('Không tìm thấy cột "Mã máy" trong sheet.')

  // 3) Máy app (billing) theo mã + counter đã có kỳ này (để "chỉ điền chỗ trống").
  const mays = await selectAll<any>((from, to) => supabaseAdmin
    .from('soct_khach_hang').select('id, ma_may, ten_khach_hang').in('loai_hd', LOAI_HD_BILLING).range(from, to))
  const appByMa = new Map<string, { id: string; ten: string; ma: string }>()
  for (const m of mays || []) { const k = norm(m.ma_may); if (k) appByMa.set(k, { id: m.id, ten: m.ten_khach_hang || '', ma: m.ma_may }) }
  const { data: curCounters } = await supabaseAdmin
    .from('soct_thue_cpc_counter').select('id_khach_hang, so_bw, so_mau').eq('thang_nam', thang_nam)
  const hasCounter = new Set<string>((curCounters || []).filter((c: any) => c.so_bw != null || c.so_mau != null).map((c: any) => c.id_khach_hang))

  // 4) Duyệt hàng data (sau khối tiêu đề), phân loại.
  const willFill: any[] = [], skipHave: any[] = [], empty: any[] = [], unmatched: any[] = []
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] || []
    const maRaw = String(row[colMa] ?? '').trim()
    if (!maRaw) continue
    // Bỏ hàng tiêu đề/đánh số cột: mã hợp lệ phải có chữ HOẶC dài ≥ 4 ký tự.
    if (!/[A-Za-z]/.test(maRaw) && maRaw.replace(/[^\d]/g, '').length < 4) continue
    const app = appByMa.get(norm(maRaw))
    const parsed = parseCounter(row[colKy])
    if (!app) { unmatched.push({ ma: maRaw, cell: String(row[colKy] ?? '').trim() }); continue }
    if (!parsed) { empty.push({ ma: app.ma, ten: app.ten }); continue }
    const item = { id_khach_hang: app.id, ma: app.ma, ten: app.ten, so_bw: parsed.bw, so_mau: parsed.color }
    if (hasCounter.has(app.id)) skipHave.push(item)
    else willFill.push(item)
  }
  return { thang_nam, tab, willFill, skipHave, empty, unmatched }
}

// GET ?thang_nam=YYYY-MM -> XEM TRƯỚC (không ghi).
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    const thang_nam = new URL(request.url).searchParams.get('thang_nam') || ''
    if (!/^\d{4}-\d{2}$/.test(thang_nam)) return NextResponse.json({ error: 'Tháng không hợp lệ (YYYY-MM)' }, { status: 400 })
    const preview = await buildSync(thang_nam)
    return NextResponse.json(preview)
  } catch (error: any) {
    console.error('gsheet-sync preview error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST { thang_nam } -> GHI nhóm "sẽ điền" (đọc lại sheet + kiểm CHỖ TRỐNG ở server, không tin client).
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    const { thang_nam } = await request.json()
    if (!/^\d{4}-\d{2}$/.test(thang_nam || '')) return NextResponse.json({ error: 'Tháng không hợp lệ (YYYY-MM)' }, { status: 400 })
    const { willFill } = await buildSync(thang_nam) // server tự tính lại -> chỉ chỗ trống
    if (willFill.length === 0) return NextResponse.json({ success: true, count: 0 })
    const payload = willFill.map((i: any) => ({ id_khach_hang: i.id_khach_hang, thang_nam, so_bw: i.so_bw, so_mau: i.so_mau, nguoi_nhap: session.id }))
    const { error } = await supabaseAdmin.from('soct_thue_cpc_counter').upsert(payload, { onConflict: 'id_khach_hang,thang_nam' })
    if (error) throw error
    await logAudit(session, 'Đồng bộ counter từ Google Sheet', `kỳ ${thang_nam}: điền ${payload.length} máy`)
    await broadcastThueCpcChanged()
    return NextResponse.json({ success: true, count: payload.length })
  } catch (error: any) {
    console.error('gsheet-sync write error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
