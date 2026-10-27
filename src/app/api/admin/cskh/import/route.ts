import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { broadcastCskhChanged } from '@/lib/realtime'
import { layMapDiemMay } from '@/lib/cskh'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const gate = () => requireTab('cong_viec', 'cong_viec.cham_soc_kh')
const PHONE = /0\d[\d.\s]{7,13}\d/

// Tách cột "Vật tư + Người liên hệ" -> { dien_thoai, nguoi, vat_tu(ngắn) }.
function parseLienHe(raw: string) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim()
  const pm = s.match(PHONE)
  const dien_thoai = pm ? pm[0].replace(/[^\d]/g, '') : ''
  const segs = s.split(/\s*[-–—]\s*/).map(x => x.trim()).filter(Boolean)
  const vat_tu = (segs[0] || s).slice(0, 120)
  const nameSeg = segs.find(x => PHONE.test(x)) || (segs.length > 1 ? segs[segs.length - 1] : '')
  let nguoi = nameSeg.replace(new RegExp(PHONE, 'g'), '').replace(/b[áa]o gi[áa][^-]*/i, '').replace(/[.\-\s]+$/, '').replace(/^[.\-\s]+/, '').trim()
  if (nguoi.length > 60) nguoi = nguoi.slice(0, 60)
  return { dien_thoai, nguoi, vat_tu }
}
// Chuẩn hóa "thời điểm" về 'YYYY-MM'.
function normThang(v: any): string {
  const s = String(v || '').trim()
  let m = s.match(/(\d{4})[-/.](\d{1,2})/); if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}`
  m = s.match(/(\d{1,2})[-/.](\d{4})/); if (m) return `${m[2]}-${String(m[1]).padStart(2, '0')}`
  const d = new Date(s); if (!isNaN(d.getTime())) return d.toISOString().slice(0, 7)
  return ''
}

// POST { rows: [{ ma_may, ten, model, lienhe, thang }] } — bulk import, UPSERT theo mã máy (chạy lại được).
export async function POST(request: Request) {
  try {
    const session = await gate()
    if (!session) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
    const body = await request.json()
    const inRows: any[] = Array.isArray(body?.rows) ? body.rows : []
    if (!inRows.length) return NextResponse.json({ error: 'Không có dòng nào để import' }, { status: 400 })

    // Gom theo mã máy.
    type MayAgg = { ma: string; tenExcel: string; modelExcel: string; lichsu: { thang: string; vat_tu: string }[]; latest: { thang: string; raw: string } | null }
    const perMa = new Map<string, MayAgg>()
    for (const r of inRows) {
      const ma = String(r.ma_may ?? '').trim()
      if (!ma) continue
      const thang = normThang(r.thang)
      const raw = String(r.lienhe ?? '').trim()
      const o = perMa.get(ma) || { ma, tenExcel: '', modelExcel: '', lichsu: [], latest: null }
      if (!o.tenExcel && r.ten) o.tenExcel = String(r.ten).trim()
      if (!o.modelExcel && r.model) o.modelExcel = String(r.model).trim()
      if (thang) o.lichsu.push({ thang, vat_tu: raw })
      if (raw || thang) { if (!o.latest || (thang && thang > (o.latest.thang || ''))) o.latest = { thang, raw } }
      perMa.set(ma, o)
    }
    if (!perMa.size) return NextResponse.json({ error: 'Không có mã máy hợp lệ' }, { status: 400 })

    const maList = [...perMa.keys()]
    const [byMa, exLichsu, exMay] = await Promise.all([
      layMapDiemMay(),
      selectAll<any>((f, t) => supabaseAdmin.from('soct_cskh_lichsu').select('ma_may, thang, vat_tu').in('ma_may', maList).range(f, t)),
      selectAll<any>((f, t) => supabaseAdmin.from('soct_cskh_may').select('ma_may, ten_khach_hang, nguoi_lien_he, dien_thoai, vat_tu_gan_nhat, lan_cuoi').in('ma_may', maList).range(f, t)),
    ])

    // Set lịch sử đã có + đếm/Điểm tháng lớn nhất đã có theo máy.
    const seen = new Set<string>()
    const exCount = new Map<string, number>()
    const exMax = new Map<string, string>()
    for (const l of exLichsu || []) {
      const key = `${l.ma_may}|${l.thang}|${l.vat_tu || ''}`
      seen.add(key)
      exCount.set(l.ma_may, (exCount.get(l.ma_may) || 0) + 1)
      if (!exMax.get(l.ma_may) || l.thang > (exMax.get(l.ma_may) as string)) exMax.set(l.ma_may, l.thang)
    }
    const exMayMap = new Map<string, any>()
    for (const m of exMay || []) exMayMap.set(m.ma_may, m)

    // Dòng lịch sử MỚI (chưa có) + đếm theo máy.
    const newLichsu: { ma_may: string; thang: string; vat_tu: string }[] = []
    const newCount = new Map<string, number>()
    for (const o of perMa.values()) {
      for (const h of o.lichsu) {
        const key = `${o.ma}|${h.thang}|${h.vat_tu || ''}`
        if (seen.has(key)) continue
        seen.add(key)
        newLichsu.push({ ma_may: o.ma, thang: h.thang, vat_tu: h.vat_tu || null as any, nguon: 'import' } as any)
        newCount.set(o.ma, (newCount.get(o.ma) || 0) + 1)
      }
    }

    // Upsert hồ sơ máy (chỉ cột import, GIỮ nguyên giai_doan/phan_loai/ghi_chu).
    let khop = 0, chuaKhop = 0
    const upRows = [...perMa.values()].map(o => {
      const app = byMa.get(o.ma)
      if (app) khop++; else chuaKhop++
      const ex = exMayMap.get(o.ma)
      const payloadMax = o.lichsu.reduce((mx, h) => h.thang > mx ? h.thang : mx, '')
      const lan_cuoi = [payloadMax, exMax.get(o.ma) || '', ex?.lan_cuoi || ''].reduce((mx, x) => x > mx ? x : mx, '') || null
      const parsed = o.latest ? parseLienHe(o.latest.raw) : { dien_thoai: '', nguoi: '', vat_tu: '' }
      // Chỉ cập nhật liên hệ/vật tư khi dòng mới nhất của import là MỚI NHẤT (không đè bằng dữ liệu cũ hơn).
      const importIsLatest = (o.latest?.thang || '') >= (ex?.lan_cuoi || '')
      const so_lan = (exCount.get(o.ma) || 0) + (newCount.get(o.ma) || 0)
      return {
        ma_may: o.ma,
        ten_khach_hang: app?.ten_khach_hang || o.tenExcel || ex?.ten_khach_hang || null,
        ma_khach_cum: app?.ma_khach_cum || null,
        ten_cum: app?.ten_cum || null,
        model: app?.model || o.modelExcel || null,
        dia_chi: app?.dia_chi || null,
        nguoi_lien_he: (importIsLatest && parsed.nguoi) ? parsed.nguoi : (ex?.nguoi_lien_he || null),
        dien_thoai: (importIsLatest && parsed.dien_thoai) ? parsed.dien_thoai : (ex?.dien_thoai || null),
        vat_tu_gan_nhat: (importIsLatest && parsed.vat_tu) ? parsed.vat_tu : (ex?.vat_tu_gan_nhat || null),
        lan_cuoi,
        so_lan_lay: so_lan,
        khop_diem_may: !!app,
        updated_at: new Date().toISOString(),
      }
    })

    for (let i = 0; i < upRows.length; i += 500) {
      const { error } = await supabaseAdmin.from('soct_cskh_may').upsert(upRows.slice(i, i + 500), { onConflict: 'ma_may' })
      if (error) throw error
    }
    for (let i = 0; i < newLichsu.length; i += 500) {
      const { error } = await supabaseAdmin.from('soct_cskh_lichsu').insert(newLichsu.slice(i, i + 500))
      if (error) throw error
    }

    await logAudit(session, 'Import CSKH', `${perMa.size} máy · ${newLichsu.length} lượt mới`)
    await broadcastCskhChanged()
    return NextResponse.json({ success: true, may: perMa.size, lichsu_them: newLichsu.length, khop, chua_khop: chuaKhop })
  } catch (error: any) {
    console.error('Error import cskh:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
