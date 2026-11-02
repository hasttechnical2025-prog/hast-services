'use client'
import { useEffect, useState } from 'react'
import DateField from '@/components/DateField'

// Cụm lọc KHOẢNG NGÀY chuẩn dùng chung: "<Nhãn> [ngày] – [ngày]" (gọn, 1 nhãn).
// Thay cho kiểu cũ "Từ ngày … Đến ngày …" (2 nhãn). Mặc định nhãn = "Ngày".
//
// GIÁ TRỊ NHÁP nội bộ: hiển thị tức thì khi gõ/chọn, nhưng CHỈ đẩy ra ngoài (onFrom/onTo ->
// thường kéo theo reload danh sách) khi RỜI Ô (blur). Lý do: lịch native của trình duyệt tự
// "chốt" một ngày khi lướt tháng (chưa chọn ngày) -> nếu đẩy ngay mỗi onChange thì danh sách
// reload giữa chừng. Giữ nháp + commit-on-blur => lướt tháng không reload, chọn xong rời ô mới nạp.
export function DateRangeField({ label = 'Ngày', from, to, onFrom, onTo, heightClass = 'h-9', width = 'w-36' }: {
  label?: string
  from: string
  to: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
  heightClass?: string
  width?: string
}) {
  const [dFrom, setDFrom] = useState(from)
  const [dTo, setDTo] = useState(to)
  // Đồng bộ nháp khi giá trị NGOÀI đổi (vd nút "Về hôm nay" / "Bỏ lọc" của cha).
  useEffect(() => { setDFrom(from) }, [from])
  useEffect(() => { setDTo(to) }, [to])
  // Commit khi blur: chỉ gọi cha khi giá trị THỰC SỰ khác -> không reload thừa.
  const commitFrom = () => { if (dFrom !== from) onFrom(dFrom) }
  const commitTo = () => { if (dTo !== to) onTo(dTo) }
  return (
    <div className="flex items-center gap-2">
      {label && <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">{label}</label>}
      <DateField value={dFrom} onChange={setDFrom} onCommit={commitFrom} heightClass={heightClass} className={width} />
      <span className="text-slate-400">–</span>
      <DateField value={dTo} onChange={setDTo} onCommit={commitTo} heightClass={heightClass} className={width} />
    </div>
  )
}
