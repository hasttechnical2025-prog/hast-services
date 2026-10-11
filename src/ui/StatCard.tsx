import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

// Thẻ KPI — mẫu StatCards nhân rộng toàn app (xem memory ui-direction).
export type StatTone = 'blue' | 'amber' | 'indigo' | 'emerald' | 'rose' | 'slate'

const TINT: Record<StatTone, { num: string; ic: string }> = {
  blue: { num: 'text-blue-600', ic: 'text-blue-600 bg-blue-50' },
  amber: { num: 'text-amber-600', ic: 'text-amber-600 bg-amber-50' },
  indigo: { num: 'text-indigo-600', ic: 'text-indigo-600 bg-indigo-50' },
  emerald: { num: 'text-emerald-700', ic: 'text-emerald-600 bg-emerald-50' },
  rose: { num: 'text-rose-600', ic: 'text-rose-600 bg-rose-50' },
  slate: { num: 'text-slate-700', ic: 'text-slate-500 bg-slate-100' },
}

export function StatCard({ label, value, sub, tone = 'blue', icon: Icon }: {
  label: string
  value: React.ReactNode
  sub?: string
  tone?: StatTone
  icon?: LucideIcon
}) {
  const t = TINT[tone]
  return (
    <div className="bg-white p-3 rounded-lg border border-slate-200/80 flex items-center justify-between shadow-xs">
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide truncate">{label}</div>
        <div className={cn('text-xl font-bold tracking-tight mt-0.5', t.num)}>{value}</div>
        {sub && <div className="text-[10px] text-slate-400 truncate">{sub}</div>}
      </div>
      {Icon && (
        <div className={cn('w-8 h-8 rounded-md flex items-center justify-center shrink-0', t.ic)}>
          <Icon className="w-4 h-4" />
        </div>
      )}
    </div>
  )
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{children}</div>
}
