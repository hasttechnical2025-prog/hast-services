"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"

// Panel thu gọn dùng chung: thanh tiêu đề bấm gập/bung, NHỚ lựa chọn của user qua localStorage
// (không popup). `defaultOpen` = trạng thái ban đầu khi user CHƯA từng gập/bung (theo role hoặc cố định).
// Nội dung chỉ render khi mở — state phải nằm ở component CHA để không mất khi gập.
export default function CollapsibleTools({ title, storageKey, defaultOpen = false, icon, children, className }: {
  title: string
  storageKey: string
  defaultOpen?: boolean
  icon?: ReactNode
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState<boolean>(() => {
    try { const v = localStorage.getItem(storageKey); if (v === '0') return false; if (v === '1') return true } catch { /* SSR / chặn storage */ }
    return defaultOpen
  })
  const toggle = () => setOpen(o => { const n = !o; try { localStorage.setItem(storageKey, n ? '1' : '0') } catch { /* bỏ qua */ } return n })

  return (
    <div className={`space-y-4 ${className || ''}`}>
      <button onClick={toggle} className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 transition">
        {icon}
        <span className="text-left">{title}</span>
        <span className="ml-auto text-xs font-normal text-slate-400 shrink-0">{open ? 'Thu gọn' : 'Mở rộng'}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && children}
    </div>
  )
}
