import { fmtDate } from './format'

// Hiển thị ngày read-only → DD/MM/YYYY. (Ô CHỌN ngày dùng DateField, không dùng component này.)
export function DateText({ value, className, empty = '—' }: { value: string | Date | null | undefined, className?: string, empty?: string }) {
  const s = fmtDate(value)
  return <span className={className}>{s || empty}</span>
}
