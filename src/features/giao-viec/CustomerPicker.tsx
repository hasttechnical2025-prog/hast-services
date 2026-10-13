'use client'
import { useMemo, useRef, useState, useLayoutEffect } from 'react'
import { ChevronDown, X, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { normVi } from '@/ui'

// Chọn khách hàng (điểm máy) — combobox tìm theo tên/mã máy/địa chỉ. Panel position:fixed
// bám rect (tránh bị modal cắt). Giá trị 'NEW' = khai khách mới.
export function CustomerPicker({ customers, value, onChange }: {
  customers: any[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const selected = value === 'NEW' ? null : customers.find(c => c.id === value)
  const label = value === 'NEW' ? '➕ Khách hàng mới' : selected ? `${selected.ten_khach_hang || '—'}${selected.ma_may ? ` · ${selected.ma_may}` : ''}` : 'Chọn khách hàng / điểm máy…'

  const filtered = useMemo(() => {
    const nq = normVi(q)
    const list = nq ? customers.filter(c => normVi([c.ten_khach_hang, c.ma_may, c.dia_chi, c.model].join(' ')).includes(nq)) : customers
    return list.slice(0, 50)
  }, [customers, q])

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left, width: r.width })
  }, [open])

  const pick = (id: string) => { onChange(id); setOpen(false); setQ('') }

  return (
    <>
      <button
        ref={btnRef} type="button" onClick={() => setOpen(o => !o)}
        className={cn('w-full h-8 px-2.5 text-xs rounded-md border bg-white flex items-center justify-between gap-2',
          value ? 'border-slate-200 text-slate-800' : 'border-slate-200 text-slate-400')}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[95]" onClick={() => setOpen(false)} />
          <div className="fixed z-[96] bg-white rounded-lg border border-slate-200 shadow-lg max-h-72 flex flex-col"
            style={{ top: pos?.top ?? 60, left: pos?.left ?? 12, width: pos?.width ?? 280 }}>
            <div className="p-2 border-b border-slate-100 relative">
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm tên / mã máy / địa chỉ…"
                className="w-full h-8 pl-2.5 pr-7 text-xs rounded-md border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-blue-500 outline-none" />
              {q && <button type="button" onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-3.5 h-3.5" /></button>}
            </div>
            <div className="overflow-y-auto">
              <button type="button" onClick={() => pick('NEW')} className="w-full text-left px-3 py-2 text-xs text-blue-700 hover:bg-blue-50 flex items-center gap-2 border-b border-slate-50">
                <UserPlus className="w-3.5 h-3.5" /> Khai khách hàng mới
              </button>
              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-slate-400 italic">Không tìm thấy khách.</div>
              ) : filtered.map(c => (
                <button key={c.id} type="button" onClick={() => pick(c.id)}
                  className={cn('w-full text-left px-3 py-1.5 hover:bg-slate-50 border-b border-slate-50', c.id === value && 'bg-blue-50')}>
                  <div className="text-xs font-medium text-slate-800 truncate">{c.ten_khach_hang || '—'}{c.ma_may ? <span className="font-mono text-slate-400"> · {c.ma_may}</span> : ''}</div>
                  <div className="t3 text-slate-400 truncate">{c.model ? `${c.model} · ` : ''}{c.vi_tri_dat_may || c.dia_chi || ''}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
