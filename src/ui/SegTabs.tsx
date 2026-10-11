import Link from 'next/link'
import { cn } from '@/lib/utils'

// Tab cháu (cấp 3) dạng pill — ROUTE-BASED (dùng <Link> để chuột phải mở tab mới / bookmark).
// active = nền trắng + ring xanh (chuẩn Thuê/CPC & CSKH).
export function SegTabs({ items, active, hrefFor, className }: {
  items: { slug: string; label: string; badge?: number }[]
  active: string
  hrefFor: (slug: string) => string
  className?: string
}) {
  return (
    <div className={cn('inline-flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200', className)}>
      {items.map((it) => {
        const on = it.slug === active
        return (
          <Link
            key={it.slug}
            href={hrefFor(it.slug)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-semibold border border-transparent transition flex items-center gap-1.5',
              on ? 'bg-white text-blue-700 shadow-sm border-blue-200' : 'text-slate-600 hover:text-slate-900'
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
