import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'
import { broadcastKhoChanged } from '@/lib/realtime'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Mốc 12 tháng gần nhất (gồm tháng hiện tại): 'YYYY-MM'.
function cutoff12(): string {
  const d = new Date(Date.now() + 7 * 3600 * 1000)
  d.setUTCMonth(d.getUTCMonth() - 11)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function chunkArray<T>(arr: T[], size = 150): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

const KHO_COLS = 'ma_hang, ten_hang, model, hang, ton_kho, nguong_dat, ngung_su_dung, ma_thay_the'
const notNgung = (k: any) => !k.ngung_su_dung && String(k.ngung_su_dung).toLowerCase() !== 'true'

// GET: danh sách ỨNG VIÊN cảnh báo tồn (mọi hãng), gồm:
//   - hàng đã từng nhập trong 12 tháng gần nhất, VÀ
//   - hàng ĐÃ đặt ngưỡng (nguong_dat != null) — dù nhập đã lâu, vẫn ở lại danh sách + vẫn cảnh báo.
// Mỗi mặt hàng kèm: tồn kho, hãng, model, ngưỡng đã đặt (nguong_dat), số lượng ĐANG CHỜ VỀ (đơn đã đặt, chưa nhận đủ).
// Client tự lọc "cần cảnh báo" = nguong_dat > 0 && ton_kho <= nguong_dat.
// ?find=<từ khóa>: tra TOÀN kho theo mã/tên (không giới hạn 12 tháng) để thêm ngưỡng cho mặt hàng cũ.
export async function GET(request: Request) {
  try {
    const session = await requireTab('kho_hang', 'kho_hang.thong_ke')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const find = (new URL(request.url).searchParams.get('find') || '').replace(/[%,()]/g, ' ').trim()

    const kho: any[] = []
    const seen = new Set<string>()
    const addKho = (rows: any[] | null) => {
      for (const k of (rows || [])) {
        if (!notNgung(k) || !k.ma_hang || seen.has(k.ma_hang)) continue
        seen.add(k.ma_hang); kho.push(k)
      }
    }

    if (find) {
      // (B) Tra toàn kho theo mã/tên — để chọn mặt hàng nhập đã lâu mà đặt ngưỡng.
      const like = `%${find}%`
      const found = await selectAll<any>((from, to) => supabaseAdmin
        .from('soct_kho_hang')
        .select(KHO_COLS)
        .or(`ma_hang.ilike.${like},ten_hang.ilike.${like}`)
        .range(from, to))
      addKho((found || []).slice(0, 200))
    } else {
      // (1) Mã hàng đã nhập trong 12 tháng gần nhất.
      const nhap = await selectAll<any>((from, to) => supabaseAdmin
        .from('soct_nhap_hang_thang')
        .select('ma_hang')
        .gte('thang_nam', cutoff12())
        .gt('so_luong_nhap', 0)
        .range(from, to))
      const maNhap = [...new Set((nhap || []).map((r: any) => r.ma_hang).filter(Boolean))]
      // (2) Trong số đó, lấy hàng trong kho (mọi hãng). Chunk để tránh vượt giới hạn URL PostgREST.
      for (const batch of chunkArray(maNhap, 150)) {
        addKho(await selectAll<any>((from, to) => supabaseAdmin
          .from('soct_kho_hang')
          .select(KHO_COLS)
          .in('ma_hang', batch)
          .range(from, to)))
      }
      // (A) Thêm MỌI hàng đã đặt ngưỡng (nguong_dat != null) dù nhập đã lâu -> ở lại danh sách + vẫn cảnh báo.
      addKho(await selectAll<any>((from, to) => supabaseAdmin
        .from('soct_kho_hang')
        .select(KHO_COLS)
        .not('nguong_dat', 'is', null)
        .range(from, to)))
    }

    if (kho.length === 0) return NextResponse.json({ items: [] })

    // Số lượng ĐANG CHỜ VỀ (đơn đã ĐẶT, dòng CHƯA hoàn thành -> sl_dat trừ đã nhận) cho 1 tập mã.
    const computeChoVe = async (mas: string[]): Promise<Record<string, number>> => {
      const choVe: Record<string, number> = {}
      for (const batch of chunkArray(mas, 150)) {
        const cts = await selectAll<any>((from, to) => supabaseAdmin
          .from('soct_dat_hang_ct')
          .select('ma_hang, sl_dat, soct_dat_hang!inner ( da_dat ), soct_hang_ve_dot ( so_luong_nhan )')
          .in('ma_hang', batch).eq('hoan_thanh', false).eq('soct_dat_hang.da_dat', true).range(from, to))
        for (const c of (cts || [])) {
          const daNhan = (c.soct_hang_ve_dot || []).reduce((s: number, r: any) => s + (Number(r.so_luong_nhan) || 0), 0)
          const conVe = Math.max(0, (Number(c.sl_dat) || 0) - daNhan)
          if (conVe > 0) choVe[c.ma_hang] = (choVe[c.ma_hang] || 0) + conVe
        }
      }
      return choVe
    }

    // Chế độ FIND (tra để ĐẶT/SỬA ngưỡng từng mã): trả PER-ITEM, KHÔNG gộp nhóm — để nhắm đúng 1 mã.
    if (find) {
      const choVe = await computeChoVe(kho.map((k: any) => k.ma_hang))
      const items = kho.map((k: any) => ({
        ma_hang: k.ma_hang, ten_hang: k.ten_hang, model: k.model, hang: k.hang,
        ton_kho: Number(k.ton_kho) || 0,
        nguong_dat: k.nguong_dat == null ? null : Number(k.nguong_dat),
        cho_ve: choVe[k.ma_hang] || 0,
      }))
      return NextResponse.json({ items })
    }

    // === GỘP NHÓM TƯƠNG ĐƯƠNG (chuỗi ma_thay_the): cảnh báo theo TỒN GỘP + ngưỡng MAX của nhóm ===
    // Nạp TOÀN kho (nhẹ) để cộng tồn mọi thành viên — kể cả mã mới chưa là ứng viên / mã ngưng dùng còn tồn.
    const allKho = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_kho_hang').select(KHO_COLS).range(from, to))
    const info = new Map<string, any>()
    for (const r of (allKho || [])) if (r?.ma_hang) info.set(r.ma_hang, r)
    // Nhóm tương đương = THÀNH PHẦN LIÊN THÔNG của đồ thị ma_thay_the, coi liên kết VÔ HƯỚNG -> bắt được
    // cả chuỗi A→B→C LẪN liên kết 2 CHIỀU / VÒNG (user hay set ma_thay_the cả 2 phía). Union-Find.
    const parent = new Map<string, string>()
    const ufFind = (x: string): string => {
      let r = x
      while ((parent.get(r) ?? r) !== r) r = parent.get(r)!
      let c = x
      while ((parent.get(c) ?? c) !== c) { const nx = parent.get(c)!; parent.set(c, r); c = nx }
      return r
    }
    const ufUnion = (a: string, b: string) => { const ra = ufFind(a), rb = ufFind(b); if (ra !== rb) parent.set(ra, rb) }
    for (const ma of info.keys()) parent.set(ma, ma)
    for (const [ma, r] of info) {
      const t = r?.ma_thay_the ? String(r.ma_thay_the).trim() : ''
      if (t && info.has(t)) ufUnion(ma, t)
    }
    // Gom MỌI mã theo gốc union-find -> thành viên đầy đủ của từng nhóm.
    const membersByRoot = new Map<string, string[]>()
    for (const ma of info.keys()) {
      const r = ufFind(ma)
      if (!membersByRoot.has(r)) membersByRoot.set(r, [])
      membersByRoot.get(r)!.push(ma)
    }
    // Đại diện nhóm (đặt hàng + gắn badge): ưu tiên mã CÒN DÙNG, rồi TỒN cao nhất, rồi mã lớn nhất.
    const pickRep = (members: string[]): string => {
      let best = members[0], bs: [number, number, string] = [-1, -1, '']
      for (const m of members) {
        const mi = info.get(m); if (!mi) continue
        const s: [number, number, string] = [mi.ngung_su_dung ? 0 : 1, Number(mi.ton_kho) || 0, m]
        if (s[0] > bs[0] || (s[0] === bs[0] && (s[1] > bs[1] || (s[1] === bs[1] && s[2] > bs[2])))) { best = m; bs = s }
      }
      return best
    }
    // Chỉ phát nhóm chứa ÍT NHẤT 1 ứng viên (kho). Dedup theo gốc union-find.
    const emitRoots = new Set<string>(kho.map((k: any) => ufFind(k.ma_hang)))
    const emitMas = new Set<string>()
    for (const r of emitRoots) for (const m of (membersByRoot.get(r) || [r])) emitMas.add(m)
    const choVe = await computeChoVe([...emitMas])

    const items = [...emitRoots].map(root => {
      const members = membersByRoot.get(root) || [root]
      const repMa = pickRep(members)
      const rep = info.get(repMa) || {}
      let ton = 0, choVeSum = 0, nguong: number | null = null
      const memberList: any[] = []
      for (const m of members) {
        const mi = info.get(m); if (!mi) continue
        const mt = Number(mi.ton_kho) || 0
        ton += mt; choVeSum += choVe[m] || 0
        const ng = mi.nguong_dat == null ? null : Number(mi.nguong_dat)
        if (ng != null && Number.isFinite(ng)) nguong = nguong == null ? ng : Math.max(nguong, ng)
        if (m !== repMa) memberList.push({ ma_hang: m, ton_kho: mt, ngung_su_dung: !!mi.ngung_su_dung })
      }
      return {
        ma_hang: repMa, ten_hang: rep.ten_hang, model: rep.model, hang: rep.hang,
        ton_kho: ton,             // TỒN GỘP cả nhóm
        nguong_dat: nguong,       // MAX ngưỡng các mã trong nhóm
        cho_ve: choVeSum,
        members: memberList,      // mã tương đương khác trong nhóm -> hiển thị ≡ + chẩn
      }
    })
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

    await logAudit(session, 'Lưu ngưỡng cảnh báo tồn kho', `${saved} mặt hàng`)
    await broadcastKhoChanged()
    return NextResponse.json({ success: true, saved })
  } catch (error: any) {
    console.error('Error PUT canh-bao-ton:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
