import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'
import { getCauHinh } from '@/lib/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const gate = () => requireTab('cong_viec', 'cong_viec.cham_soc_kh')
const LV = { cao: 3, vua: 2, thap: 1 } as const

// GET: hàng đợi "Cần chăm sóc" tự sinh từ tín hiệu, theo KHÁCH CỤM. Mỗi khách kèm lý do + chỉ số sức khỏe.
export async function GET() {
  try {
    const session = await gate()
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const cfg = await getCauHinh()
    const hdbtThang = parseInt(cfg.hdbt_canh_bao_thang || '2') || 2
    const LAU_NGAY = 90, FOLLOWUP_NGAY = 3, HAYHONG_CUA_SO = 60, HAYHONG_MIN = 3
    const nowMs = Date.now() + 7 * 3600 * 1000
    const today = new Date(nowMs).toISOString().slice(0, 10)
    const d60 = new Date(nowMs - HAYHONG_CUA_SO * 86400000).toISOString().slice(0, 10)
    const d3 = new Date(nowMs - FOLLOWUP_NGAY * 86400000).toISOString().slice(0, 10)
    const limitHd = (() => { const d = new Date(nowMs); d.setMonth(d.getMonth() + hdbtThang); return d.toISOString().slice(0, 10) })()
    const daysBetween = (iso: string) => Math.floor((nowMs - Date.parse(iso + 'T00:00:00Z')) / 86400000)

    const [clusters, members, repairs, logs] = await Promise.all([
      selectAll<any>((f, t) => supabaseAdmin.from('soct_khach_cum').select('ma_khach_hang, ten_khach_hang').range(f, t)),
      selectAll<any>((f, t) => supabaseAdmin.from('soct_khach_hang').select('id, ma_khach_cum, loai_hd, ngay_het_han_hdbt, ma_may, model, vi_tri_dat_may').not('ma_khach_cum', 'is', null).range(f, t)),
      selectAll<any>((f, t) => supabaseAdmin.from('soct_cong_viec').select('id_khach_hang, ngay').eq('loai_cong_viec', 'Sửa máy').eq('ket_qua', 'Hoàn thành').gte('ngay', d60).range(f, t)),
      selectAll<any>((f, t) => supabaseAdmin.from('soct_cskh_log').select('ma_khach_cum, ngay, ngay_hen').not('ma_khach_cum', 'is', null).range(f, t)),
    ])

    const fmtD = (iso: string) => { const p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '' }
    type MInfo = { cum: string; ma_may: string; model: string; vi_tri: string }
    const memberInfo = new Map<string, MInfo>()  // id_khach_hang -> thông tin máy
    type Cum = { ten: string; so_may: number; loai_set: boolean; hd_near: string | null; hd_earliest: string | null }
    const cums = new Map<string, Cum>()
    for (const c of clusters || []) cums.set(c.ma_khach_hang, { ten: c.ten_khach_hang || c.ma_khach_hang, so_may: 0, loai_set: false, hd_near: null, hd_earliest: null })
    for (const m of members || []) {
      const cum = cums.get(m.ma_khach_cum); if (!cum) continue
      memberInfo.set(m.id, { cum: m.ma_khach_cum, ma_may: m.ma_may || '', model: m.model || '', vi_tri: m.vi_tri_dat_may || '' })
      cum.so_may++
      const hasLoai = !!String(m.loai_hd || '').trim()
      if (hasLoai) cum.loai_set = true
      if (hasLoai && m.ngay_het_han_hdbt) {
        if (!cum.hd_earliest || m.ngay_het_han_hdbt < cum.hd_earliest) cum.hd_earliest = m.ngay_het_han_hdbt
        if (m.ngay_het_han_hdbt <= limitHd && (!cum.hd_near || m.ngay_het_han_hdbt < cum.hd_near)) cum.hd_near = m.ngay_het_han_hdbt
      }
    }

    // Sửa máy theo TỪNG MÁY (id_khach_hang): đếm 60 ngày + lần sửa gần nhất -> gom về cụm.
    type MRep = MInfo & { count: number; last: string | null }
    const repByMachine = new Map<string, { count: number; last: string | null }>()
    for (const r of repairs || []) {
      if (!r.ngay || !memberInfo.has(r.id_khach_hang)) continue
      const s = repByMachine.get(r.id_khach_hang) || { count: 0, last: null }
      s.count++; if (!s.last || r.ngay > s.last) s.last = r.ngay
      repByMachine.set(r.id_khach_hang, s)
    }
    const cumRep = new Map<string, MRep[]>()  // cụm -> danh sách máy có sửa (kèm số lần/last)
    for (const [id, s] of repByMachine) {
      const info = memberInfo.get(id)!; const arr = cumRep.get(info.cum) || []
      arr.push({ ...info, count: s.count, last: s.last }); cumRep.set(info.cum, arr)
    }
    const mayLabel = (m: MRep) => `${m.ma_may || '—'}${m.model ? ` · ${m.model}` : ''}${m.vi_tri ? ` · ${m.vi_tri}` : ''}`

    // Log theo cụm: lần chăm gần nhất + hẹn của log mới nhất.
    const logAgg = new Map<string, { last: string | null; last_hen: string | null }>()
    for (const l of logs || []) {
      const a = logAgg.get(l.ma_khach_cum) || { last: null, last_hen: null }
      if (l.ngay && (!a.last || l.ngay >= a.last)) { a.last = l.ngay; a.last_hen = l.ngay_hen || null }
      logAgg.set(l.ma_khach_cum, a)
    }

    const counts: Record<string, number> = { hen: 0, hdbt: 0, moi_sua: 0, hay_hong: 0, lau: 0 }
    const rows: any[] = []
    for (const [ma, cum] of cums) {
      const lg = logAgg.get(ma)
      const mays = cumRep.get(ma) || []
      const sua60 = mays.reduce((s, m) => s + m.count, 0)
      // Hay hỏng: TỪNG MÁY ≥3 lần/60 ngày (KHÔNG cộng gộp cả cụm).
      const hayHong = mays.filter(m => m.count >= HAYHONG_MIN).sort((a, b) => b.count - a.count)
      // Mới sửa xong: máy vừa sửa ≤3 ngày và chưa chăm sóc sau đó.
      const moiSua = mays.filter(m => m.last && m.last >= d3 && (!lg?.last || lg.last < m.last)).sort((a, b) => String(b.last).localeCompare(String(a.last)))
      const reasons: { type: string; label: string; detail?: string; level: 'cao' | 'vua' | 'thap' }[] = []

      if (lg?.last_hen && lg.last_hen <= today) { reasons.push({ type: 'hen', label: `Đến hẹn chăm sóc`, level: 'cao' }); counts.hen++ }
      if (cum.hd_near) { reasons.push({ type: 'hdbt', label: `HĐ sắp/đã hết hạn`, level: 'cao' }); counts.hdbt++ }
      if (moiSua.length) {
        reasons.push({ type: 'moi_sua', label: `Mới sửa xong — hỏi thăm`, detail: moiSua.map(m => `${mayLabel(m)} (${fmtD(m.last!)})`).join(' · '), level: 'vua' }); counts.moi_sua++
      }
      if (hayHong.length) {
        const label = hayHong.length === 1 ? `Máy ${hayHong[0].ma_may || '—'} hay hỏng (${hayHong[0].count} lần/60 ngày)` : `${hayHong.length} máy hay hỏng (≥${HAYHONG_MIN} lần/60 ngày)`
        reasons.push({ type: 'hay_hong', label, detail: hayHong.map(m => `${mayLabel(m)}: ${m.count} lần`).join(' · '), level: 'vua' }); counts.hay_hong++
      }
      if (cum.loai_set && (!lg?.last || daysBetween(lg.last) >= LAU_NGAY)) {
        reasons.push({ type: 'lau', label: lg?.last ? `Lâu chưa liên hệ (${daysBetween(lg.last)} ngày)` : 'Chưa từng chăm sóc', level: 'thap' })
        counts.lau++
      }
      if (reasons.length === 0) continue
      const top = Math.max(...reasons.map(r => LV[r.level]))
      rows.push({
        ma_khach_cum: ma, ten_khach_hang: cum.ten,
        so_may: cum.so_may, hd_het_han: cum.hd_earliest, sua_60: sua60, lan_cham: lg?.last || null, hen: lg?.last_hen || null,
        reasons, level: top,
      })
    }
    rows.sort((a, b) => b.level - a.level || (b.sua_60 - a.sua_60) || String(a.hd_het_han || '9999').localeCompare(String(b.hd_het_han || '9999')))
    return NextResponse.json({ data: rows, counts, tong: rows.length })
  } catch (error: any) {
    console.error('Error GET cskh/can-cham-soc:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
