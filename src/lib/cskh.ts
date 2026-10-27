import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { getCauHinh } from '@/lib/config'

// Số tháng kể từ tháng 'YYYY-MM' tới nay. Rỗng = rất lâu.
export function monthsSince(ym: string | null): number {
  if (!ym) return 9999
  const [y, m] = String(ym).slice(0, 7).split('-').map(Number)
  if (!y || !m) return 9999
  const now = new Date(Date.now() + 7 * 3600 * 1000)
  return (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m)
}
export function autoPhanLoai(ym: string | null, nguyco: number, mat: number): string {
  const d = monthsSince(ym)
  if (d >= mat) return 'da_mat'
  if (d >= nguyco) return 'nguy_co'
  return 'dang_dung'
}
// Ngưỡng (tháng) phân loại — cấu hình qua soct_cau_hinh, mặc định 6 / 12.
export async function nguongPhanLoai(): Promise<{ nguyco: number; mat: number }> {
  const cfg = await getCauHinh()
  const nguyco = Math.max(1, Number(cfg['cskh_nguong_nguyco']) || 6)
  const mat = Math.max(nguyco + 1, Number(cfg['cskh_nguong_mat']) || 12)
  return { nguyco, mat }
}

// Loại việc tính là "lần phục vụ" đưa vào CSKH (chốt với user): Sửa chữa, Thay vật tư, Giao mực, Lắp đặt.
// Bỏ Bảo trì/Kiểm tra/Khác (ít liên quan "khách mua lẻ cần hướng mua lại").
export function laLoaiPhucVuCSKH(loai: string): boolean {
  const s = (loai || '').toLowerCase()
  return s.includes('sửa') || s.includes('vật tư') || s.includes('mực') || s.includes('lắp')
}

// Đồng bộ CSKH từ PHIẾU GIAO VIỆC đã Hoàn thành (nguồn sống). maList rỗng/thiếu = toàn bộ.
// Idempotent: xóa lịch sử nguon='phieu' trong phạm vi rồi tái tạo; KHÔNG đụng dòng nguon='import'.
// Tự tạo máy mới (có phiếu nhưng chưa trong CSKH, đã khớp điểm máy). Tính lại lan_cuoi/so_lan/vật tư gần nhất.
export async function syncCskhFromPhieu(maList?: string[]): Promise<{ may: number; lichsu_them: number; tao_moi: number }> {
  const scoped = Array.isArray(maList) && maList.length > 0
  const sel = 'id, ma_may, ngay, loai_cong_viec, mien_phi, soct_chi_tiet_vat_tu(ma_hang, ten_hang_hd, da_tra, soct_kho_hang(ten_hang))'
  const phieu = await selectAll<any>((f, t) => {
    let q = supabaseAdmin.from('soct_cong_viec').select(sel).eq('ket_qua', 'Hoàn thành').not('ma_may', 'is', null)
    if (scoped) q = q.in('ma_may', maList as string[])
    return q.range(f, t)
  })

  // Gom lịch sử theo máy từ phiếu hợp lệ (bỏ miễn phí + chỉ loại việc phục vụ).
  const perMa = new Map<string, { thang: string; vat_tu: string; id_cong_viec: string }[]>()
  for (const p of phieu || []) {
    if (p.mien_phi) continue
    if (!laLoaiPhucVuCSKH(p.loai_cong_viec)) continue
    const ma = String(p.ma_may || '').trim()
    const thang = String(p.ngay || '').slice(0, 7)
    if (!ma || !/^\d{4}-\d{2}$/.test(thang)) continue
    const arr = perMa.get(ma) || []
    const vts = (p.soct_chi_tiet_vat_tu || []).filter((v: any) => !v.da_tra)
    if (vts.length) {
      for (const v of vts) {
        const ten = (v.ten_hang_hd || v.soct_kho_hang?.ten_hang || v.ma_hang || '').trim()
        if (ten) arr.push({ thang, vat_tu: ten, id_cong_viec: p.id })
      }
    } else {
      // Phiếu không thay vật tư (vd sửa chữa) -> vẫn ghi 1 lượt để lan_cuoi tiến.
      arr.push({ thang, vat_tu: `Dịch vụ: ${String(p.loai_cong_viec || 'phục vụ').trim()}`, id_cong_viec: p.id })
    }
    perMa.set(ma, arr)
  }

  const scope = scoped ? (maList as string[]) : [...perMa.keys()]
  if (scope.length === 0) return { may: 0, lichsu_them: 0, tao_moi: 0 }

  // Xóa lịch sử nguon='phieu' cũ trong phạm vi -> tái tạo (idempotent).
  for (let i = 0; i < scope.length; i += 200) {
    await supabaseAdmin.from('soct_cskh_lichsu').delete().eq('nguon', 'phieu').in('ma_may', scope.slice(i, i + 200))
  }

  // Khóa đã tồn tại (import + sót) -> tránh đụng unique (ma_may,thang,md5(vat_tu)).
  const existLs = await selectAll<any>((f, t) => supabaseAdmin.from('soct_cskh_lichsu').select('ma_may, thang, vat_tu').in('ma_may', scope).range(f, t))
  const seen = new Set<string>((existLs || []).map((l: any) => `${l.ma_may}|${l.thang}|${l.vat_tu || ''}`))

  const toIns: any[] = []
  for (const [ma, items] of perMa) {
    if (scoped && !(maList as string[]).includes(ma)) continue
    for (const it of items) {
      const key = `${ma}|${it.thang}|${it.vat_tu}`
      if (seen.has(key)) continue
      seen.add(key)
      toIns.push({ ma_may: ma, thang: it.thang, vat_tu: it.vat_tu, nguon: 'phieu', id_cong_viec: it.id_cong_viec })
    }
  }
  for (let i = 0; i < toIns.length; i += 500) {
    const { error } = await supabaseAdmin.from('soct_cskh_lichsu').insert(toIns.slice(i, i + 500))
    if (error) throw error
  }

  // Máy đã có trong CSKH?
  const exMay = await selectAll<any>((f, t) => supabaseAdmin.from('soct_cskh_may').select('ma_may').in('ma_may', scope).range(f, t))
  const exSet = new Set<string>((exMay || []).map((m: any) => String(m.ma_may)))

  // Tự tạo máy mới (có phiếu nhưng chưa trong CSKH) — khớp điểm máy.
  let taoMoi = 0
  const byMa = await layMapDiemMay()
  const newMay = [...perMa.keys()].filter(ma => scope.includes(ma) && !exSet.has(ma)).map(ma => {
    const app = byMa.get(ma)
    return {
      ma_may: ma,
      ten_khach_hang: app?.ten_khach_hang || null, ma_khach_cum: app?.ma_khach_cum || null,
      ten_cum: app?.ten_cum || null, model: app?.model || null, dia_chi: app?.dia_chi || null,
      khop_diem_may: !!app,
    }
  })
  if (newMay.length) {
    const { error } = await supabaseAdmin.from('soct_cskh_may').upsert(newMay, { onConflict: 'ma_may', ignoreDuplicates: true })
    if (error) throw error
    taoMoi = newMay.length
    for (const n of newMay) exSet.add(n.ma_may)
  }

  // Tính lại lan_cuoi / so_lan_lay / vat_tu_gan_nhat từ TOÀN BỘ lịch sử (import + phiếu) cho scope.
  const allLs = await selectAll<any>((f, t) => supabaseAdmin.from('soct_cskh_lichsu').select('ma_may, thang, vat_tu').in('ma_may', scope).range(f, t))
  const byMaLs = new Map<string, { max: string; count: number; vtMax: string }>()
  for (const l of allLs || []) {
    const ma = String(l.ma_may)
    const o = byMaLs.get(ma) || { max: '', count: 0, vtMax: '' }
    o.count++
    if ((l.thang || '') > o.max) { o.max = l.thang; o.vtMax = l.vat_tu || '' }
    byMaLs.set(ma, o)
  }
  const upMay = [...byMaLs.entries()].filter(([ma]) => exSet.has(ma)).map(([ma, o]) => ({
    ma_may: ma, lan_cuoi: o.max || null, so_lan_lay: o.count, vat_tu_gan_nhat: o.vtMax || null, updated_at: new Date().toISOString(),
  }))
  for (let i = 0; i < upMay.length; i += 500) {
    const { error } = await supabaseAdmin.from('soct_cskh_may').upsert(upMay.slice(i, i + 500), { onConflict: 'ma_may' })
    if (error) throw error
  }

  return { may: byMaLs.size, lichsu_them: toIns.length, tao_moi: taoMoi }
}

// Tra điểm máy (app) theo ma_may -> tên khách/model/địa chỉ/cụm chuẩn. Dùng chung GET/POST/import.
export async function layMapDiemMay() {
  const [mays, cums] = await Promise.all([
    selectAll<any>((f, t) => supabaseAdmin.from('soct_khach_hang').select('ma_may, ten_khach_hang, model, dia_chi, ma_khach_cum').not('ma_may', 'is', null).range(f, t)),
    selectAll<any>((f, t) => supabaseAdmin.from('soct_khach_cum').select('ma_khach_hang, ten_khach_hang').range(f, t)),
  ])
  const cumTen = new Map<string, string>()
  for (const c of cums || []) cumTen.set(String(c.ma_khach_hang), c.ten_khach_hang || '')
  const byMa = new Map<string, { ten_khach_hang: string; model: string; dia_chi: string; ma_khach_cum: string; ten_cum: string }>()
  for (const m of mays || []) {
    const k = String(m.ma_may).trim()
    if (k && !byMa.has(k)) byMa.set(k, {
      ten_khach_hang: m.ten_khach_hang || '', model: m.model || '', dia_chi: m.dia_chi || '',
      ma_khach_cum: m.ma_khach_cum || '', ten_cum: m.ma_khach_cum ? (cumTen.get(String(m.ma_khach_cum)) || '') : '',
    })
  }
  return byMa
}
