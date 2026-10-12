'use client'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Phân trang + ẩn/hiện cột — port NGUYÊN từ admin để các bảng port y hệt hành vi.

export const PAGE_SIZE = 20

export function usePaged<T>(items: T[], perPage = PAGE_SIZE) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(items.length / perPage))
  useEffect(() => { setPage(p => Math.min(p, pageCount)) }, [pageCount])
  const pageItems = items.slice((page - 1) * perPage, page * perPage)
  return { page, setPage, pageCount, pageItems, total: items.length, perPage }
}

// Thanh điều hướng trang — chỉ hiện khi có >1 trang.
export function Pagination({ page, pageCount, total, perPage, onPage }: { page: number, pageCount: number, total: number, perPage: number, onPage: (p: number) => void }) {
  if (pageCount <= 1) return null
  const from = (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)
  const nums: number[] = []
  const push = (n: number) => { if (n >= 1 && n <= pageCount && !nums.includes(n)) nums.push(n) }
  push(1); push(2)
  for (let i = page - 1; i <= page + 1; i++) push(i)
  push(pageCount - 1); push(pageCount)
  nums.sort((a, b) => a - b)
  const btn = 'h-8 min-w-8 px-2 rounded-md border text-sm transition'
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap px-1 pt-3 pb-1">
      <span className="text-xs text-slate-500">Hiển thị <b>{from}</b>–<b>{to}</b> / {total.toLocaleString('vi-VN')} dòng</span>
      <div className="flex items-center gap-1">
        <button className={`${btn} border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed`} disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="w-4 h-4" /></button>
        {nums.map((n, i) => (
          <span key={n} className="flex items-center">
            {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-slate-400">…</span>}
            <button className={`${btn} ${n === page ? 'bg-blue-600 border-blue-600 text-white font-semibold' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`} onClick={() => onPage(n)}>{n}</button>
          </span>
        ))}
        <button className={`${btn} border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed`} disabled={page >= pageCount} onClick={() => onPage(page + 1)}><ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  )
}

export type ColDef = { key: string, label: string, locked?: boolean }
export function useColView(storageKey: string, defs: ColDef[]) {
  const lockedKeys = defs.filter(d => d.locked).map(d => d.key)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  useEffect(() => {
    try {
      const raw = localStorage.getItem('colview:' + storageKey)
      if (raw) setHidden(new Set((JSON.parse(raw) as string[]).filter(k => !lockedKeys.includes(k))))
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])
  const persist = (s: Set<string>) => { try { localStorage.setItem('colview:' + storageKey, JSON.stringify([...s])) } catch { /* ignore */ } }
  const toggle = (k: string) => setHidden(prev => {
    if (lockedKeys.includes(k)) return prev
    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); persist(n); return n
  })
  const reset = () => { setHidden(new Set()); persist(new Set()) }
  const show = (k: string) => !hidden.has(k)
  return { show, toggle, reset, defs }
}

export function ColumnMenu({ view }: { view: ReturnType<typeof useColView> }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  useEffect(() => {
    if (!open) return
    const update = () => { if (anchorRef.current) setRect(anchorRef.current.getBoundingClientRect()) }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update) }
  }, [open])
  const W = 224
  const menu = open && rect ? createPortal(
    <>
      <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />
      <div className="fixed z-[91] bg-white border border-slate-200 rounded-lg shadow-lg py-2 overflow-auto" style={{ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.right - W, window.innerWidth - W - 8)), width: W, maxHeight: Math.max(160, window.innerHeight - rect.bottom - 16) }}>
        <div className="text-xs font-semibold text-slate-500 px-3 pb-1">Hiển thị cột</div>
        {view.defs.map(d => (
          <label key={d.key} className={`flex items-center gap-2 px-3 py-1.5 text-sm ${d.locked ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700 hover:bg-slate-50 cursor-pointer'}`}>
            <input type="checkbox" checked={view.show(d.key)} disabled={d.locked} onChange={() => view.toggle(d.key)} className="w-4 h-4 accent-blue-600" />
            <span className="flex-1">{d.label}</span>
            {d.locked && <span className="text-[10px] text-slate-400">khóa</span>}
          </label>
        ))}
        <button onClick={view.reset} className="w-full text-left text-xs text-blue-600 hover:underline px-3 pt-1.5">Hiện tất cả</button>
      </div>
    </>,
    document.body
  ) : null
  return (
    <div ref={anchorRef} className="shrink-0 inline-flex">
      <Button variant="outline" onClick={() => setOpen(o => !o)} title="Ẩn/hiện cột" className="h-9 w-9 p-0"><SlidersHorizontal className="w-4 h-4" /></Button>
      {menu}
    </div>
  )
}
