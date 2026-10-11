import { cn } from '@/lib/utils'

// Nhãn trạng thái — bảng màu semantic CHUNG. Mọi màn dùng chung để không lệch màu.
export type BadgeTone =
  | 'slate' | 'blue' | 'indigo' | 'violet' | 'teal'
  | 'emerald' | 'amber' | 'rose' | 'sky'

const TONES: Record<BadgeTone, string> = {
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
}

// Map trạng thái phiếu (ket_qua) → tone, để mọi bảng hiển thị nhất quán.
export const KET_QUA_TONE: Record<string, BadgeTone> = {
  'Chờ nhận': 'slate',
  'Đã nhận': 'amber',
  'Đang làm': 'indigo',
  'Hoàn thành': 'emerald',
  'Chưa hoàn thành': 'rose',
}

export function Badge({ children, tone = 'slate', className }: { children: React.ReactNode, tone?: BadgeTone, className?: string }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border whitespace-nowrap', TONES[tone], className)}>
      {children}
    </span>
  )
}
