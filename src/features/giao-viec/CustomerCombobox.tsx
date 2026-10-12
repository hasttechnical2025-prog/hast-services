'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { normVi } from '@/ui'

// Combobox tìm khách hàng (port y hệt admin): token-AND theo tên + mã máy + model + địa chỉ
// (đã bỏ dấu) → "tư pháp 305" khớp "Bộ Tư pháp — Phòng 305". Có "+ Tạo khách mới". Portal fixed.
export function CustomerCombobox({ customers, value, onPick, onCreateNew }: {
  customers: any[]
  value: string
  onPick: (id: string) => void
  onCreateNew: () => void
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

  const selected = customers.find(c => c.id === value)
  const selectedLabel = selected ? `${selected.ten_khach_hang}${selected.ma_may ? ` — ${selected.ma_may}` : ''}` : ''

  const q = normVi(query)
  const tokens = q.split(/\s+/).filter(t => t.length >= 2 || /^\d+$/.test(t))
  const matchers = tokens.map(t => {
    if (/^\d+$/.test(t)) { const re = new RegExp(`(?<![0-9])${t}(?![0-9])`); return (hay: string) => re.test(hay) }
    return (hay: string) => hay.includes(t)
  })
  const results = (tokens.length === 0
    ? customers.slice(0, 50)
    : customers
        .filter(c => { const hay = normVi(`${c.ten_khach_hang || ''} ${c.ma_may || ''} ${c.model || ''} ${c.vi_tri_dat_may || ''} ${c.dia_chi || ''}`); return matchers.every(m => m(hay)) })
        .map(c => { const maN = normVi(c.ma_may || ''); const nameN = normVi(c.ten_khach_hang || ''); const score = (maN && maN === q) ? 3 : (matchers.every(m => m(nameN)) ? 2 : 1); return { c, score } })
        .sort((a, b) => b.score - a.score).map(s => s.c).slice(0, 50)
  )

  return (
    <>
      <input
        ref={inputRef}
        className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
        placeholder="Tìm: tên khách + số phòng (vd: tư pháp 305) / mã máy..."
        value={open ? query : selectedLabel}
        onFocus={() => { setOpen(true); setQuery('') }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
      />
      {open && rect && createPortal(
        <div style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 100 }} className="max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg">
          <button type="button" onMouseDown={(e) => { e.preventDefault(); onCreateNew(); setQuery(''); setOpen(false) }} className="w-full text-left px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 border-b border-slate-100">+ Tạo khách hàng (máy) mới</button>
          {results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">Không tìm thấy khách hàng khớp.</div>
          ) : results.map(c => (
            <button type="button" key={c.id} onMouseDown={(e) => { e.preventDefault(); onPick(c.id); setQuery(''); setOpen(false) }} className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${c.id === value ? 'bg-blue-50' : ''}`}>
              <div className="font-medium text-slate-700 truncate">{c.ten_khach_hang}</div>
              <div className="text-xs text-slate-400 flex gap-2 flex-wrap">
                {c.ma_may && <span className="font-mono">Mã: {c.ma_may}</span>}
                {c.model && <span>· {c.model}</span>}
                {(c.vi_tri_dat_may || c.dia_chi) && <span className="truncate max-w-[16rem]">· {c.vi_tri_dat_may || c.dia_chi}</span>}
              </div>
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}
