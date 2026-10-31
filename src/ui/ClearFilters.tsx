'use client'
import { FilterX } from 'lucide-react'
import { cn } from '@/lib/utils'

// Nút "Bỏ lọc" CHUẨN CHUNG — ghost nhẹ (chữ xám, không nền/viền, KHÔNG đỏ).
// Quy ước: CHỈ hiện khi có ≥1 lọc đang bật (`show`), 1 click xóa HẾT (`onClear`).
// Chỉ đặt ở màn có ≥2 bộ lọc; màn 1 ô tìm thì nút ✕ của SearchInput là đủ.
export function ClearFilters({ show, onClear, label = 'Bỏ lọc', className }: {
  show: boolean
  onClear: () => void
  label?: string
  className?: string
}) {
  if (!show) return null
  return (
    <button
      type="button"
      onClick={onClear}
      title="Bỏ tất cả bộ lọc"
      className={cn('h-9 px-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 rounded-md transition', className)}
    >
      <FilterX className="w-3.5 h-3.5" /> {label}
    </button>
  )
}
