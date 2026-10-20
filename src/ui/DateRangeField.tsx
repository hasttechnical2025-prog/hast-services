'use client'
import DateField from '@/components/DateField'

// Cụm lọc KHOẢNG NGÀY chuẩn dùng chung: "<Nhãn> [ngày] – [ngày]" (gọn, 1 nhãn).
// Thay cho kiểu cũ "Từ ngày … Đến ngày …" (2 nhãn). Mặc định nhãn = "Ngày".
export function DateRangeField({ label = 'Ngày', from, to, onFrom, onTo, heightClass = 'h-9', width = 'w-36' }: {
  label?: string
  from: string
  to: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
  heightClass?: string
  width?: string
}) {
  return (
    <div className="flex items-center gap-2">
      {label && <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">{label}</label>}
      <DateField value={from} onChange={onFrom} heightClass={heightClass} className={width} />
      <span className="text-slate-400">–</span>
      <DateField value={to} onChange={onTo} heightClass={heightClass} className={width} />
    </div>
  )
}
