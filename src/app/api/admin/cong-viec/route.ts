import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { broadcastJobsChanged } from '@/lib/realtime'
import { getCauHinh } from '@/lib/config'
import { logAudit } from '@/lib/audit'
import { clampTapISO, clampPhut } from '@/lib/thoi-gian'
import { sendTelegramMessage } from '@/lib/telegram'

// Giao mực / Thay vật tư BẮT BUỘC có Số phiếu + ít nhất 1 vật tư (loại khác thì không).
// Chặn ở server để gọi API trực tiếp cũng không lọt. Trả chuỗi lỗi hoặc null.
const LOAI_CV_CAN_VAT_TU = ['Giao mực', 'Thay vật tư']
function loiThieuVatTu(loai_cong_viec: any, report: any, vat_tu: any): string | null {
  if (!LOAI_CV_CAN_VAT_TU.includes(String(loai_cong_viec || '').trim())) return null
  if (!String(report || '').trim()) return `"${loai_cong_viec}" bắt buộc phải có Số phiếu (Report).`
  if (!(Array.isArray(vat_tu) && vat_tu.some((v: any) => String(v?.ma_hang || '').trim()))) {
    return `"${loai_cong_viec}" bắt buộc phải có ít nhất 1 vật tư/linh kiện.`
  }
  return null
}

// Escape HTML để dữ liệu người dùng không phá parse_mode='HTML' của Telegram
function esc(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function fmtDate(s: any): string {
  if (!s) return ''
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// ===== Thông báo Telegram khi giao việc — GỬI TRỰC TIẾP TỪ API =====
// Trước đây dựa vào Supabase Database Webhook bắn sang /api/webhook/supabase; đó là mắt
// xích NGOÀI, hay hỏng (đã gây mất thông báo). Nay API tự gửi + set telegram_sent=true
// để webhook DB (nếu còn bật) bỏ qua, không bắn trùng.
async function fetchTgUser(id: string | null | undefined): Promise<{ name: string, tg: string }> {
  if (!id) return { name: '', tg: '' }
  const { data } = await supabaseAdmin.from('soct_users').select('full_name, telegram_id').eq('id', id).single()
  return { name: data?.full_name || '', tg: data?.telegram_id || '' }
}
function assigneeLine(n1: string, n2: string): string | null {
  if (n1 && n2) return `👥 <b>Phân công:</b> ${esc(n1)} (chính), ${esc(n2)} (kèm)`
  if (n1) return `👤 <b>Phân công:</b> ${esc(n1)}`
  if (n2) return `👤 <b>Phân công:</b> ${esc(n2)} (kèm)`
  return null
}
function buildJobMsg(job: any, kh: any, heading: string, extraLine: string | null, assignee: string | null, creatorName?: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hast-services.vercel.app'
  return [
    heading, extraLine, assignee,
    `🗓 <b>Ngày thực hiện:</b> ${fmtDate(job.ngay)}`,
    `📌 <b>Loại công việc:</b> ${esc(job.loai_cong_viec)}`,
    `🏢 <b>Khách hàng:</b> ${esc(kh?.ten_khach_hang || 'Không rõ')}`,
    `📍 <b>Địa chỉ:</b> ${esc(kh?.dia_chi || 'Không rõ')}`,
    `🖨 <b>Mã máy:</b> ${esc(job.ma_may || 'N/A')}`,
    `📝 <b>Ghi chú:</b> ${esc(job.ghi_chu || 'Không')}`,
    creatorName ? `👤 <b>Người tạo phiếu:</b> ${esc(creatorName)}` : null,
    '', `👉 <a href="${appUrl}/ktv">Mở App KTV</a>`, '',
    '<b>HAST — Sổ công tác</b>', 'Hệ thống quản lý giao việc tự động',
  ].filter(l => l !== null && l !== undefined).join('\n')
}

// Phiếu MỚI: chưa gán -> báo group; gán sẵn -> DM KTV chính/kèm.
async function notifyNewJob(job: any, creatorName: string) {
  try {
    const { data: kh } = await supabaseAdmin.from('soct_khach_hang').select('ten_khach_hang, dia_chi').eq('id', job.id_khach_hang).single()
    const u1 = await fetchTgUser(job.ktv_id), u2 = await fetchTgUser(job.ktv2_id)
    const assignee = assigneeLine(u1.name, u2.name)
    const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID
    if (!job.ktv_id && groupChatId) await sendTelegramMessage(groupChatId, buildJobMsg(job, kh, '🆕 <b>CÔNG VIỆC MỚI — CHỜ NHẬN</b>', null, assignee, creatorName))
    if (job.ktv_id && u1.tg) await sendTelegramMessage(u1.tg, buildJobMsg(job, kh, '🔔 <b>CÔNG VIỆC ĐƯỢC GIAO</b>', `Xin chào ${esc(u1.name)}, bạn có một công việc!`, assignee, creatorName))
    if (job.ktv2_id && u2.tg) await sendTelegramMessage(u2.tg, buildJobMsg(job, kh, '🔔 <b>CÔNG VIỆC ĐI KÈM ĐƯỢC GIAO</b>', `Xin chào ${esc(u2.name)}, bạn được gán làm KTV kèm cho một công việc!`, assignee, creatorName))
  } catch (e) { console.error('notifyNewJob failed:', e) }
}

// Giao LẠI (admin sửa phiếu): chỉ DM người MỚI được gán (khác người cũ).
async function notifyReassign(job: any, prevKtv1: string | null, prevKtv2: string | null, creatorName: string) {
  try {
    const { data: kh } = await supabaseAdmin.from('soct_khach_hang').select('ten_khach_hang, dia_chi').eq('id', job.id_khach_hang).single()
    const u1 = await fetchTgUser(job.ktv_id), u2 = await fetchTgUser(job.ktv2_id)
    const assignee = assigneeLine(u1.name, u2.name)
    if (job.ktv_id && job.ktv_id !== prevKtv1 && u1.tg) await sendTelegramMessage(u1.tg, buildJobMsg(job, kh, '🔔 <b>CÔNG VIỆC ĐƯỢC GIAO</b>', `Xin chào ${esc(u1.name)}, bạn có một công việc!`, assignee, creatorName))
    if (job.ktv2_id && job.ktv2_id !== prevKtv2 && u2.tg) await sendTelegramMessage(u2.tg, buildJobMsg(job, kh, '🔔 <b>CÔNG VIỆC ĐI KÈM ĐƯỢC GIAO</b>', `Xin chào ${esc(u2.name)}, bạn được gán làm KTV kèm cho một công việc!`, assignee, creatorName))
  } catch (e) { console.error('notifyReassign failed:', e) }
}

// Lấy danh sách công việc kèm thông tin khách hàng, kỹ thuật viên và vật tư liên quan
// KTV thấy việc gán cho chính mình VÀ việc chưa gán ai (pool chờ nhận)
export async function GET(request: Request) {
  try {
    const session = await requireRole()
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dateStr = searchParams.get('date')          // lọc đúng 1 ngày (YYYY-MM-DD)
    const report = (searchParams.get('report') || '').trim() // tìm theo số phiếu
    const tuNgay = searchParams.get('tuNgay') || ''   // lọc từ ngày (YYYY-MM-DD)
    const denNgay = searchParams.get('denNgay') || '' // lọc đến ngày
    const ketQuaList = searchParams.get('ket_qua') || '' // lọc theo trạng thái

    const data = await selectAll((from, to) => {
      let query = supabaseAdmin
        .from('soct_cong_viec')
        .select(`
          id, ngay, ma_may, id_khach_hang, loai_cong_viec, km, ket_qua, report, ghi_chu, ktv_id, ktv2_id, so_luong, created_by, da_nop_phieu, trang_thai_hd, so_hoa_don,
          bat_dau_luc, hoan_thanh_luc, so_phut_xu_ly,
          soct_khach_hang (
            ten_khach_hang,
            dia_chi,
            model
          ),
          soct_users!ktv_id (
            full_name
          ),
          ktv2:soct_users!ktv2_id (
            full_name
          ),
          soct_chi_tiet_vat_tu (
            id,
            ma_hang,
            so_luong,
            don_gia,
            vat,
            thanh_tien,
            hoa_don,
            da_tra,
            soct_kho_hang (
              ten_hang
            )
          )
        `)
        .order('ngay', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to)

      if (session.role === 'ktv') {
        // Việc của mình + việc trong pool (chưa gán KTV)
        query = query.or(`ktv_id.eq.${session.id},ktv_id.is.null`)
      }
      if (dateStr) query = query.eq('ngay', dateStr)
      // Tìm theo Số phiếu là tìm TOÀN CỤC (bỏ qua lọc ngày) để luôn thấy phiếu cũ;
      // nếu không tìm số phiếu thì áp lọc khoảng ngày. Đều lọc phía server -> thấy được phiếu cũ.
      if (report) {
        query = query.ilike('report', `%${report}%`)
      } else {
        if (tuNgay) query = query.gte('ngay', tuNgay)
        if (denNgay) query = query.lte('ngay', denNgay)
      }
      if (ketQuaList) {
        query = query.in('ket_qua', ketQuaList.split(','))
      }
      return query
    })

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching jobs:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Tạo công việc mới (admin/tech_admin/staff đều được giao việc cho KTV)
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const body = await request.json()
    const {
      ngay,
      ma_may,
      id_khach_hang,
      loai_cong_viec,
      km,
      so_luong,
      ktv_id,
      ktv2_id,
      report,
      ghi_chu,
      vat_tu // mảng: [{ ma_hang, so_luong, don_gia, vat, hoa_don }]
    } = body

    if (!id_khach_hang || !loai_cong_viec) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }
    const loiVT = loiThieuVatTu(loai_cong_viec, report, vat_tu)
    if (loiVT) return NextResponse.json({ error: loiVT }, { status: 400 })

    // Kiểm tra và đánh dấu repeat call tự động (nếu máy này sửa gần đây: 15-30 ngày)
    let repeat_call = false
    if (ma_may) {
      const cfg = await getCauHinh()
      const repeatNgay = parseInt(cfg.repeat_ngay || '30') || 30
      const dateLimit = new Date()
      dateLimit.setDate(dateLimit.getDate() - repeatNgay)
      const dateLimitStr = dateLimit.toISOString().split('T')[0]

      const { data: recentJobs } = await supabaseAdmin
        .from('soct_cong_viec')
        .select('id')
        .eq('ma_may', ma_may)
        .gte('ngay', dateLimitStr)
        .eq('ket_qua', 'Hoàn thành')
        .limit(1)

      if (recentJobs && recentJobs.length > 0) {
        repeat_call = true
      }
    }

    // Số phiếu chuẩn hóa (bỏ khoảng trắng); rỗng -> null (không tính trùng)
    const reportNorm = report ? String(report).trim() : ''
    // Trạng thái hóa đơn (công nợ) đồng bộ với cờ hoa_don của vật tư
    const hasHD = Array.isArray(vat_tu) && vat_tu.some((v: any) => v.hoa_don && v.ma_hang && Number(v.so_luong) > 0)

    // Insert công việc mới
    const { data, error } = await supabaseAdmin
      .from('soct_cong_viec')
      .insert({
        ngay: ngay || new Date().toISOString().split('T')[0],
        ma_may,
        id_khach_hang,
        loai_cong_viec,
        km: km || 0,
        so_luong: parseInt(so_luong) || 1,
        ktv_id: ktv_id || null,
        ktv2_id: ktv2_id || null,
        report: reportNorm || null,
        ghi_chu,
        repeat_call,
        created_by: session.id,
        // Gán KTV ngay khi tạo -> 'Đã nhận'; chưa gán -> 'Chờ nhận' (vào pool)
        ket_qua: ktv_id ? 'Đã nhận' : 'Chờ nhận',
        trang_thai_hd: hasHD ? 'Chờ xuất HĐ' : 'Chưa hóa đơn',
        // API tự gửi Telegram (bên dưới) -> đánh dấu để webhook DB không bắn trùng
        telegram_sent: true,
      })
      .select()
      .single()

    // Trùng số phiếu (unique index) -> báo lỗi thân thiện, không lưu
    if (error?.code === '23505') {
      return NextResponse.json({ error: `Số phiếu "${reportNorm}" đã tồn tại — không thể lưu trùng.` }, { status: 409 })
    }
    if (error) throw error

    // Insert vật tư nếu có
    if (vat_tu && Array.isArray(vat_tu) && vat_tu.length > 0) {
      const validVatTu = vat_tu.filter(v => v.ma_hang && v.so_luong > 0)
      if (validVatTu.length > 0) {
        const vatTuInserts = validVatTu.map(v => {
          const so_luong = parseInt(v.so_luong, 10) || 0
          const don_gia = parseFloat(v.don_gia) || 0
          return {
            id_cong_viec: data.id,
            ma_hang: v.ma_hang,
            so_luong,
            don_gia,
            vat: parseFloat(v.vat) || 0,
            thanh_tien: don_gia * so_luong, // chưa gồm VAT
            hoa_don: !!v.hoa_don
          }
        })

        const { error: vtError } = await supabaseAdmin
          .from('soct_chi_tiet_vat_tu')
          .insert(vatTuInserts)

        if (vtError) console.error("Lỗi thêm vật tư:", vtError)
      }
    }

    // Gửi Telegram TRỰC TIẾP (không còn phụ thuộc webhook DB ngoài).
    await notifyNewJob(data, session.full_name)

    await broadcastJobsChanged()
    await logAudit(session, 'Tạo công việc', `${loai_cong_viec}${ma_may ? ` — máy ${ma_may}` : ''}`)

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error creating job:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Thay đổi trạng thái/kết quả công việc hoặc cập nhật thông tin
// KTV chỉ được cập nhật ket_qua trên công việc của chính mình
export async function PUT(request: Request) {
  try {
    const session = await requireRole()
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const body = await request.json()
    const { id, claim, release, reason, ket_qua, ktv_id, ktv2_id, report, ghi_chu, edit, tapped_at, so_phut } = body

    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID công việc' }, { status: 400 })
    }

    // SỬA TOÀN PHẦN phiếu (admin/tech_admin/staff) — chỉ khi KTV chưa nhận (ket_qua = 'Chờ nhận')
    if (edit) {
      if (!['admin', 'tech_admin', 'staff'].includes(session.role)) {
        return NextResponse.json({ error: 'Không có quyền sửa phiếu' }, { status: 403 })
      }
      const { data: cur } = await supabaseAdmin.from('soct_cong_viec').select('ket_qua, trang_thai_hd, ktv_id, ktv2_id').eq('id', id).single()
      if (!cur) return NextResponse.json({ error: 'Không tìm thấy công việc' }, { status: 404 })
      // Admin sửa được mọi trạng thái; tech_admin/staff chỉ sửa khi phiếu chưa bắt đầu
      // (Chờ nhận / Đã nhận) — sau khi KTV bấm Đang làm thì không cho sửa nữa
      const preWork = ['Chờ nhận', 'Đã nhận'].includes(cur.ket_qua)
      if (!preWork && session.role !== 'admin') {
        return NextResponse.json({ error: 'KTV đã bắt đầu việc — không thể sửa phiếu này' }, { status: 403 })
      }

      const { ngay, ma_may, id_khach_hang, loai_cong_viec, km, so_luong, vat_tu } = body
      if (!id_khach_hang || !loai_cong_viec) {
        return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
      }
      const loiVTedit = loiThieuVatTu(loai_cong_viec, report, vat_tu)
      if (loiVTedit) return NextResponse.json({ error: loiVTedit }, { status: 400 })
      // Nếu phiếu còn ở giai đoạn tiền-xử lý: gán KTV -> 'Đã nhận', bỏ gán -> 'Chờ nhận'.
      // Nếu đã Đang làm/Hoàn thành/Lắp tiếp (admin sửa): giữ nguyên trạng thái.
      const nextKetQua = preWork ? (ktv_id ? 'Đã nhận' : 'Chờ nhận') : cur.ket_qua
      const reportNorm = report ? String(report).trim() : ''

      // Đồng bộ trạng thái hóa đơn (công nợ) với cờ hoa_don của vật tư:
      //  - có vật tư đã HĐ  -> 'Đã lên hóa đơn' (ra khỏi công nợ)
      //  - không có         -> nếu trước đó đã lên HĐ thì trả về 'Chưa hóa đơn' (bỏ HĐ),
      //                        ngược lại giữ nguyên (giữ mốc 'Đã báo giá')
      const hasHD = Array.isArray(vat_tu) && vat_tu.some((v: any) => v.hoa_don && v.ma_hang && Number(v.so_luong) > 0)
      const nextTrangThaiHd = hasHD
        ? (['Đang xử lý HĐ', 'Đã lên hóa đơn'].includes(cur.trang_thai_hd) ? cur.trang_thai_hd : 'Chờ xuất HĐ')
        : (['Chờ xuất HĐ', 'Đang xử lý HĐ', 'Đã lên hóa đơn'].includes(cur.trang_thai_hd) ? 'Chưa hóa đơn' : (cur.trang_thai_hd || 'Chưa hóa đơn'))

      const { error: upErr } = await supabaseAdmin
        .from('soct_cong_viec')
        .update({
          ngay: ngay || new Date().toISOString().split('T')[0],
          ma_may: ma_may || null, id_khach_hang, loai_cong_viec,
          km: km || 0, so_luong: parseInt(so_luong) || 1,
          ktv_id: ktv_id || null,
          ktv2_id: ktv2_id || null,
          report: reportNorm || null, ghi_chu,
          ket_qua: nextKetQua,
          trang_thai_hd: nextTrangThaiHd,
          // API tự DM người mới được gán (bên dưới) -> chặn webhook DB bắn trùng
          telegram_sent: true,
        })
        .eq('id', id)
      if (upErr?.code === '23505') {
        return NextResponse.json({ error: `Số phiếu "${reportNorm}" đã tồn tại — không thể lưu trùng.` }, { status: 409 })
      }
      if (upErr) throw upErr

      // Thay toàn bộ vật tư của phiếu
      await supabaseAdmin.from('soct_chi_tiet_vat_tu').delete().eq('id_cong_viec', id)
      if (Array.isArray(vat_tu) && vat_tu.length > 0) {
        const valid = vat_tu.filter((v: any) => v.ma_hang && v.so_luong > 0)
        if (valid.length > 0) {
          const inserts = valid.map((v: any) => {
            const sl = parseInt(v.so_luong, 10) || 0
            const dg = parseFloat(v.don_gia) || 0
            return { id_cong_viec: id, ma_hang: v.ma_hang, so_luong: sl, don_gia: dg, vat: parseFloat(v.vat) || 0, thanh_tien: dg * sl, hoa_don: !!v.hoa_don }
          })
          const { error: vtErr } = await supabaseAdmin.from('soct_chi_tiet_vat_tu').insert(inserts)
          if (vtErr) console.error('Lỗi cập nhật vật tư:', vtErr)
        }
      }

      // DM người MỚI được gán khi admin sửa phiếu (thay webhook DB nhánh UPDATE)
      await notifyReassign(
        { id_khach_hang, ngay: ngay || new Date().toISOString().split('T')[0], ma_may, loai_cong_viec, ghi_chu, ktv_id: ktv_id || null, ktv2_id: ktv2_id || null },
        cur.ktv_id || null, cur.ktv2_id || null, session.full_name
      )

      await broadcastJobsChanged()
      await logAudit(session, 'Sửa công việc', `id ${id}${ma_may ? ` — máy ${ma_may}` : ''}`)
      return NextResponse.json({ success: true })
    }

    if (session.role === 'staff') {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 403 })
    }

    // KTV nhận việc từ pool: chỉ nhận được nếu việc còn trống (atomic, chống tranh chấp)
    // Nhận việc -> chuyển 'Chờ nhận' sang 'Đã nhận' (chưa di chuyển nên chưa Đang làm)
    if (session.role === 'ktv' && claim === true) {
      const { data, error } = await supabaseAdmin
        .from('soct_cong_viec')
        .update({ ktv_id: session.id, ket_qua: 'Đã nhận' })
        .eq('id', id)
        .is('ktv_id', null)
        .select()
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return NextResponse.json({ error: 'Việc này đã có người nhận hoặc không tồn tại' }, { status: 409 })
        }
        throw error
      }

      await broadcastJobsChanged()
      return NextResponse.json({ data })
    }

    // KTV HỦY NHẬN việc: chỉ khi việc thuộc về mình & CHƯA bắt đầu (Đã nhận / Chờ nhận).
    // KTV1 hủy -> KTV2 lên làm chính (nếu có), không có -> về pool. KTV2 hủy -> bỏ KTV2.
    if (session.role === 'ktv' && release === true) {
      // 1. Lấy thông tin phiếu hiện tại
      const { data: curJob, error: fetchErr } = await supabaseAdmin
        .from('soct_cong_viec')
        .select('id, ktv_id, ktv2_id, ket_qua, ngay, ma_may, report, loai_cong_viec, created_by, soct_khach_hang ( ten_khach_hang, dia_chi )')
        .eq('id', id)
        .in('ket_qua', ['Đã nhận', 'Chờ nhận'])
        .single()

      if (fetchErr || !curJob) {
        return NextResponse.json({ error: 'Chỉ hủy được việc bạn đã nhận và chưa bắt đầu.' }, { status: 409 })
      }
      if (curJob.ktv_id !== session.id && curJob.ktv2_id !== session.id) {
        return NextResponse.json({ error: 'Bạn không có trong danh sách phân công của việc này.' }, { status: 403 })
      }

      // 2. Xử lý logic hủy 2 KTV
      let next_ktv_id = curJob.ktv_id
      let next_ktv2_id = curJob.ktv2_id
      let next_ket_qua = curJob.ket_qua

      if (curJob.ktv_id === session.id) {
        // KTV chính hủy
        if (curJob.ktv2_id) {
          next_ktv_id = curJob.ktv2_id // KTV kèm lên chính
          next_ktv2_id = null
        } else {
          next_ktv_id = null // Về pool
          next_ket_qua = 'Chờ nhận'
        }
      } else if (curJob.ktv2_id === session.id) {
        // KTV kèm hủy
        next_ktv2_id = null
      }

      // 3. Cập nhật db
      const { data, error } = await supabaseAdmin
        .from('soct_cong_viec')
        .update({ ktv_id: next_ktv_id, ktv2_id: next_ktv2_id, ket_qua: next_ket_qua })
        .eq('id', id)
        .select('id, ngay, ma_may, report, loai_cong_viec, created_by, soct_khach_hang ( ten_khach_hang, dia_chi )')
        .single()

      if (error) {
        return NextResponse.json({ error: 'Không thể hủy nhận việc lúc này.' }, { status: 500 })
      }

      // Bắn group: có việc bị hủy (kèm lý do) — để team/văn phòng biết
      const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID
      if (groupChatId) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://techservice.app'
        const kh = (data as any).soct_khach_hang
        const reasonText = reason ? String(reason).trim() : ''
        // Người tạo phiếu (để hiển thị trong tin nhắn)
        let creatorName = ''
        if ((data as any).created_by) {
          const { data: creator } = await supabaseAdmin.from('soct_users').select('full_name').eq('id', (data as any).created_by).single()
          creatorName = creator?.full_name || ''
        }
        // Lấy tên người phụ trách còn lại (nếu có)
        let assigneeText = ''
        if (next_ktv_id) {
          const { data: u1 } = await supabaseAdmin.from('soct_users').select('full_name').eq('id', next_ktv_id).single()
          let txt = `👤 <b>Phụ trách:</b> ${esc(u1?.full_name || 'Không rõ')}`
          if (next_ktv2_id) {
            const { data: u2 } = await supabaseAdmin.from('soct_users').select('full_name').eq('id', next_ktv2_id).single()
            txt = `👥 <b>Phụ trách:</b> ${esc(u1?.full_name || 'Không rõ')} (chính), ${esc(u2?.full_name || 'Không rõ')} (kèm)`
          }
          assigneeText = txt
        }

        const msg = [
          '🔄 <b>VIỆC BỊ HỦY NHẬN</b>',
          `${esc(session.full_name)} đã rút khỏi công việc này.`,
          reasonText ? `📝 <b>Lý do:</b> ${esc(reasonText)}` : null,
          next_ktv_id === null ? `⚠️ <b>Trạng thái:</b> Chờ nhận lại` : `✅ <b>Trạng thái:</b> Đã có người phụ trách`,
          assigneeText ? assigneeText : null,
          `🗓 <b>Ngày:</b> ${fmtDate(data.ngay)}`,
          `📌 <b>Loại việc:</b> ${esc(data.loai_cong_viec)}`,
          `🏢 <b>Khách hàng:</b> ${esc(kh?.ten_khach_hang || 'Không rõ')}`,
          `📍 <b>Địa chỉ:</b> ${esc(kh?.dia_chi || 'Không rõ')}`,
          `🖨 <b>Mã máy:</b> ${esc(data.ma_may || 'N/A')}`,
          creatorName ? `👤 <b>Người tạo phiếu:</b> ${esc(creatorName)}` : null,
          next_ktv_id === null ? `\n👉 <a href="${appUrl}/ktv">Mở App KTV để nhận việc</a>` : null,
        ].filter(l => l !== null).join('\n')
        await sendTelegramMessage(groupChatId, msg)
      }

      await broadcastJobsChanged()
      await logAudit(session, 'Hủy nhận việc', `phiếu ${data.report || id}${reason && String(reason).trim() ? ` — lý do: ${String(reason).trim()}` : ''}`)
      return NextResponse.json({ data })
    }

    const updates: any = {}

    if (session.role === 'ktv') {
      // KTV chỉ được đổi trạng thái công việc
      if (ket_qua === undefined) {
        return NextResponse.json({ error: 'Thiếu trạng thái cần cập nhật' }, { status: 400 })
      }
      updates.ket_qua = ket_qua

      // Đóng dấu mốc thời gian (GHI MỘT LẦN -> gửi lại từ hàng đợi offline không ghi đè).
      // Giờ chạm do client gửi (tapped_at) được clamp trong [lúc tạo phiếu, giờ server].
      if (ket_qua === 'Đang làm' || ket_qua === 'Hoàn thành') {
        const { data: cur } = await supabaseAdmin
          .from('soct_cong_viec')
          .select('bat_dau_luc, hoan_thanh_luc, so_phut_xu_ly, created_at')
          .eq('id', id).single()
        const t = clampTapISO(tapped_at, cur?.created_at, Date.now())
        if (ket_qua === 'Đang làm' && cur && cur.bat_dau_luc == null) {
          updates.bat_dau_luc = t
        }
        if (ket_qua === 'Hoàn thành') {
          if (cur && cur.hoan_thanh_luc == null) updates.hoan_thanh_luc = t
          if (cur && cur.so_phut_xu_ly == null && so_phut != null) updates.so_phut_xu_ly = clampPhut(so_phut)
        }
      }
    } else {
      if (ket_qua !== undefined) updates.ket_qua = ket_qua
      if (ktv_id !== undefined) updates.ktv_id = ktv_id || null
      if (ktv2_id !== undefined) updates.ktv2_id = ktv2_id || null
      if (report !== undefined) updates.report = report
      if (ghi_chu !== undefined) updates.ghi_chu = ghi_chu
    }

    let query = supabaseAdmin
      .from('soct_cong_viec')
      .update(updates)
      .eq('id', id)

    // KTV chỉ được cập nhật công việc gán cho chính mình HOẶC mình làm kèm
    if (session.role === 'ktv') {
      query = query.or(`ktv_id.eq.${session.id},ktv2_id.eq.${session.id}`)
    }

    const { data, error } = await query.select().single()

    if (error) {
      // Không tìm thấy bản ghi (VD: KTV cố cập nhật việc của người khác)
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Không tìm thấy công việc hoặc không có quyền cập nhật' }, { status: 403 })
      }
      throw error
    }

    // Cơ chế lai: công việc loại 'Bảo trì' vừa Hoàn thành -> tự đánh dấu máy đã bảo trì tháng đó
    const cfgPut = await getCauHinh()
    if (updates.ket_qua === 'Hoàn thành' && data.loai_cong_viec === 'Bảo trì' && data.ma_may && (cfgPut.auto_bao_tri ?? '1') !== '0') {
      const thang_nam = String(data.ngay).slice(0, 7) // YYYY-MM
      await supabaseAdmin
        .from('soct_bao_tri')
        .upsert({ ma_may: data.ma_may, thang_nam, ngay: data.ngay, ktv_id: data.ktv_id || null }, { onConflict: 'ma_may,thang_nam' })
    }

    await broadcastJobsChanged()

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error updating job:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Xóa công việc (chỉ admin/tech_admin)
export async function DELETE(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin')
    if (!session) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const all = searchParams.get('all') === '1'

    // Xóa TOÀN BỘ phiếu (chỉ admin) — dùng khi cần import lại từ đầu
    if (all) {
      if (session.role !== 'admin') {
        return NextResponse.json({ error: 'Chỉ admin được xóa toàn bộ phiếu' }, { status: 403 })
      }
      const { error } = await supabaseAdmin.from('soct_cong_viec').delete().not('id', 'is', null)
      if (error) throw error
      await broadcastJobsChanged()
      await logAudit(session, 'Xóa TOÀN BỘ phiếu công việc', '')
      return NextResponse.json({ success: true })
    }

    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID công việc' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('soct_cong_viec')
      .delete()
      .eq('id', id)

    if (error) throw error

    await broadcastJobsChanged()
    await logAudit(session, 'Xóa công việc', `id ${id}`)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting job:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
