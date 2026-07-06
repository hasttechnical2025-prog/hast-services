import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { logAudit } from '@/lib/audit'

// Trả vật tư về kho (hoặc hủy trả) cho 1 dòng vật tư của phiếu ĐÃ HOÀN THÀNH.
// Trả -> ton_kho += so_luong; Hủy trả -> ton_kho -= so_luong. Giữ dòng để đối soát.
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 401 })

    const { id, da_tra } = await request.json()
    if (!id) return NextResponse.json({ error: 'Thiếu ID dòng vật tư' }, { status: 400 })
    const want = !!da_tra

    // Lấy dòng vật tư + trạng thái phiếu cha
    const { data: line, error: e1 } = await supabaseAdmin
      .from('soct_chi_tiet_vat_tu')
      .select('id, ma_hang, so_luong, da_tra, soct_cong_viec ( ket_qua )')
      .eq('id', id)
      .single()
    if (e1 || !line) return NextResponse.json({ error: 'Không tìm thấy dòng vật tư' }, { status: 404 })

    const ketQua = (line as any).soct_cong_viec?.ket_qua
    if (ketQua !== 'Hoàn thành') {
      return NextResponse.json({ error: 'Chỉ trả vật tư trên phiếu đã Hoàn thành. Phiếu chưa hoàn thành thì sửa/xóa vật tư trực tiếp.' }, { status: 400 })
    }
    if (!!line.da_tra === want) {
      return NextResponse.json({ data: line, message: 'Không đổi' })
    }

    // Điều chỉnh tồn kho: trả -> cộng lại; hủy trả -> trừ lại
    const delta = want ? Number(line.so_luong) : -Number(line.so_luong)
    const { data: kho } = await supabaseAdmin.from('soct_kho_hang').select('ton_kho').eq('ma_hang', line.ma_hang).single()
    if (kho) {
      await supabaseAdmin.from('soct_kho_hang').update({ ton_kho: (Number(kho.ton_kho) || 0) + delta }).eq('ma_hang', line.ma_hang)
    }

    const { data, error } = await supabaseAdmin
      .from('soct_chi_tiet_vat_tu')
      .update({ da_tra: want, ngay_tra: want ? new Date().toISOString().split('T')[0] : null })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error

    await logAudit(session, want ? 'Trả vật tư về kho' : 'Hủy trả vật tư', `${line.ma_hang} x${line.so_luong}`)
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error tra vat tu:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
