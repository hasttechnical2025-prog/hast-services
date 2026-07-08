import { NextResponse } from 'next/server'
import { supabaseAdmin, selectAll } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { broadcastJobsChanged } from '@/lib/realtime'
import { getCauHinh } from '@/lib/config'
import { logAudit } from '@/lib/audit'
import { sendTelegramMessage } from '@/lib/telegram'

// Escape HTML để dữ liệu người dùng không phá parse_mode='HTML' của Telegram
function esc(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function fmtDate(s: any): string {
  if (!s) return ''
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
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

    const data = await selectAll((from, to) => {
      let query = supabaseAdmin
        .from('soct_cong_viec')
        .select(`
          id, ngay, ma_may, id_khach_hang, loai_cong_viec, km, ket_qua, report, ghi_chu, ktv_id, ktv2_id, so_luong, created_by, da_nop_phieu,
          soct_khach_hang (
            ten_khach_hang,
            dia_chi
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
        trang_thai_hd: hasHD ? 'Đã lên hóa đơn' : 'Chưa hóa đơn',
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

    // Sau khi insert, cơ chế Database Webhook trên Supabase sẽ tự bắn REST API
    // đến /api/webhook/supabase để gửi thông báo Telegram cho KTV

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
    const { id, claim, release, reason, ket_qua, ktv_id, ktv2_id, report, ghi_chu, edit } = body

    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID công việc' }, { status: 400 })
    }

    // SỬA TOÀN PHẦN phiếu (admin/tech_admin/staff) — chỉ khi KTV chưa nhận (ket_qua = 'Chờ nhận')
    if (edit) {
      if (!['admin', 'tech_admin', 'staff'].includes(session.role)) {
        return NextResponse.json({ error: 'Không có quyền sửa phiếu' }, { status: 403 })
      }
      const { data: cur } = await supabaseAdmin.from('soct_cong_viec').select('ket_qua, trang_thai_hd').eq('id', id).single()
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
        ? 'Đã lên hóa đơn'
        : (cur.trang_thai_hd === 'Đã lên hóa đơn' ? 'Chưa hóa đơn' : (cur.trang_thai_hd || 'Chưa hóa đơn'))

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
