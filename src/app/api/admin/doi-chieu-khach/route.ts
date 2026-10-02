import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'

export const runtime = 'nodejs'

// Đối chiếu danh sách khách CHUẨN từ minVoice (kthc dán vào) với khách trong app:
// - Khách CỤM kỹ thuật (soct_khach_cum) và/hoặc khách Kinh doanh (soct_kh_kinh_doanh).
// Khóa đối chiếu: MST (nếu có) -> else tên chuẩn hóa. So khớp tên (word-by-word, bỏ HOA/thường,
// giữ dấu, gộp space), địa chỉ, email (theo tập). minVoice = chuẩn -> báo LỆCH + CHƯA CÓ. Read-only.

const normName = (s: any) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
const normMst = (s: any) => String(s ?? '').replace(/\s+/g, '').trim()
const emailSet = (s: any) => new Set(String(s ?? '').toLowerCase().split(/[;,\s]+/).map(x => x.trim()).filter(x => x.includes('@')))

export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'kthc')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    const b = await request.json()
    const rows: any[] = Array.isArray(b.rows) ? b.rows : []
    const scope = b.scope === 'cum' || b.scope === 'kd' ? b.scope : 'both'
    if (!rows.length) return NextResponse.json({ error: 'Chưa có dòng nào để đối chiếu' }, { status: 400 })

    const recs: { source: string; ma: string; ten: string; dia_chi: string; mst: string; email: string }[] = []
    if (scope === 'cum' || scope === 'both') {
      const cum = await selectAll<any>((f, t) => supabaseAdmin.from('soct_khach_cum').select('ma_khach_hang, ten_khach_hang, dia_chi, ma_so_thue, email_ke_toan').range(f, t))
      for (const c of cum || []) recs.push({ source: 'KT', ma: c.ma_khach_hang || '', ten: c.ten_khach_hang || '', dia_chi: c.dia_chi || '', mst: c.ma_so_thue || '', email: c.email_ke_toan || '' })
    }
    if (scope === 'kd' || scope === 'both') {
      const kd = await selectAll<any>((f, t) => supabaseAdmin.from('soct_kh_kinh_doanh').select('ten_khach_hang, dia_chi, ma_so_thue, email_nhan_hd').eq('an', false).range(f, t))
      for (const k of kd || []) recs.push({ source: 'KD', ma: '', ten: k.ten_khach_hang || '', dia_chi: k.dia_chi || '', mst: k.ma_so_thue || '', email: k.email_nhan_hd || '' })
    }
    // Index theo MST (có giá trị) + theo tên chuẩn hóa
    const byMst = new Map<string, any[]>()
    const byName = new Map<string, any[]>()
    for (const r of recs) {
      const m = normMst(r.mst); if (m) { if (!byMst.has(m)) byMst.set(m, []); byMst.get(m)!.push(r) }
      const n = normName(r.ten); if (n) { if (!byName.has(n)) byName.set(n, []); byName.get(n)!.push(r) }
    }

    const lech: any[] = []
    const thieu: any[] = []
    let khop = 0
    for (const row of rows) {
      const ten = String(row.ten || '').trim()
      const mst = normMst(row.mst)
      const matches = mst ? (byMst.get(mst) || []) : (byName.get(normName(ten)) || [])
      if (!matches.length) { thieu.push({ ten, mst: row.mst || '', dia_chi: row.dia_chi || '', email: row.email || '' }); continue }
      let anyDiff = false
      for (const m of matches) {
        const tenLech = normName(ten) !== normName(m.ten)
        const diaChiLech = normName(row.dia_chi) !== normName(m.dia_chi)
        const inEmails = emailSet(row.email), appEmails = emailSet(m.email)
        const emailThieu = [...inEmails].filter(e => !appEmails.has(e)) // email minVoice có mà app thiếu
        if (tenLech || diaChiLech || emailThieu.length) {
          anyDiff = true
          lech.push({
            source: m.source, ma: m.ma,
            ten_mv: ten, ten_app: m.ten, ten_lech: tenLech,
            mst,
            dia_chi_mv: row.dia_chi || '', dia_chi_app: m.dia_chi, dia_chi_lech: diaChiLech,
            email_mv: row.email || '', email_app: m.email, email_thieu: emailThieu,
          })
        }
      }
      if (!anyDiff) khop++
    }
    return NextResponse.json({ data: { lech, thieu, tong: rows.length, khop, so_ban_ghi: recs.length, scope } })
  } catch (error: any) {
    console.error('Error POST doi-chieu-khach:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
