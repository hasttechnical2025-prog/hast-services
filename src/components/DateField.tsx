"use client"

import { useState, useEffect } from "react"

// Ô chọn ngày DD/MM/YYYY: ô gõ tay bên trái + native date input TRONG SUỐT phủ lên vùng
// icon lịch (opacity-0 nhưng vẫn nhận chạm) — chạm icon = chạm thẳng native input nên iOS
// Safari mở được lịch (không phụ thuộc showPicker). value/onChange dùng chuỗi ISO 'YYYY-MM-DD'.
export default function DateField({ value, onChange, className, heightClass = "h-10", placeholder = "dd/mm/yyyy" }: { value: string, onChange: (v: string) => void, className?: string, heightClass?: string, placeholder?: string }) {
  const fmt = (s: string) => { if (!s) return ''; const d = new Date(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` }
  const [text, setText] = useState(fmt(value))
  useEffect(() => { setText(fmt(value)) }, [value])

  const onText = (t: string) => {
    setText(t)
    if (t.trim() === '') { onChange(''); return }
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (m) {
      const dd = +m[1], mm = +m[2], yy = +m[3]
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) onChange(`${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`)
    }
  }

  return (
    <div className={`relative flex items-center ${heightClass} rounded-md border border-slate-200 bg-white ${className || ''}`}>
      <input type="text" inputMode="numeric" placeholder={placeholder} value={text} onChange={(e) => onText(e.target.value)} className="flex-1 min-w-0 h-full px-3 bg-transparent text-sm text-slate-700 outline-none rounded-md" />
      {/* Vùng icon lịch — native date input trong suốt đè lên để chạm là mở lịch (iOS + Android) */}
      <div className="relative h-full w-11 shrink-0">
        <span className="absolute inset-0 flex items-center justify-center text-slate-400 pointer-events-none">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        </span>
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Chọn ngày"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none bg-transparent border-0 p-0"
        />
      </div>
    </div>
  )
}
