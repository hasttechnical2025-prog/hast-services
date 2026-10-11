'use client'
import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Ô tìm kiếm — debounce + để trang tự lọc không dấu (dùng normVi từ ui/format).
// Trả raw query; việc so khớp không dấu do nơi dùng (normVi) đảm nhiệm.
export function SearchInput({ value, onChange, placeholder = 'Tìm…', debounceMs = 200, className }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  debounceMs?: number
  className?: string
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => { setLocal(value) }, [value])
  useEffect(() => {
    const t = setTimeout(() => { if (local !== value) onChange(local) }, debounceMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local])

  return (
    <div className={cn('relative', className)}>
      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        value={local}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        className="w-full h-8 pl-8 pr-7 text-xs rounded-md border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-blue-500 outline-none"
      />
      {local && (
        <button
          type="button"
          onClick={() => { setLocal(''); onChange('') }}
          aria-label="Xóa tìm kiếm"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
