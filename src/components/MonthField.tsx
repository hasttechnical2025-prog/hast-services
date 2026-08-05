"use client"

import { useMemo } from "react"

export default function MonthField({
  value,
  onChange,
  className = ""
}: {
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  const options = useMemo(() => {
    const list: { val: string; label: string }[] = []
    const today = new Date()

    // Sinh từ tháng hiện tại + 3 tháng tiếp theo lùi về 24 tháng trước (Tổng cộng 28 tháng)
    const start = new Date(today.getFullYear(), today.getMonth() + 3, 1)

    for (let i = 0; i < 28; i++) {
      const y = start.getFullYear()
      const m = start.getMonth() + 1
      const val = `${y}-${String(m).padStart(2, '0')}`
      const label = `Tháng ${String(m).padStart(2, '0')} / ${y}`
      list.push({ val, label })
      start.setMonth(start.getMonth() - 1)
    }
    return list
  }, [])

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-9 px-3 rounded-md border border-slate-200 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer text-slate-700 ${className}`}
    >
      <option value="">-- Chọn tháng --</option>
      {options.map((opt) => (
        <option key={opt.val} value={opt.val}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}
