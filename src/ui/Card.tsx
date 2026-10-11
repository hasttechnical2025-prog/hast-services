import { cn } from '@/lib/utils'

// Card trắng bo góc viền mảnh — vỏ chung cho bảng / khối nội dung.
export function Card({ children, className }: { children: React.ReactNode, className?: string }) {
  return <div className={cn('bg-white rounded-lg border border-slate-200/80 shadow-xs overflow-hidden', className)}>{children}</div>
}

// Thanh công cụ trên bảng (ô tìm + bộ lọc bên trái, hành động bên phải).
export function Toolbar({ left, right }: { left?: React.ReactNode, right?: React.ReactNode }) {
  return (
    <div className="p-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
      <div className="flex flex-wrap items-center gap-2">{left}</div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  )
}
