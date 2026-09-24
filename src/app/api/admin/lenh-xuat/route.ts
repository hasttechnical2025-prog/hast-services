import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { broadcastLenhXuatChanged } from '@/lib/realtime'

export const runtime = 'nodejs'

// Endpoint RIÊNG cho Lệnh xuất hàng (phòng kinh doanh). KHÔNG đụng soct_cong_viec.
// Cách ly: NV kinh_doanh chỉ thấy/sửa lệnh của MÌNH; sale_admin (kinh_doanh + kd_quan_ly) & admin thấy tất cả.

// Lấy cờ quản lý của phiên hiện tại (sale_admin?) + xác định quyền xem-tất-cả.
async function scope(session: any) {
  if (session.role === 'admin') return { isManager: true }
  // kinh_doanh: tra cờ kd_quan_ly
  const { data } = await supabaseAdmin.from('soct_users').select('kd_quan_ly').eq('id', session.id).maybeSingle()
  return { isManager: !!data?.kd_quan_ly }
}

// GET: danh sách lệnh (đã scope theo role) kèm dòng hàng.
// Cấp số lệnh tự động: YYMMDD-xx (prefix theo NGÀY LẬP, xx tăng dần & reset mỗi ngày).
async function nextSoLenh(ngay?: string): Promise<string> {
  const d = String(ngay || new Date(Date.now() + 7 * 3600 * 1000).toISOString()).slice(0, 10)
  const p = d.split('-')
  const prefix = p.length === 3 ? `${p[0].slice(2)}${p[1]}${p[2]}` : ''
  if (!prefix) return ''
  const { data } = await supabaseAdmin.from('soct_lenh_xuat').select('so_lenh').like('so_lenh', `${prefix}-%`)
  let max = 0
  for (const r of (data || [])) { const m = String(r.so_lenh || '').match(/-(\d+)$/); if (m) max = Math.max(max, parseInt(m[1], 10)) }
  return `${prefix}-${String(max + 1).padStart(2, '0')}`
}

// ===== KANBAN (đọc-thôi) — nguồn KINH DOANH đổ vào Kanban Hóa đơn =====
// CHỈ admin/kthc (kế toán) thấy thẻ KD; tech_admin/staff = chỉ phiếu kỹ thuật (không gọi endpoint này).
// Shape KD SẠCH RIÊNG (không giả dạng soct_cong_viec) -> component vẽ nhánh thẻ KD riêng, KHÔNG đụng
// path render kỹ thuật. Lọc 4 trạng thái + kỳ cột 4 GIỐNG route kanban-hd kỹ thuật để nhất quán.
async function kanbanGet(searchParams: URLSearchParams) {
  const session = await requireRole('admin', 'kthc')
  if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

  // ?count=1 -> đếm thẻ col1/col2 cho chuông (giống kanban-hd). Mỗi lệnh = 1 thẻ (KD không gom cụm auto).
  if (searchParams.get('count') === '1') {
    const rows = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_lenh_xuat').select('id, trang_thai_hd')
      .in('trang_thai_hd', ['Chờ xuất HĐ', 'Đang xử lý HĐ']).range(from, to))
    let c1 = 0, c2 = 0
    for (const t of (rows || [])) { if (t.trang_thai_hd === 'Chờ xuất HĐ') c1++; else c2++ }
    return NextResponse.json({ col1: c1, col2: c2, col1_phieu: c1, col2_phieu: c2 })
  }

  // Kỳ cột 4 (YYYY-MM) theo THÁNG THU (thanh_toan_luc, giờ VN) — khớp kanban-hd.
  const reqThang = searchParams.get('thang_nam')
  let thangStr = ''
  if (reqThang && /^\d{4}-\d{2}$/.test(reqThang)) thangStr = reqThang
  else { const vn = new Date(Date.now() + 7 * 3600 * 1000); thangStr = `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, '0')}` }

  const rows = await selectAll<any>((from, to) => supabaseAdmin
    .from('soct_lenh_xuat')
    .select(`*, soct_lenh_xuat_ct(*), nguoi_kd:soct_users!nguoi_kinh_doanh_id(full_name)`)
    .in('trang_thai_hd', ['Chờ xuất HĐ', 'Đang xử lý HĐ', 'Đã lên hóa đơn', 'Đã thanh toán'])
    .order('ngay', { ascending: false }).range(from, to))

  const filtered = (rows || []).filter((j: any) => {
    if (j.trang_thai_hd === 'Đã lên hóa đơn') return j.ngay_xuat_hd !== null
    if (j.trang_thai_hd === 'Đã thanh toán') return !!j.thanh_toan_luc && String(j.thanh_toan_luc).slice(0, 7) === thangStr
    return true
  })

  // Thu tiền theo lệnh (soct_thu_tien): đã thu = SUM khoản DA_DUYET; chờ duyệt = SUM CHO_DUYET.
  // Neo theo lenh_id (đặt cọc có thể trước khi có số HĐ) — KHÔNG dùng soct_hd_thu (đó là luồng kỹ thuật).
  const lenhIds = filtered.map((r: any) => r.id)
  const daThu = new Map<string, number>(), choDuyet = new Map<string, number>()
  if (lenhIds.length) {
    const thu = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_thu_tien').select('lenh_id, so_tien, trang_thai').in('lenh_id', lenhIds).range(from, to))
    for (const r of (thu || [])) {
      const m = r.trang_thai === 'da_duyet' ? daThu : choDuyet
      m.set(r.lenh_id, (m.get(r.lenh_id) || 0) + (Number(r.so_tien) || 0))
    }
  }

  const data = filtered.map((r: any) => {
    const lines = (r.soct_lenh_xuat_ct || []).slice().sort((a: any, b: any) => (a.stt || 0) - (b.stt || 0))
    const tongTruocVat = lines.reduce((s: number, l: any) => s + Math.round((Number(l.so_luong) || 0) * (Number(l.don_gia) || 0)), 0)
    const tongSauVat = lines.reduce((s: number, l: any) => { const tt = (Number(l.so_luong) || 0) * (Number(l.don_gia) || 0); return s + tt * (1 + (Number(l.vat) || 0) / 100) }, 0) + (Number(r.lam_tron) || 0)
    return {
      id: r.id, nguon: 'lenh_xuat',
      so_lenh: r.so_lenh, ngay: r.ngay, so_hop_dong: r.so_hop_dong || null,
      ten_khach_hang: r.ten_khach_hang, dia_chi: r.dia_chi, ma_so_thue: r.ma_so_thue,
      nguoi_kinh_doanh_id: r.nguoi_kinh_doanh_id, nguoi_kd_ten: r.nguoi_kd?.full_name || '',
      trang_thai_hd: r.trang_thai_hd, so_hoa_don: r.so_hoa_don, ngay_xuat_hd: r.ngay_xuat_hd, ly_do_tra: r.ly_do_tra || null,
      ban_giao_kt_luc: r.ban_giao_kt_luc, thanh_toan_luc: r.thanh_toan_luc,
      tach_rieng: r.tach_rieng, lam_tron: r.lam_tron, ten_khach_hd: r.ten_khach_hd,
      minvoice_luc: r.minvoice_luc, minvoice_lan: r.minvoice_lan,
      dntt_luc: r.dntt_luc, so_dntt: r.so_dntt, dntt_lan: r.dntt_lan,
      lines: lines.map((l: any) => ({ stt: l.stt, ma_hang: l.ma_hang, ten_hang: l.ten_hang, ten_hang_hd: l.ten_hang_hd, dvt: l.dvt, so_luong: Number(l.so_luong) || 0, don_gia: Number(l.don_gia) || 0, vat: Number(l.vat) || 0, thanh_tien: Math.round((Number(l.so_luong) || 0) * (Number(l.don_gia) || 0)) })),
      tong_truoc_vat: tongTruocVat, tong_sau_vat: Math.round(tongSauVat),
      da_thu: Math.round(daThu.get(r.id) || 0), cho_duyet: Math.round(choDuyet.get(r.id) || 0),
    }
  })
  return NextResponse.json({ data })
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    if (searchParams.get('kanban') === '1') return await kanbanGet(searchParams)

    const session = await requireRole('admin', 'kinh_doanh')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    const { isManager } = await scope(session)

    // Gợi ý số lệnh kế tiếp cho form (theo ngày lập) — server vẫn cấp lại lúc lưu để không trùng.
    const nextLenh = searchParams.get('next_lenh')
    if (nextLenh !== null) return NextResponse.json({ next_so_lenh: await nextSoLenh(nextLenh) })

    const id = searchParams.get('id')

    if (id) {
      const { data, error } = await supabaseAdmin
        .from('soct_lenh_xuat')
        .select(`*, soct_lenh_xuat_ct(*), nguoi_kd:soct_users!nguoi_kinh_doanh_id(full_name)`)
        .eq('id', id).single()
      if (error || !data) return NextResponse.json({ error: 'Không tìm thấy lệnh' }, { status: 404 })
      // NV chỉ xem lệnh của mình
      if (!isManager && data.nguoi_kinh_doanh_id !== session.id) {
        return NextResponse.json({ error: 'Không có quyền xem lệnh này' }, { status: 403 })
      }
      if (data.soct_lenh_xuat_ct) data.soct_lenh_xuat_ct.sort((a: any, b: any) => (a.stt || 0) - (b.stt || 0))
      return NextResponse.json({ data })
    }

    const rows = await selectAll<any>((from, to) => {
      let q = supabaseAdmin
        .from('soct_lenh_xuat')
        .select(`*, soct_lenh_xuat_ct(*), nguoi_kd:soct_users!nguoi_kinh_doanh_id(full_name)`)
      if (!isManager) q = q.eq('nguoi_kinh_doanh_id', session.id)   // NV chỉ thấy của mình (scope ở SERVER)
      return q.order('ngay', { ascending: false }).order('created_at', { ascending: false }).range(from, to)
    })
    return NextResponse.json({ data: rows || [], isManager })
  } catch (error: any) {
    console.error('Error GET lenh-xuat:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Chuẩn hóa dòng hàng (bỏ dòng trống, tính thành tiền server-side).
function buildLines(lenhId: string, arr: any[]) {
  return (Array.isArray(arr) ? arr : [])
    .filter((r: any) => r && (String(r.ma_hang || '').trim() || String(r.ten_hang || '').trim()))
    .map((r: any, i: number) => {
      const sl = Number(r.so_luong) || 0
      const dg = Number(r.don_gia) || 0
      return {
        lenh_id: lenhId,
        stt: r.stt || (i + 1),
        ma_hang: (r.ma_hang || '').trim() || null,
        ten_hang: (r.ten_hang || '').trim() || null,
        ten_hang_hd: (r.ten_hang_hd || '').trim() || null,
        dvt: (r.dvt || '').trim() || 'Cái',
        so_luong: sl,
        don_gia: dg,
        vat: Number(r.vat) || 0,
        thanh_tien: Math.round(sl * dg),
        ghi_chu: (r.ghi_chu || '').trim() || null,
      }
    })
}

// POST: tạo lệnh mới (kinh_doanh/admin). NV -> gán chính mình; sale_admin -> gán NV bất kỳ.
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'kinh_doanh')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    const { isManager } = await scope(session)

    const b = await request.json()
    if (!b.ten_khach_hang || !String(b.ten_khach_hang).trim()) {
      return NextResponse.json({ error: 'Vui lòng nhập tên khách hàng' }, { status: 400 })
    }
    const nvId = isManager ? (b.nguoi_kinh_doanh_id || session.id) : session.id

    const { data: lenh, error } = await supabaseAdmin
      .from('soct_lenh_xuat')
      .insert({
        so_lenh: await nextSoLenh(b.ngay),   // server TỰ cấp (YYMMDD-xx), không nhận từ client
        ngay: b.ngay || undefined,
        ten_khach_hang: String(b.ten_khach_hang).trim(),
        dia_chi: (b.dia_chi || '').trim() || null,
        ma_so_thue: (b.ma_so_thue || '').trim() || null,
        so_hop_dong: (b.so_hop_dong || '').trim() || null,
        id_khach_hang: b.id_khach_hang || null,
        nguoi_kinh_doanh_id: nvId,
        created_by: session.id,
        ghi_chu: (b.ghi_chu || '').trim() || null,
        trang_thai_hd: 'Chờ xuất HĐ',
      })
      .select('id')
      .single()
    if (error || !lenh) return NextResponse.json({ error: error?.message || 'Lỗi tạo lệnh' }, { status: 500 })

    const lines = buildLines(lenh.id, b.lines)
    if (lines.length > 0) {
      const { error: e2 } = await supabaseAdmin.from('soct_lenh_xuat_ct').insert(lines)
      if (e2) console.error('Lỗi thêm dòng lệnh xuất:', e2)
    }
    await logAudit(session, 'Tạo lệnh xuất hàng', `KH ${String(b.ten_khach_hang).trim()}`)
    await broadcastLenhXuatChanged()   // đẩy realtime -> mọi bàn KD/admin thấy lệnh mới ngay (không cần refresh)
    return NextResponse.json({ data: lenh, success: true })
  } catch (error: any) {
    console.error('Error POST lenh-xuat:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ===== KANBAN PUT (kéo trạng thái) — dispatch RIÊNG cho nguồn KINH DOANH =====
// Ma trận quyền: cột 1->2 (bàn giao) = CHỈ sale_admin (kinh_doanh+kd_quan_ly) / admin;
// lên HĐ (->Đã lên hóa đơn) & thanh toán (->Đã thanh toán) & trả về (->Chờ xuất HĐ) = CHỈ kthc/admin.
// KHÔNG đụng soct_hd_thu (đó là luồng kỹ thuật). Thu tiền KD neo soct_thu_tien.lenh_id -> KHÔNG xóa
// khi trả về cột 1 (đặt cọc là cash đã nộp quỹ).
async function kanbanPut(body: any) {
  const session = await requireRole('admin', 'kthc', 'kinh_doanh')
  if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

  const isAdmin = session.role === 'admin'
  const isKeToan = isAdmin || session.role === 'kthc'
  let isSaleAdmin = isAdmin
  if (session.role === 'kinh_doanh') {
    const { data } = await supabaseAdmin.from('soct_users').select('kd_quan_ly').eq('id', session.id).maybeSingle()
    isSaleAdmin = !!data?.kd_quan_ly
  }

  const { id, ids, trang_thai_hd, so_hoa_don, ngay_xuat_hd, ly_do_tra, tach_rieng } = body
  if (!id && (!Array.isArray(ids) || ids.length === 0)) {
    return NextResponse.json({ error: 'Thiếu ID lệnh' }, { status: 400 })
  }
  const targetIds: string[] = ids || [id]

  const allowed = ['Chờ xuất HĐ', 'Đang xử lý HĐ', 'Đã lên hóa đơn', 'Đã thanh toán']
  if (!allowed.includes(trang_thai_hd)) return NextResponse.json({ error: 'Trạng thái không hợp lệ' }, { status: 400 })

  // Trạng thái hiện tại (để gate chuyển tiếp). Mọi ID phải tồn tại + cùng 1 cột nguồn.
  const { data: curRows } = await supabaseAdmin.from('soct_lenh_xuat').select('id, trang_thai_hd').in('id', targetIds)
  if ((curRows || []).length !== new Set(targetIds).size) return NextResponse.json({ error: 'Không tìm thấy lệnh (có thể đã bị xóa) — tải lại trang.' }, { status: 404 })
  const fromStates = new Set((curRows || []).map((r: any) => r.trang_thai_hd))
  if (fromStates.size !== 1) return NextResponse.json({ error: 'Các lệnh đang ở khác cột — thao tác từng lệnh.' }, { status: 400 })
  const fromState = [...fromStates][0]
  if (fromState === trang_thai_hd) return NextResponse.json({ success: true, count: 0 })
  const isHandover = fromState === 'Chờ xuất HĐ' && trang_thai_hd === 'Đang xử lý HĐ'

  // GATE quyền theo hành động:
  if (isHandover) {
    // Bàn giao kế toán (cột 1 -> 2): CHỈ sale_admin/admin.
    if (!isSaleAdmin) return NextResponse.json({ error: 'Chỉ quản lý kinh doanh (sale_admin) mới được bàn giao lệnh cho kế toán.' }, { status: 403 })
    // Không bàn giao lệnh RỖNG (không dòng hàng) -> kế toán không có gì để lên HĐ.
    const { count } = await supabaseAdmin.from('soct_lenh_xuat_ct').select('id', { count: 'exact', head: true }).in('lenh_id', targetIds)
    if ((count || 0) === 0) return NextResponse.json({ error: 'Lệnh chưa có dòng hàng — không bàn giao được.' }, { status: 400 })
  } else {
    // Mọi chuyển khác: CHỈ kế toán. kthc đi theo ma trận (giống kỹ thuật + trả về 2->1 kèm lý do);
    // admin được mọi hướng (sửa sai).
    if (!isKeToan) return NextResponse.json({ error: 'Chỉ kế toán (KT-HC) mới được lên hóa đơn / thanh toán / trả về.' }, { status: 403 })
    const KTHC_OK = new Set([
      'Đang xử lý HĐ>Đã lên hóa đơn', 'Đã lên hóa đơn>Đã thanh toán', 'Đã thanh toán>Đã lên hóa đơn',
      'Đã lên hóa đơn>Đang xử lý HĐ', 'Đang xử lý HĐ>Chờ xuất HĐ',
    ])
    if (!isAdmin && !KTHC_OK.has(`${fromState}>${trang_thai_hd}`)) {
      return NextResponse.json({ error: 'Chuyển trạng thái không hợp lệ đối với Kế toán.' }, { status: 403 })
    }
    if (!isAdmin && fromState === 'Đang xử lý HĐ' && trang_thai_hd === 'Chờ xuất HĐ' && !String(ly_do_tra || '').trim()) {
      return NextResponse.json({ error: 'Nhập lý do trả lại để phòng kinh doanh biết cần sửa gì.' }, { status: 400 })
    }
  }

  if (trang_thai_hd === 'Đã lên hóa đơn' && (!so_hoa_don || !String(so_hoa_don).trim())) {
    return NextResponse.json({ error: 'Yêu cầu điền số hóa đơn trước khi hoàn thành.' }, { status: 400 })
  }
  // Số HĐ KD phải DUY NHẤT (1 thẻ = 1 số HĐ = 1 nguồn) — chặn cứng trùng với lệnh khác hoặc phiếu kỹ thuật.
  if (trang_thai_hd === 'Đã lên hóa đơn' && fromState === 'Đang xử lý HĐ') {
    const so = String(so_hoa_don).trim()
    const [{ data: dupLx }, { data: dupCv }] = await Promise.all([
      supabaseAdmin.from('soct_lenh_xuat').select('so_lenh').ilike('so_hoa_don', so).not('id', 'in', `(${targetIds.join(',')})`).limit(1),
      supabaseAdmin.from('soct_cong_viec').select('report').ilike('so_hoa_don', so).limit(1),
    ])
    if (dupLx?.length) return NextResponse.json({ error: `Số hóa đơn "${so}" đã dùng cho lệnh xuất ${dupLx[0].so_lenh || 'khác'}.` }, { status: 409 })
    if (dupCv?.length) return NextResponse.json({ error: `Số hóa đơn "${so}" đã dùng cho phiếu kỹ thuật ${dupCv[0].report || ''}.` }, { status: 409 })
  }

  const isReset = trang_thai_hd === 'Chờ xuất HĐ'
  const updates: any = { trang_thai_hd, updated_at: new Date().toISOString() }

  if (isHandover && tach_rieng !== undefined) updates.tach_rieng = !!tach_rieng

  if (trang_thai_hd === 'Đã lên hóa đơn' || trang_thai_hd === 'Đã thanh toán') {
    if (so_hoa_don !== undefined) updates.so_hoa_don = String(so_hoa_don).trim()
    if (ngay_xuat_hd !== undefined) updates.ngay_xuat_hd = ngay_xuat_hd || null
    else if (trang_thai_hd === 'Đã lên hóa đơn') updates.ngay_xuat_hd = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
    if (trang_thai_hd === 'Đã lên hóa đơn') updates.nguoi_xuat_hd = session.id
  } else {
    // Kéo ngược về "Đang xử lý HĐ" (sửa): giữ số HĐ, xóa ngày xuất. Về hẳn cột 1 = reset lớp HĐ.
    updates.ngay_xuat_hd = null
    if (isReset) {
      updates.so_hoa_don = null
      updates.nguoi_xuat_hd = null
      updates.dntt_luc = null; updates.so_dntt = null
      updates.minvoice_luc = null; updates.minvoice_lan = 0
      updates.ban_giao_kt_luc = null
    }
  }

  // Lý do kế toán trả về (cột 2 -> 1); tự xóa khi bàn giao lại.
  if (trang_thai_hd === 'Đang xử lý HĐ') updates.ly_do_tra = null
  else if (ly_do_tra !== undefined) updates.ly_do_tra = String(ly_do_tra || '').trim() || null

  // Mốc NGÀY THU (kỳ cột 4): vào 'Đã thanh toán' -> giờ VN; rời khỏi -> null.
  updates.thanh_toan_luc = trang_thai_hd === 'Đã thanh toán' ? new Date(Date.now() + 7 * 3600 * 1000).toISOString() : null

  const { error } = await supabaseAdmin.from('soct_lenh_xuat').update(updates).in('id', targetIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Đóng dấu mốc BÀN GIAO lần đầu (chỉ khi đang NULL -> giữ khi kéo tới lui 2<->3).
  if (trang_thai_hd === 'Đang xử lý HĐ') {
    await supabaseAdmin.from('soct_lenh_xuat').update({ ban_giao_kt_luc: new Date(Date.now() + 7 * 3600 * 1000).toISOString() }).in('id', targetIds).is('ban_giao_kt_luc', null)
  }

  await logAudit(session, 'Kanban lệnh xuất', `${trang_thai_hd} · ${targetIds.length} lệnh`)
  await broadcastLenhXuatChanged()
  return NextResponse.json({ success: true, count: targetIds.length })
}

// PUT: sửa lệnh — CHỈ khi còn ở cột 1 (Chờ xuất HĐ). Sang kế toán rồi thì khóa (giống kỹ thuật).
export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const b = await request.json()
    if (searchParams.get('kanban') === '1') return await kanbanPut(b)

    const session = await requireRole('admin', 'kinh_doanh')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    const { isManager } = await scope(session)

    if (!b.id) return NextResponse.json({ error: 'Thiếu id lệnh' }, { status: 400 })

    const { data: cur } = await supabaseAdmin
      .from('soct_lenh_xuat')
      .select('nguoi_kinh_doanh_id, trang_thai_hd')
      .eq('id', b.id).maybeSingle()
    if (!cur) return NextResponse.json({ error: 'Không tìm thấy lệnh' }, { status: 404 })
    if (!isManager && cur.nguoi_kinh_doanh_id !== session.id) {
      return NextResponse.json({ error: 'Không có quyền sửa lệnh này' }, { status: 403 })
    }
    if (cur.trang_thai_hd !== 'Chờ xuất HĐ') {
      return NextResponse.json({ error: 'Lệnh đã bàn giao kế toán — không sửa được. Nhờ kế toán trả về nếu cần.' }, { status: 409 })
    }

    const updates: any = { updated_at: new Date().toISOString() }
    // so_lenh BẤT BIẾN (hệ thống cấp lúc tạo) — không cho sửa qua PUT
    if (b.ngay !== undefined) updates.ngay = b.ngay || undefined
    if (b.ten_khach_hang !== undefined) updates.ten_khach_hang = String(b.ten_khach_hang || '').trim()
    if (b.dia_chi !== undefined) updates.dia_chi = (b.dia_chi || '').trim() || null
    if (b.ma_so_thue !== undefined) updates.ma_so_thue = (b.ma_so_thue || '').trim() || null
    if (b.so_hop_dong !== undefined) updates.so_hop_dong = (b.so_hop_dong || '').trim() || null
    if (b.id_khach_hang !== undefined) updates.id_khach_hang = b.id_khach_hang || null
    if (b.ghi_chu !== undefined) updates.ghi_chu = (b.ghi_chu || '').trim() || null
    if (isManager && b.nguoi_kinh_doanh_id !== undefined) updates.nguoi_kinh_doanh_id = b.nguoi_kinh_doanh_id || null

    const { error } = await supabaseAdmin.from('soct_lenh_xuat').update(updates).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Làm mới dòng hàng nếu client gửi lên
    if (Array.isArray(b.lines)) {
      await supabaseAdmin.from('soct_lenh_xuat_ct').delete().eq('lenh_id', b.id)
      const lines = buildLines(b.id, b.lines)
      if (lines.length > 0) await supabaseAdmin.from('soct_lenh_xuat_ct').insert(lines)
    }
    await logAudit(session, 'Sửa lệnh xuất hàng', `lệnh ${b.id}`)
    await broadcastLenhXuatChanged()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error PUT lenh-xuat:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE: xóa lệnh — CHỈ khi còn cột 1, và của mình (NV) / bất kỳ (sale_admin/admin).
export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin', 'kinh_doanh')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    const { isManager } = await scope(session)

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Thiếu id lệnh' }, { status: 400 })

    const { data: cur } = await supabaseAdmin
      .from('soct_lenh_xuat')
      .select('nguoi_kinh_doanh_id, trang_thai_hd').eq('id', id).maybeSingle()
    if (!cur) return NextResponse.json({ error: 'Không tìm thấy lệnh' }, { status: 404 })
    if (!isManager && cur.nguoi_kinh_doanh_id !== session.id) {
      return NextResponse.json({ error: 'Không có quyền xóa lệnh này' }, { status: 403 })
    }
    if (cur.trang_thai_hd !== 'Chờ xuất HĐ') {
      return NextResponse.json({ error: 'Lệnh đã bàn giao kế toán — không xóa được.' }, { status: 409 })
    }

    const { error } = await supabaseAdmin.from('soct_lenh_xuat').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit(session, 'Xóa lệnh xuất hàng', `lệnh ${id}`)
    await broadcastLenhXuatChanged()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error DELETE lenh-xuat:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
