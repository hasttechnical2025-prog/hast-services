"use client"

import { useState, useRef, useEffect } from "react"
import { Sparkles, Send, X, LoaderCircle } from "lucide-react"

type Msg = {
  role: 'user' | 'ai'
  text: string
  rows?: any[]
  columns?: { key: string; label: string }[]
  error?: boolean
}

const GOI_Y = [
  'Mã hàng 1T02NK0AX0 còn bao nhiêu?',
  'Phòng TCCB còn công nợ bao nhiêu?',
  'Bộ Tư pháp có máy nào giám định chưa thay?',
  'Máy thuê ở Hưng Yên là máy nào?',
]

// Định dạng giá trị ô: số -> phân tách nghìn; ngày YYYY-MM-DD -> DD/MM/YYYY.
const fmtCell = (key: string, v: any) => {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'number') return v.toLocaleString('vi-VN')
  const s = String(v)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  return s
}

export default function TroLyAI() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [msgs, loading])

  const send = async (q?: string) => {
    const question = (q ?? input).trim()
    if (!question || loading) return
    setInput('')
    setMsgs(prev => [...prev, { role: 'user', text: question }])
    setLoading(true)
    try {
      const res = await fetch('/api/admin/tro-ly', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) setMsgs(prev => [...prev, { role: 'ai', text: j.error || 'Có lỗi khi hỏi trợ lý.', error: true }])
      else setMsgs(prev => [...prev, { role: 'ai', text: j.answer || '(không có nội dung)', rows: j.rows, columns: j.columns }])
    } catch {
      setMsgs(prev => [...prev, { role: 'ai', text: 'Lỗi kết nối tới trợ lý.', error: true }])
    } finally { setLoading(false) }
  }

  return (
    <>
      {/* Nút nổi góc dưới phải */}
      {!open && (
        <button onClick={() => setOpen(true)} title="Trợ lý AI"
          className="fixed bottom-5 right-5 z-[90] w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30 flex items-center justify-center transition">
          <Sparkles className="w-6 h-6" />
        </button>
      )}

      {/* Panel chat */}
      {open && (
        <div className="fixed bottom-5 right-5 z-[90] w-[calc(100vw-2.5rem)] sm:w-[420px] h-[70vh] max-h-[640px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-blue-600 text-white flex items-center gap-2 shrink-0">
            <Sparkles className="w-5 h-5" />
            <div className="flex-1">
              <div className="font-semibold text-sm leading-tight">Trợ lý AI</div>
              <div className="text-[11px] text-blue-100 leading-tight">Kho · Đặt hàng · Công nợ · Giám định · Bảo trì · Thuê/CPC</div>
            </div>
            <button onClick={() => setOpen(false)} className="text-blue-100 hover:text-white p-1"><X className="w-5 h-5" /></button>
          </div>

          {/* Khung hội thoại */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50">
            {msgs.length === 0 && (
              <div className="text-center text-slate-400 text-sm py-6 space-y-3">
                <p>Hỏi nhanh về kho, đặt hàng, công nợ, giám định, bảo trì, máy thuê/CPC.</p>
                <div className="space-y-1.5">
                  {GOI_Y.map(g => (
                    <button key={g} onClick={() => send(g)} className="block w-full text-left text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg hover:border-blue-300 hover:text-blue-700 text-slate-600">
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, i) => m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] bg-blue-600 text-white text-sm px-3 py-2 rounded-2xl rounded-br-sm">{m.text}</div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className="max-w-[92%] space-y-2">
                  <div className={`text-sm px-3 py-2 rounded-2xl rounded-bl-sm whitespace-pre-wrap ${m.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-white text-slate-700 border border-slate-200'}`}>
                    {m.text}
                  </div>
                  {m.columns && m.columns.length > 0 && m.rows && m.rows.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                          <tr>{m.columns.map(c => <th key={c.key} className="px-2 py-1.5 font-semibold whitespace-nowrap">{c.label}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {m.rows.map((r, ri) => (
                            <tr key={ri}>{m.columns!.map(c => <td key={c.key} className="px-2 py-1.5 whitespace-nowrap text-slate-700">{fmtCell(c.key, r[c.key])}</td>)}</tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-3 py-2 flex items-center gap-2 text-sm text-slate-500">
                  <LoaderCircle className="w-4 h-4 animate-spin" /> Đang tra cứu...
                </div>
              </div>
            )}
          </div>

          {/* Ô nhập — chỉ bấm nút Gửi mới gửi (theo quy tắc app, Enter không submit) */}
          <div className="px-3 pt-2 pb-3 border-t border-slate-200 bg-white shrink-0">
            <p className="text-[11px] text-slate-400 text-center mb-2">Trợ lý có thể sai — hãy kiểm tra lại số liệu trước khi dùng chính thức.</p>
            <div className="flex gap-2">
            <input
              data-allow-enter
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
              placeholder="Nhập câu hỏi... (Enter để gửi)"
              className="flex-1 h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <button onClick={() => send()} disabled={loading || !input.trim()}
              className="w-10 h-10 shrink-0 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center justify-center">
              <Send className="w-4 h-4" />
            </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
