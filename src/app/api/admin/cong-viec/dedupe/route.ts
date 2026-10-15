import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { broadcastJobsChanged } from '@/lib/realtime'
import { logAudit } from '@/lib/audit'

// Tìm các nhóm phiếu TRÙNG số phiếu (report): giữ lại 1 bản (tạo sớm nhất),
// gom id của phần thừa để xóa. Chỉ xét report khác rỗng.
async function findDuplicates() {
  const { data, error } = await supabaseAdmin
    .from('soct_cong_viec')
    .select('id, report, created_at')
    .not('report', 'is', null)
    .neq('report', '')
    .order('created_at', { ascending: true })
  if (error) throw error

  const keep = new Map<string, string>()  // report(chuẩn hóa) -> id giữ lại (bản sớm nhất)
  const label = new Map<string, string>() // report(chuẩn hóa) -> số phiếu gốc để hiển thị
  const extras = new Map<string, number>()// report(chuẩn hóa) -> số bản thừa
  const removeIds: string[] = []
  for (const r of data || []) {
    const raw = String(r.report).trim()
    const key = raw.toLowerCase()
    if (!key) continue
    if (keep.has(key)) { removeIds.push(r.id); extras.set(key, (extras.get(key) || 0) + 1) }
    else { keep.set(key, r.id); label.set(key, raw) }
  }
  const list = [...extras.entries()]
    .map(([k, n]) => ({ report: label.get(k) || k, extras: n }))
    .sort((a, b) => a.report.localeCompare(b.report, 'vi', { numeric: true }))
  return { removeIds, groups: extras.size, list }
}

// Xem trước: có bao nhiêu số phiếu trùng / bao nhiêu phiếu thừa
export async function GET() {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Chỉ admin được thực hiện' }, { status: 401 })
    const { removeIds, groups, list } = await findDuplicates()
    return NextResponse.json({ groups, extras: removeIds.length, list })
  } catch (e: any) {
    console.error('Error scanning duplicate reports:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// Thực thi: xóa phần phiếu thừa (chi_tiet vật tư cascade theo)
export async function POST() {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Chỉ admin được thực hiện' }, { status: 401 })

    const { removeIds, groups } = await findDuplicates()
    if (removeIds.length === 0) return NextResponse.json({ removed: 0, groups: 0 })

    const chunk = 200
    for (let i = 0; i < removeIds.length; i += chunk) {
      const batch = removeIds.slice(i, i + chunk)
      const { error } = await supabaseAdmin.from('soct_cong_viec').delete().in('id', batch)
      if (error) throw error
    }

    await broadcastJobsChanged()
    await logAudit(session, 'Dọn phiếu trùng số phiếu', `${removeIds.length} phiếu thừa / ${groups} số phiếu`)
    return NextResponse.json({ removed: removeIds.length, groups })
  } catch (e: any) {
    console.error('Error deduping reports:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
