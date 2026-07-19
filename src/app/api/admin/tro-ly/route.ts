import { NextResponse } from 'next/server'
import { requireTab } from '@/lib/session'
import { getCauHinh } from '@/lib/config'
import { roleCanTab } from '@/lib/tabs'
import { runAssistant } from '@/lib/ai/tro-ly'
import { GeminiNoKeyError } from '@/lib/ai/gemini'

export const runtime = 'nodejs'
export const maxDuration = 30

// Mỗi tool ứng với 1 tab [cha, con] — trợ lý chỉ trả lời module người dùng có quyền xem.
const TOOL_TAB: Record<string, [string, string]> = {
  tonKho: ['kho_hang', 'ton_kho'], datHang: ['kho_hang', 'dat_hang'],
  congNo: ['tai_chinh', 'cong_no'], thueCpc: ['tai_chinh', 'thue_cpc'],
  giamDinh: ['theo_doi_may', 'giam_dinh'], baoTri: ['theo_doi_may', 'bao_tri'],
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

    const out = await runAssistant(String(question).trim(), { allow })
    return NextResponse.json(out)
  } catch (error: any) {
    if (error instanceof GeminiNoKeyError) {
      return NextResponse.json({ error: 'Trợ lý AI chưa được cấu hình (thiếu GEMINI_API_KEY).' }, { status: 503 })
    }
    console.error('Error tro-ly:', error)
    return NextResponse.json({ error: error?.message || 'Lỗi trợ lý AI' }, { status: 500 })
  }
}
