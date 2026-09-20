import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireTab } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// Tách số phiếu thành phần số (number) và hậu tố (string)
// VD: '5757' -> { num: 5757, sub: '' }
// VD: '5757A' -> { num: 5757, sub: 'A' }
// VD: '5757 B' -> { num: 5757, sub: 'B' }
export function parseSoPhieu(raw: string) {
  const s = String(raw || '').trim()
  const m = s.match(/^(\d+)\s*(.*)$/)
  if (m) {
    return {
      so_phieu: s,
      so_phieu_num: parseInt(m[1], 10),
      so_phieu_sub: m[2].trim().toUpperCase(),
    }
  }
  return {
    so_phieu: s,
    so_phieu_num: 0,
    so_phieu_sub: s.toUpperCase(),
  }
}

// GET: Lấy danh sách phiếu hoặc chi tiết 1 phiếu kèm tính toán số phiếu tiếp theo
export async function GET(request: Request) {
  try {
    const session = await requireTab('kho_hang', 'kho_hang.phieu_de_nghi')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    // Lấy chi tiết 1 phiếu
    if (id) {
      const { data: phieu, error } = await supabaseAdmin
        .from('soct_phieu_de_nghi')
        .select(`*, soct_phieu_de_nghi_ct (*)`)
        .eq('id', id)
        .single()

      if (error || !phieu) {
        return NextResponse.json({ error: 'Không tìm thấy phiếu đề nghị' }, { status: 404 })
      }

      // Sắp xếp dòng con theo stt
      if (phieu.soct_phieu_de_nghi_ct) {
        phieu.soct_phieu_de_nghi_ct.sort((a: any, b: any) => a.stt - b.stt)
      }

      return NextResponse.json({ data: phieu })
    }

    // Lấy danh sách phiếu
    const tuNgay = searchParams.get('tuNgay')
    const denNgay = searchParams.get('denNgay')
    const q = searchParams.get('q')

    let query = supabaseAdmin
      .from('soct_phieu_de_nghi')
      .select(`
        id, so_phieu, so_phieu_num, so_phieu_sub, ngay_lap,
        ten_may, ma_may, serial, kho_may, so_px, ma_kho, so_report, the_kho, ly_do,
        ky_bgd, ky_ktt, ky_pkt, nguoi_lap, created_at,
        tac_dong_ton, trang_thai, thuc_hien_luc, thuc_hien_by,
        soct_phieu_de_nghi_ct (*)
      `)

    if (tuNgay) query = query.gte('ngay_lap', tuNgay)
    if (denNgay) query = query.lte('ngay_lap', denNgay)

    const data = await selectAll<any>((from, to) =>
      query
        .order('so_phieu_num', { ascending: false })
        .order('so_phieu_sub', { ascending: false })
        .range(from, to)
    )

    // Lọc tìm kiếm client / server nếu có q
    let filtered = data || []
    if (q && q.trim()) {
      const kw = q.trim().toLowerCase()
      filtered = filtered.filter((r: any) => {
        const str = [
          r.so_phieu, r.ten_may, r.ma_may, r.serial, r.kho_may,
          r.so_px, r.ma_kho, r.so_report, r.the_kho, r.ly_do, r.nguoi_lap
        ].filter(Boolean).join(' ').toLowerCase()
        return str.includes(kw)
      })
    }

    // Tìm số phiếu cao nhất hiện tại để gợi ý số kế tiếp
    const { data: maxRows } = await supabaseAdmin
      .from('soct_phieu_de_nghi')
      .select('so_phieu_num')
      .order('so_phieu_num', { ascending: false })
      .limit(1)

    const maxNum = (maxRows && maxRows.length > 0 && maxRows[0].so_phieu_num) ? maxRows[0].so_phieu_num : 5757
    const nextSoPhieu = String(maxNum + 1)

    return NextResponse.json({
      data: filtered,
      next_so_phieu: nextSoPhieu,
    })
  } catch (error: any) {
    console.error('Error fetching phieu_de_nghi:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: Tạo phiếu đề nghị mới kèm các dòng chi tiết
export async function POST(request: Request) {
  try {
    const session = await requireTab('kho_hang', 'kho_hang.phieu_de_nghi')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const body = await request.json()
    const {
      so_phieu,
      ngay_lap,
      ten_may,
      ma_may,
      serial,
      kho_may,
      so_px,
      ma_kho,
      so_report,
      the_kho,
      ly_do,
      ky_bgd,
      ky_ktt,
      ky_pkt,
      nguoi_lap,
      tac_dong_ton = true,
      xuat_ra = [],
      nhap_lai = [],
    } = body

    if (!so_phieu || !String(so_phieu).trim()) {
      return NextResponse.json({ error: 'Vui lòng nhập số phiếu' }, { status: 400 })
    }

    const parsed = parseSoPhieu(so_phieu)

    // Kiểm tra trùng số phiếu
    const { data: existing } = await supabaseAdmin
      .from('soct_phieu_de_nghi')
      .select('id')
      .eq('so_phieu', parsed.so_phieu)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: `Số phiếu ${parsed.so_phieu} đã tồn tại trong hệ thống` }, { status: 400 })
    }

    // 1. Thêm phiếu Master
    const { data: newPhieu, error: errPhieu } = await supabaseAdmin
      .from('soct_phieu_de_nghi')
      .insert({
        so_phieu: parsed.so_phieu,
        so_phieu_num: parsed.so_phieu_num,
        so_phieu_sub: parsed.so_phieu_sub,
        ngay_lap: ngay_lap || new Date().toISOString().slice(0, 10),
        ten_may: ten_may?.trim() || null,
        ma_may: ma_may?.trim() || null,
        serial: serial?.trim() || null,
        kho_may: kho_may?.trim() || null,
        so_px: so_px?.trim() || null,
        ma_kho: ma_kho?.trim() || null,
        so_report: so_report?.trim() || null,
        the_kho: the_kho?.trim() || null,
        ly_do: ly_do?.trim() || null,
        ky_bgd: ky_bgd?.trim() || 'Nguyễn Nhân',
        ky_ktt: ky_ktt?.trim() || 'Phạm Thị Phương',
        ky_pkt: ky_pkt?.trim() || 'Trần Kiên',
        nguoi_lap: nguoi_lap?.trim() || session.full_name || null,
        tac_dong_ton: tac_dong_ton !== false,
        trang_thai: 'nhap',
        created_by: session.id,
      })
      .select()
      .single()

    if (errPhieu || !newPhieu) {
      return NextResponse.json({ error: errPhieu?.message || 'Lỗi tạo phiếu đề nghị' }, { status: 500 })
    }

    // 2. Thêm các dòng chi tiết (chỉ lấy các dòng có tên hàng hoặc mã hàng)
    const ctInserts: any[] = []

    if (Array.isArray(xuat_ra)) {
      xuat_ra.forEach((r: any, idx: number) => {
        if (r && (r.ten_hang?.trim() || r.ma_hang?.trim())) {
          ctInserts.push({
            phieu_id: newPhieu.id,
            loai_hang: 'xuat_ra',
            stt: r.stt || (idx + 1),
            ten_hang: r.ten_hang?.trim() || null,
            ma_hang: r.ma_hang?.trim() || null,
            dvt: r.dvt?.trim() || 'Cái',
            so_luong: r.so_luong != null && r.so_luong !== '' ? Number(r.so_luong) : null,
            ghi_chu: r.ghi_chu?.trim() || null,
            tinh_ton: !!r.tinh_ton,
          })
        }
      })
    }

    if (Array.isArray(nhap_lai)) {
      nhap_lai.forEach((r: any, idx: number) => {
        if (r && (r.ten_hang?.trim() || r.ma_hang?.trim())) {
          ctInserts.push({
            phieu_id: newPhieu.id,
            loai_hang: 'nhap_lai',
            stt: r.stt || (idx + 1),
            ten_hang: r.ten_hang?.trim() || null,
            ma_hang: r.ma_hang?.trim() || null,
            dvt: r.dvt?.trim() || 'Cái',
            so_luong: r.so_luong != null && r.so_luong !== '' ? Number(r.so_luong) : null,
            ghi_chu: r.ghi_chu?.trim() || null,
            tinh_ton: !!r.tinh_ton,
          })
        }
      })
    }

    if (ctInserts.length > 0) {
      const { error: errCt } = await supabaseAdmin.from('soct_phieu_de_nghi_ct').insert(ctInserts)
      if (errCt) {
        console.error('Lỗi tạo dòng chi tiết phiếu đề nghị:', errCt)
      }
    }

    logAudit(session, 'tao_phieu_de_nghi', `Tạo phiếu đề nghị số ${parsed.so_phieu}`)

    return NextResponse.json({ data: newPhieu, success: true })
  } catch (error: any) {
    console.error('Error in POST phieu_de_nghi:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT: Cập nhật phiếu đề nghị
export async function PUT(request: Request) {
  try {
    const session = await requireTab('kho_hang', 'kho_hang.phieu_de_nghi')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const body = await request.json()
    const {
      id,
      so_phieu,
      ngay_lap,
      ten_may,
      ma_may,
      serial,
      kho_may,
      so_px,
      ma_kho,
      so_report,
      the_kho,
      ly_do,
      ky_bgd,
      ky_ktt,
      ky_pkt,
      nguoi_lap,
      tac_dong_ton = true,
      xuat_ra = [],
      nhap_lai = [],
    } = body

    if (!id) {
      return NextResponse.json({ error: 'Thiếu id phiếu đề nghị' }, { status: 400 })
    }

    if (!so_phieu || !String(so_phieu).trim()) {
      return NextResponse.json({ error: 'Vui lòng nhập số phiếu' }, { status: 400 })
    }

    // Không cho sửa phiếu đã thực hiện (đã áp tồn) -> phải Hoàn tác trước.
    const { data: cur } = await supabaseAdmin
      .from('soct_phieu_de_nghi')
      .select('trang_thai')
      .eq('id', id)
      .maybeSingle()
    if (cur?.trang_thai === 'da_thuc_hien') {
      return NextResponse.json({ error: 'Phiếu đã thực hiện (đã áp tồn kho). Hãy bấm "Hoàn tác thực hiện" trước khi sửa.' }, { status: 409 })
    }

    const parsed = parseSoPhieu(so_phieu)

    // Kiểm tra trùng số phiếu với phiếu khác
    const { data: existing } = await supabaseAdmin
      .from('soct_phieu_de_nghi')
      .select('id')
      .eq('so_phieu', parsed.so_phieu)
      .neq('id', id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: `Số phiếu ${parsed.so_phieu} đã được sử dụng bởi phiếu khác` }, { status: 400 })
    }

    // 1. Cập nhật phiếu Master
    const { data: updatedPhieu, error: errUpdate } = await supabaseAdmin
      .from('soct_phieu_de_nghi')
      .update({
        so_phieu: parsed.so_phieu,
        so_phieu_num: parsed.so_phieu_num,
        so_phieu_sub: parsed.so_phieu_sub,
        ngay_lap: ngay_lap || new Date().toISOString().slice(0, 10),
        ten_may: ten_may?.trim() || null,
        ma_may: ma_may?.trim() || null,
        serial: serial?.trim() || null,
        kho_may: kho_may?.trim() || null,
        so_px: so_px?.trim() || null,
        ma_kho: ma_kho?.trim() || null,
        so_report: so_report?.trim() || null,
        the_kho: the_kho?.trim() || null,
        ly_do: ly_do?.trim() || null,
        ky_bgd: ky_bgd?.trim() || 'Nguyễn Nhân',
        ky_ktt: ky_ktt?.trim() || 'Phạm Thị Phương',
        ky_pkt: ky_pkt?.trim() || 'Trần Kiên',
        nguoi_lap: nguoi_lap?.trim() || null,
        tac_dong_ton: tac_dong_ton !== false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (errUpdate || !updatedPhieu) {
      return NextResponse.json({ error: errUpdate?.message || 'Lỗi cập nhật phiếu đề nghị' }, { status: 500 })
    }

    // 2. Làm mới các dòng chi tiết: Xóa cũ và ghi mới
    await supabaseAdmin.from('soct_phieu_de_nghi_ct').delete().eq('phieu_id', id)

    const ctInserts: any[] = []

    if (Array.isArray(xuat_ra)) {
      xuat_ra.forEach((r: any, idx: number) => {
        if (r && (r.ten_hang?.trim() || r.ma_hang?.trim())) {
          ctInserts.push({
            phieu_id: id,
            loai_hang: 'xuat_ra',
            stt: r.stt || (idx + 1),
            ten_hang: r.ten_hang?.trim() || null,
            ma_hang: r.ma_hang?.trim() || null,
            dvt: r.dvt?.trim() || 'Cái',
            so_luong: r.so_luong != null && r.so_luong !== '' ? Number(r.so_luong) : null,
            ghi_chu: r.ghi_chu?.trim() || null,
            tinh_ton: !!r.tinh_ton,
          })
        }
      })
    }

    if (Array.isArray(nhap_lai)) {
      nhap_lai.forEach((r: any, idx: number) => {
        if (r && (r.ten_hang?.trim() || r.ma_hang?.trim())) {
          ctInserts.push({
            phieu_id: id,
            loai_hang: 'nhap_lai',
            stt: r.stt || (idx + 1),
            ten_hang: r.ten_hang?.trim() || null,
            ma_hang: r.ma_hang?.trim() || null,
            dvt: r.dvt?.trim() || 'Cái',
            so_luong: r.so_luong != null && r.so_luong !== '' ? Number(r.so_luong) : null,
            ghi_chu: r.ghi_chu?.trim() || null,
            tinh_ton: !!r.tinh_ton,
          })
        }
      })
    }

    if (ctInserts.length > 0) {
      await supabaseAdmin.from('soct_phieu_de_nghi_ct').insert(ctInserts)
    }

    logAudit(session, 'sua_phieu_de_nghi', `Cập nhật phiếu đề nghị số ${parsed.so_phieu}`)

    return NextResponse.json({ data: updatedPhieu, success: true })
  } catch (error: any) {
    console.error('Error in PUT phieu_de_nghi:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE: Xóa phiếu đề nghị
export async function DELETE(request: Request) {
  try {
    const session = await requireTab('kho_hang', 'kho_hang.phieu_de_nghi')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Thiếu id phiếu cần xóa' }, { status: 400 })
    }

    // Lấy số phiếu + trạng thái để hoàn tồn (nếu đã thực hiện) và lưu audit log
    const { data: p } = await supabaseAdmin
      .from('soct_phieu_de_nghi')
      .select('so_phieu, trang_thai')
      .eq('id', id)
      .single()

    // Xóa phiếu ĐÃ thực hiện = đảo tồn kho -> chỉ admin được làm (hạn chế ảnh hưởng tồn)
    if (p?.trang_thai === 'da_thuc_hien' && session.role !== 'admin') {
      return NextResponse.json({ error: 'Chỉ admin được xóa phiếu đã thực hiện (vì phải hoàn tồn kho)' }, { status: 403 })
    }

    // Nếu phiếu đã thực hiện (đã áp tồn) -> đảo dấu hoàn tồn trước khi xóa
    if (p?.trang_thai === 'da_thuc_hien') {
      const { error: errRev } = await supabaseAdmin.rpc('soct_pdn_apply_ton', { p_id: id, p_sign: -1 })
      if (errRev) {
        return NextResponse.json({ error: 'Lỗi hoàn tồn kho khi xóa phiếu: ' + errRev.message }, { status: 500 })
      }
    }

    const { error } = await supabaseAdmin.from('soct_phieu_de_nghi').delete().eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    logAudit(session, 'xoa_phieu_de_nghi', `Xóa phiếu đề nghị số ${p?.so_phieu || id}`)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in DELETE phieu_de_nghi:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH: Xác nhận thực hiện (áp tồn) / Hoàn tác thực hiện (đảo tồn)
// body: { id, action: 'execute' | 'undo', auto_create?: boolean }
export async function PATCH(request: Request) {
  try {
    const session = await requireTab('kho_hang', 'kho_hang.phieu_de_nghi')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }
    // Áp tồn / hoàn tồn = thao tác đụng tồn kho -> CHỈ admin (tech_admin/staff không được)
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Chỉ admin được áp/hoàn tồn kho của phiếu đề nghị' }, { status: 403 })
    }

    const body = await request.json()
    const { id, action, auto_create } = body || {}
    if (!id) return NextResponse.json({ error: 'Thiếu id phiếu' }, { status: 400 })
    if (action !== 'execute' && action !== 'undo') {
      return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 })
    }

    const { data: phieu, error: errP } = await supabaseAdmin
      .from('soct_phieu_de_nghi')
      .select('id, so_phieu, tac_dong_ton, trang_thai, soct_phieu_de_nghi_ct (loai_hang, ma_hang, ten_hang, so_luong, tinh_ton)')
      .eq('id', id)
      .single()
    if (errP || !phieu) return NextResponse.json({ error: 'Không tìm thấy phiếu' }, { status: 404 })

    // ===== HOÀN TÁC =====
    if (action === 'undo') {
      if (phieu.trang_thai !== 'da_thuc_hien') {
        return NextResponse.json({ error: 'Phiếu chưa ở trạng thái đã thực hiện' }, { status: 409 })
      }
      const { error: errRev } = await supabaseAdmin.rpc('soct_pdn_apply_ton', { p_id: id, p_sign: -1 })
      if (errRev) return NextResponse.json({ error: 'Lỗi hoàn tồn kho: ' + errRev.message }, { status: 500 })
      await supabaseAdmin
        .from('soct_phieu_de_nghi')
        .update({ trang_thai: 'nhap', thuc_hien_luc: null, thuc_hien_by: null })
        .eq('id', id)
      logAudit(session, 'hoan_tac_phieu_de_nghi', `Hoàn tác thực hiện phiếu đề nghị số ${phieu.so_phieu}`)
      return NextResponse.json({ success: true, trang_thai: 'nhap' })
    }

    // ===== XÁC NHẬN THỰC HIỆN =====
    if (phieu.trang_thai === 'da_thuc_hien') {
      return NextResponse.json({ error: 'Phiếu đã được thực hiện trước đó' }, { status: 409 })
    }

    // Nếu phiếu có tác động tồn: kiểm tra các mã (tinh_ton) đã có trong kho chưa
    if (phieu.tac_dong_ton) {
      const ct: any[] = phieu.soct_phieu_de_nghi_ct || []
      const need = ct.filter(r => r.tinh_ton && r.ma_hang && String(r.ma_hang).trim())
      const codes = Array.from(new Set(need.map(r => String(r.ma_hang).trim())))

      if (codes.length > 0) {
        const { data: existRows } = await supabaseAdmin
          .from('soct_kho_hang')
          .select('ma_hang')
          .in('ma_hang', codes)
        const existSet = new Set((existRows || []).map((r: any) => r.ma_hang))
        const missing = codes.filter(c => !existSet.has(c))

        if (missing.length > 0) {
          if (!auto_create) {
            // Trả danh sách mã thiếu kèm tên gợi ý -> frontend chào "Tạo nhanh"
            const missingInfo = missing.map(ma => {
              const line = need.find(r => String(r.ma_hang).trim() === ma)
              return { ma_hang: ma, ten_hang: (line?.ten_hang || '').trim() }
            })
            return NextResponse.json(
              { error: 'missing_kho', missing: missingInfo },
              { status: 409 }
            )
          }
          // Tạo nhanh mã còn thiếu (tồn = 0)
          const inserts = missing.map(ma => {
            const line = need.find(r => String(r.ma_hang).trim() === ma)
            return { ma_hang: ma, ten_hang: (line?.ten_hang || '').trim() || ma, ton_kho: 0 }
          })
          const { error: errIns } = await supabaseAdmin.from('soct_kho_hang').insert(inserts)
          if (errIns) return NextResponse.json({ error: 'Lỗi tạo nhanh mã kho: ' + errIns.message }, { status: 500 })
        }
      }
    }

    const { error: errApply } = await supabaseAdmin.rpc('soct_pdn_apply_ton', { p_id: id, p_sign: 1 })
    if (errApply) return NextResponse.json({ error: 'Lỗi áp tồn kho: ' + errApply.message }, { status: 500 })

    await supabaseAdmin
      .from('soct_phieu_de_nghi')
      .update({ trang_thai: 'da_thuc_hien', thuc_hien_luc: new Date().toISOString(), thuc_hien_by: session.id })
      .eq('id', id)

    logAudit(session, 'thuc_hien_phieu_de_nghi', `Xác nhận thực hiện phiếu đề nghị số ${phieu.so_phieu}`)
    return NextResponse.json({ success: true, trang_thai: 'da_thuc_hien' })
  } catch (error: any) {
    console.error('Error in PATCH phieu_de_nghi:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
