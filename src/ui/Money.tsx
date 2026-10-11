import { fmtMoney } from './format'

// Hiển thị tiền #.### (đã làm tròn). VAT kèm '%' — dùng <Percent/> riêng.
export function Money({ value, suffix = ' đ', className }: { value: number | string | null | undefined, suffix?: string, className?: string }) {
  const s = fmtMoney(value)
  if (!s) return <span className={className}>—</span>
  return <span className={className}>{s}{suffix}</span>
}

export function Percent({ value, className }: { value: number | string | null | undefined, className?: string }) {
  if (value === null || value === undefined || value === '') return <span className={className}>—</span>
  const n = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(n)) return <span className={className}>—</span>
  return <span className={className}>{n}%</span>
}
