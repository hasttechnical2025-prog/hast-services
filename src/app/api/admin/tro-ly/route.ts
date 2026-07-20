import { NextResponse } from 'next/server'
import { requireTab, requireRole } from '@/lib/session'
import { getCauHinh } from '@/lib/config'
import { roleCanTab } from '@/lib/tabs'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { runAssistant } from '@/lib/ai/tro-ly'
import { GeminiNoKeyError } from '@/lib/ai/gemini'

export const runtime = 'nodejs'
export const maxDuration = 30

// Mỗi tool ứng với 1 tab [cha, con] — trợ lý chỉ trả lời module người dùng có quyền xem.
const TOOL_TAB: Record<string, [string, string]> = {
  tonKho: ['kho_hang', 'ton_kho'], datHang: ['kho_hang', 'dat_hang'], donHang: ['kho_hang', 'dat_hang'],
  congNo: ['tai_chinh', 'cong_no'], thueCpc: ['tai_chinh', 'thue_cpc'],
  giamDinh: ['theo_doi_may', 'giam_dinh'], baoTri: ['theo_doi_may', 'bao_tri'],
  congViec: ['cong_viec', 'cong_viec'], vatTuMay: ['cong_viec', 'cong_viec'], khachHang: ['quan_ly', 'khach_hang'],
}

// Trợ lý AI nội bộ. Quyền MỞ theo tab 'tro_ly' (admin bật/tắt cho từng role);
// quyền TỪNG MODULE vẫn theo tab tương ứng để không lộ dữ liệu ngoài quyền.
export async function POST(request: Request) {
  try {
    const session = await requireTab('tro_ly')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const { question } = await request.json()
    if (!question || !String(question).trim()) return NextResponse.json({ error: 'Chưa nhập câu hỏi' }, { status: 400 })

    const cfg = await getCauHinh()
    const allow = (tool: string) => {
      if (session.role === 'admin') return true
      const t = TOOL_TAB[tool]
      return t ? roleCanTab(session.role, t[0], cfg.tab_visibility, `${t[0]}.${t[1]}`) : true
    }

    const q = String(question).trim()
    const out = await runAssistant(q, { allow })

    // Ghi nhật ký (không chặn phản hồi nếu lỗi ghi log)
    supabaseAdmin.from('soct_tro_ly_log').insert({
      cau_hoi: q, tool: out.tool, so_ket_qua: out.rows.length,
      tra_loi: out.answer, tham_so: JSON.stringify(out.params || {}),
      nguoi_hoi: session.full_name, role: session.role,
    }).then(() => { }, () => { })

    return NextResponse.json({ answer: out.answer, rows: out.rows, columns: out.columns })
  } catch (error: any) {
    if (error instanceof GeminiNoKeyError) {
      return NextResponse.json({ error: 'Trợ lý AI chưa được cấu hình (thiếu GEMINI_API_KEY).' }, { status: 503 })
    }
    console.error('Error tro-ly:', error)
    return NextResponse.json({ error: error?.message || 'Lỗi trợ lý AI' }, { status: 500 })
  }
}

// Nhật ký câu hỏi Trợ lý AI — CHỈ admin. ?miss=1 để chỉ xem câu "trượt" (none/0 kết quả).
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const miss = new URL(request.url).searchParams.get('miss') === '1'
    let query = supabaseAdmin
      .from('soct_tro_ly_log')
      .select('id, cau_hoi, tra_loi, tham_so, tool, so_ket_qua, nguoi_hoi, role, created_at')
      .order('created_at', { ascending: false })
      .limit(500)
    if (miss) query = query.or('tool.eq.none,so_ket_qua.eq.0')

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Lỗi tải nhật ký' }, { status: 500 })
  }
}
