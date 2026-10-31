'use client'
import { useEffect, useState } from 'react'
import { Search, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Ô tìm kiếm CHUẨN CHUNG — debounce + để trang tự lọc không dấu (dùng normVi từ ui/format).
// Trả raw query; việc so khớp không dấu do nơi dùng (normVi) đảm nhiệm.
// `icon`: đổi icon dẫn (mặc định Search) khi cần phân biệt nhiều ô lọc cạnh nhau (vd Hash cho
// "số phiếu", Boxes cho "vật tư") — vẫn giữ 1 kiểu dáng chung.
export function SearchInput({ value, onChange, placeholder = 'Tìm…', debounceMs = 200, className, icon: Icon = Search }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  debounceMs?: number
  className?: string
  icon?: LucideIcon
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
      <Icon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        value={local}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        className="w-full h-9 pl-9 pr-7 text-xs rounded-md border border-slate-300 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
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
