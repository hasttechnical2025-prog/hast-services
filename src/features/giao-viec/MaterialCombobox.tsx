'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

// Ô tìm vật tư kiểu "Google" (port từ admin): gõ mã/tên/model để lọc, chọn từ gợi ý.
// Gợi ý render qua portal (position:fixed) để không bị modal/overflow che. Gợi ý mã thay thế
// khi gõ đúng mã đã ngưng dùng (hết tồn). committed = "Đang giữ" để hiện tồn khả dụng.
export function MaterialCombobox({ inventory, value, onChange, committed }: {
  inventory: any[]
  value: string
  onChange: (ma_hang: string) => void
  committed?: Record<string, number>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [rect, setRect] = useState<DOMRect | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const updateRect = useCallback(() => { if (inputRef.current) setRect(inputRef.current.getBoundingClientRect()) }, [])
  useEffect(() => {
    if (!open) return
    updateRect()
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => { window.removeEventListener('scroll', updateRect, true); window.removeEventListener('resize', updateRect) }
  }, [open, updateRect])

  const selected = inventory.find(i => i.ma_hang === value)
  const q = query.trim().toLowerCase()

  const obsoleteMatch = q ? inventory.find(i => i.ngung_su_dung && (Number(i.ton_kho) || 0) <= 0 && ((i.ma_hang || '').toLowerCase() === q || (i.ma_hang || '').toLowerCase().startsWith(q))) : null

  const results = (q
    ? inventory.filter(i => {
        const match = (i.ma_hang || '').toLowerCase().includes(q) || (i.ten_hang || '').toLowerCase().includes(q) || (i.model || '').toLowerCase().includes(q)
        if (!match) return false
        if (i.ngung_su_dung && (Number(i.ton_kho) || 0) <= 0) return false
        return true
      })
    : inventory.filter(i => !i.ngung_su_dung || (Number(i.ton_kho) || 0) > 0)
  ).slice(0, 30)

  return (
    <>
      <input
        ref={inputRef}
        className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm focus:border-blue-500 outline-none bg-white"
        placeholder="Gõ mã / tên / model để tìm vật tư..."
        value={open ? query : (selected ? `${selected.ma_hang} - ${selected.ten_hang}${selected.ngung_su_dung ? ' [Mã cũ]' : ''}` : (value || ''))}
        onFocus={() => { setOpen(true); setQuery('') }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
      />
      {open && rect && createPortal(
        <div style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 100 }} className="max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg">
          {obsoleteMatch && (
            <div className="p-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900">
              <div className="font-semibold flex items-center gap-1 text-amber-800">⚠ Mã <span className="font-mono font-bold">{obsoleteMatch.ma_hang}</span> đã ngưng sử dụng (hết tồn kho).</div>
              {obsoleteMatch.ma_thay_the ? (
                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                  <span>Mã tương đương:</span>
                  {String(obsoleteMatch.ma_thay_the).split(',').map((s: string) => s.trim()).filter(Boolean).map((mtd: string) => (
                    <button key={mtd} type="button" onMouseDown={(e) => { e.preventDefault(); onChange(mtd); setQuery(''); setOpen(false) }} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded t2 font-semibold font-mono transition shrink-0">↳ {mtd}</button>
                  ))}
                </div>
              ) : <div className="mt-0.5 text-slate-500 italic t2">Chưa cài đặt mã tương đương cho vật tư này.</div>}
            </div>
          )}
          {results.length === 0 && !obsoleteMatch ? (
            <div className="px-3 py-2 text-sm text-slate-400">Không tìm thấy vật tư khớp.</div>
          ) : results.map(item => {
            const giu = committed?.[item.ma_hang] || 0
            const kd = (Number(item.ton_kho) || 0) - giu
            const isDiscontinued = !!item.ngung_su_dung
            return (
              <button type="button" key={item.ma_hang} onMouseDown={(e) => { e.preventDefault(); onChange(item.ma_hang); setQuery(''); setOpen(false) }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex justify-between items-center gap-2 border-b border-slate-50 last:border-0 ${item.ma_hang === value ? 'bg-blue-50' : ''} ${isDiscontinued ? 'bg-amber-50/40' : ''}`}>
                <div className="truncate flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono font-medium text-slate-700">{item.ma_hang}</span>
                    {isDiscontinued && <span className="t3 font-bold px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded border border-amber-200">Mã cũ — còn tồn</span>}
                    {item.ma_thay_the && <span className="t3 text-slate-500">(≡ <span className="font-mono text-blue-600 font-semibold">{item.ma_thay_the}</span>)</span>}
                  </div>
                  <div className="text-slate-500 text-xs truncate">{item.ten_hang}</div>
                </div>
                {committed
                  ? <span className={`text-xs shrink-0 text-right leading-tight ${kd <= 0 ? 'text-red-500' : 'text-emerald-600'}`}>Có sẵn: {kd}{giu > 0 && <span className="block t3 text-amber-600">Tồn {item.ton_kho} · giữ {giu}</span>}</span>
                  : <span className={`text-xs shrink-0 ${item.ton_kho <= 0 ? 'text-red-500' : 'text-emerald-600'}`}>Tồn: {item.ton_kho}</span>}
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </>
  )
}
