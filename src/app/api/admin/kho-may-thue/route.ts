import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab, requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

const normSerial = (s: any) => String(s ?? '').replace(/\s+/g, '').toUpperCase()
// Từ chung của tên đơn vị -> bỏ khi so khớp để không coi 2 tên là "khác khách" chỉ vì
// khác cách viết ("CN Công ty OBAYASHI" vs "Chi nhánh Công ty OBAYASHI" = cùng khách).
const KH_STOP_TT = new Set(['cong', 'ty', 'tnhh', 'cp', 'cph', 'cn', 'chi', 'nhanh', 'nha', 'may', 'viet', 'nam', 'vietnam', 'cty', 'du', 'an', 'tap', 'doan', 'trach', 'nhiem', 'huu', 'han'])
const nameTokens = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 2 && !KH_STOP_TT.has(t))

// "Kho máy thuê": biên bản giám định máy thuê/CPC do app Techbot lập (bảng `inspections`).
// HAST và Techbot DÙNG CHUNG một Supabase project -> đọc/ghi thẳng, không cần cầu nối API.
// Bảng inspections: cột chuẩn (serial, model, khach_hang) + cột `data` (jsonb) chứa toàn
// bộ trường phiếu: machine_condition (tình trạng), counter, ktv, dia_chi, ...

export async function GET() {
  try {
    // Đọc: role có tab Kho máy thuê, HOẶC kinh doanh (trang /kho-thue), HOẶC tech_admin (app /m).
    let session = await requireTab('tai_chinh', 'tai_chinh.kho_may_thue')
    if (!session) session = await requireRole('kinh_doanh', 'tech_admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const { data, error } = await supabaseAdmin
      .from('inspections')
      .select('id, serial, model, khach_hang, created_at, data')
      .order('created_at', { ascending: false })
      .range(0, 999)
    if (error) throw error

    // Đối chiếu serial với máy thuê/CPC hiện tại trong HAST -> "khách đang thuê".
    // Khi cho thuê lại, HAST được cập nhật serial->khách mới; lệch với khách lúc giám
    // định nghĩa là máy đã quay vòng sang khách khác.
    const hastMays = await selectAll<any>((from, to) => supabaseAdmin
      .from('soct_khach_hang')
      .select('serial, ten_khach_hang, loai_hd')
      .not('serial', 'is', null)
      .in('loai_hd', ['Máy thuê', 'Máy CPC']) // chỉ máy ĐANG cho thuê/CPC mới tính là "đang thuê"
      .range(from, to))
    const serMap = new Map<string, { khach: string; loai_hd: string }>()
    for (const m of (hastMays || []) as any[]) {
      const k = normSerial(m.serial)
      if (k && !serMap.has(k)) serMap.set(k, { khach: m.ten_khach_hang || '', loai_hd: m.loai_hd || '' })
    }

    const rows = (data || []).map((r: any) => {
      const d = r.data || {}
      const cur = r.serial ? serMap.get(normSerial(r.serial)) : undefined
      const khachHienTai = cur?.khach || ''
      // "Đã cho khách khác thuê": có khách đang thuê (máy thuê/CPC) và tên KHÔNG chia sẻ
      // từ khóa đặc trưng nào với khách lúc giám định (đã bỏ "công ty/CN/chi nhánh...").
      const ta = nameTokens(khachHienTai), tb = nameTokens(r.khach_hang)
      const daThueLai = !!khachHienTai && ta.length > 0 && tb.length > 0 && !ta.some(t => tb.includes(t))
      return {
        id: r.id,
        serial: r.serial || '',
        model: r.model || '',
        khach_hang: r.khach_hang || '',
        dia_chi: d.dia_chi || '',
        tinh_trang: d.machine_condition || '',
        counter: d.counter || '',
        ktv: d.ktv || '',
        ngay: r.created_at,
        khach_hien_tai: khachHienTai,
        loai_hd_hien_tai: cur?.loai_hd || '',
        da_thue_lai: daThueLai,
        chi_tiet: d, // toàn bộ trường phiếu (để xem chi tiết vật tư)
      }
    })
    return NextResponse.json({ data: rows })
  } catch (error: any) {
    console.error('Error fetching kho may thue:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Sửa biên bản (dùng khi máy được cho thuê lại -> cập nhật khách/địa chỉ/tình trạng/counter).
// Merge vào `data` jsonb để KHÔNG làm mất các trường khác của phiếu Techbot; đồng bộ cả
// cột chuẩn hóa khach_hang.
export async function PUT(request: Request) {
  try {
    const session = await requireTab('tai_chinh', 'tai_chinh.kho_may_thue')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const { id, khach_hang, dia_chi, tinh_trang, counter, vat_tu } = await request.json()
    if (!id) return NextResponse.json({ error: 'Thiếu ID biên bản' }, { status: 400 })

    const { data: cur, error: e1 } = await supabaseAdmin.from('inspections').select('data').eq('id', id).single()
    if (e1 || !cur) return NextResponse.json({ error: 'Không tìm thấy biên bản' }, { status: 404 })

    const old = cur.data || {}
    const newData: Record<string, any> = {
      ...old,
      khach_hang: khach_hang ?? old.khach_hang ?? '',
      dia_chi: dia_chi ?? old.dia_chi ?? '',
      machine_condition: tinh_trang ?? old.machine_condition ?? '',
      counter: counter ?? old.counter ?? '',
    }
    // Chi tiết trống/mực (jsonb data chung với Techbot). Chỉ merge các key được PHÉP (whitelist).
    const VT_KEYS = ['toner_k', 'toner_c', 'toner_m', 'toner_y', 'drum_k', 'drum_c', 'drum_m', 'drum_y',
      'dev_k', 'dev_c', 'dev_m', 'dev_y', 'fuse', 'belt', 'roller', 'feed0', 'feed1', 'feed2',
      'feed_df', 'feed_du', 'finisher', 'options', 'others']
    if (vat_tu && typeof vat_tu === 'object') {
      for (const k of VT_KEYS) {
        if (k in vat_tu) newData[k] = String((vat_tu as any)[k] ?? '').trim()
      }
    }

    const { error } = await supabaseAdmin
      .from('inspections')
      .update({ khach_hang: (khach_hang ?? null) || null, data: newData })
      .eq('id', id)
    if (error) throw error

    await logAudit(session, 'Sửa kho máy thuê', `biên bản ${old.serial || old.model || id}`)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating kho may thue:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
