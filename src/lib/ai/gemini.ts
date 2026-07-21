// Gọi Gemini REST trực tiếp (không cần SDK npm). Chuỗi model fallback khi hết quota /
// lỗi tạm thời. Dùng cho trợ lý AI nội bộ (Sổ công tác). Key giữ ở SERVER: GEMINI_API_KEY.
// Có thể đổi danh sách model qua env GEMINI_MODELS (phân tách bằng dấu phẩy) không cần sửa code.

const MODELS = (process.env.GEMINI_MODELS || 'gemini-2.5-flash,gemini-2.0-flash,gemini-2.5-flash-lite')
  .split(',').map(s => s.trim()).filter(Boolean)
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// Lỗi riêng để route trả thông báo "chưa cấu hình" thay vì lỗi 500 khó hiểu.
export class GeminiNoKeyError extends Error {}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function callGemini(body: any): Promise<any> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new GeminiNoKeyError('Chưa cấu hình GEMINI_API_KEY')
  let lastErr: any
  // Quá tải (429/5xx) là lỗi TẠM THỜI -> chạy hết chuỗi model, nghỉ ngắn rồi thử lại 1 lượt nữa.
  for (let pass = 0; pass < 2; pass++) {
    for (const model of MODELS) {
      try {
        const res = await fetch(`${BASE}/${model}:generateContent?key=${encodeURIComponent(key)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
        if (res.status === 429 || res.status >= 500) { lastErr = new Error(`${model} ${res.status}`); continue }
        const j = await res.json().catch(() => ({}))
        if (!res.ok) { lastErr = new Error(j?.error?.message || `Lỗi Gemini ${res.status}`); continue }
        return j
      } catch (e) { lastErr = e }
    }
    if (pass === 0) await sleep(700)
  }
  // KHÔNG ném tên model ra giao diện (người dùng không cần biết) — chỉ ghi log kỹ thuật.
  console.error('Gemini failed after retries:', lastErr)
  throw new Error('Trợ lý đang bận do máy chủ AI quá tải. Bạn thử lại sau ít giây nhé.')
}

function extractText(j: any): string {
  const parts = j?.candidates?.[0]?.content?.parts || []
  return parts.filter((p: any) => typeof p.text === 'string').map((p: any) => p.text).join('').trim()
}

// Sinh JSON có cấu trúc (dùng để phân loại câu hỏi). schema theo dạng OpenAPI của Gemini.
export async function geminiJSON<T = any>(system: string, user: string, schema: any): Promise<T> {
  const j = await callGemini({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema },
  })
  return JSON.parse(extractText(j) || '{}') as T
}

// Sinh câu trả lời văn bản (diễn đạt kết quả đã truy vấn).
export async function geminiText(system: string, user: string): Promise<string> {
  const j = await callGemini({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0.2 },
  })
  return extractText(j)
}
