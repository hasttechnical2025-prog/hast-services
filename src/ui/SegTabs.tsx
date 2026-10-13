import Link from 'next/link'
import { cn } from '@/lib/utils'

// Tab cháu (cấp 3) kiểu UNDERLINE — chuẩn chung v2. ROUTE-BASED (dùng <Link> để chuột phải mở tab mới / bookmark).
// active = gạch chân xanh + chữ xanh đậm.
export function SegTabs({ items, active, hrefFor, className }: {
  items: { slug: string; label: string; badge?: number }[]
  active: string
  hrefFor: (slug: string) => string
  className?: string
}) {
  return (
    <div className={cn('flex gap-1 border-b border-slate-200 overflow-x-auto', className)}>
      {items.map((it) => {
        const on = it.slug === active
        return (
          <Link
            key={it.slug}
            href={hrefFor(it.slug)}
            className={cn(
              'px-4 py-2 font-medium text-sm transition whitespace-nowrap border-b-2 flex items-center gap-1.5',
              on ? 'border-blue-600 text-blue-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            {it.label}
            {typeof it.badge === 'number' && it.badge > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold">{it.badge}</span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
