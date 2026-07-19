import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/session'
import { runAssistant } from '@/lib/ai/tro-ly'
import { GeminiNoKeyError } from '@/lib/ai/gemini'

export const runtime = 'nodejs'
export const maxDuration = 30

// Trợ lý AI nội bộ. Phase 1: CHỈ admin (đọc xuyên module nhạy cảm). Mở rộng quyền sau.
export async function POST(request: Request) {
  try {
    const session = await requireRole('admin')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const { question } = await request.json()
    if (!question || !String(question).trim()) return NextResponse.json({ error: 'Chưa nhập câu hỏi' }, { status: 400 })

    const out = await runAssistant(String(question).trim())
    return NextResponse.json(out)
  } catch (error: any) {
    if (error instanceof GeminiNoKeyError) {
      return NextResponse.json({ error: 'Trợ lý AI chưa được cấu hình (thiếu GEMINI_API_KEY).' }, { status: 503 })
    }
    console.error('Error tro-ly:', error)
    return NextResponse.json({ error: error?.message || 'Lỗi trợ lý AI' }, { status: 500 })
  }
}
