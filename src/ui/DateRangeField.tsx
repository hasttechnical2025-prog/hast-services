'use client'
import { useEffect, useRef, useState } from 'react'
import DateField from '@/components/DateField'

// Cụm lọc KHOẢNG NGÀY chuẩn dùng chung: "<Nhãn> [ngày] – [ngày]" (gọn, 1 nhãn).
// Thay cho kiểu cũ "Từ ngày … Đến ngày …" (2 nhãn). Mặc định nhãn = "Ngày".
//
// GIÁ TRỊ NHÁP nội bộ: hiển thị tức thì khi gõ/chọn, nhưng CHỈ đẩy ra ngoài (onFrom/onTo ->
// thường kéo theo reload danh sách) theo 2 cơ chế, tránh reload giữa chừng khi lịch native tự
// "chốt" ngày lúc lướt tháng:
//   • BLUR (rời ô): áp dụng NGAY.
//   • DEBOUNCE ~1s: ngưng đổi 1 giây thì tự áp dụng (KHÔNG cần rời ô) — lướt tháng nhanh thì
//     timer reset liên tục nên không nạp giữa chừng; chọn xong ngồi im 1s là danh sách tự cập nhật.
const COMMIT_DELAY = 1000
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
  // Giữ callback mới nhất trong ref -> không phụ thuộc identity (cha truyền inline cũng an toàn).
  const onFromRef = useRef(onFrom); onFromRef.current = onFrom
  const onToRef = useRef(onTo); onToRef.current = onTo
  // Đồng bộ nháp khi giá trị NGOÀI đổi (vd nút "Về hôm nay" / "Bỏ lọc" của cha).
  useEffect(() => { setDFrom(from) }, [from])
  useEffect(() => { setDTo(to) }, [to])
  // Debounce: nháp khác giá trị ngoài + ngưng đổi COMMIT_DELAY -> tự áp dụng.
  useEffect(() => {
    if (dFrom === from) return
    const t = setTimeout(() => onFromRef.current(dFrom), COMMIT_DELAY)
    return () => clearTimeout(t)
  }, [dFrom, from])
  useEffect(() => {
    if (dTo === to) return
    const t = setTimeout(() => onToRef.current(dTo), COMMIT_DELAY)
    return () => clearTimeout(t)
  }, [dTo, to])
  // Commit khi blur: áp dụng NGAY, chỉ gọi cha khi giá trị THỰC SỰ khác -> không reload thừa.
  const commitFrom = () => { if (dFrom !== from) onFromRef.current(dFrom) }
  const commitTo = () => { if (dTo !== to) onToRef.current(dTo) }
  return (
    <div className="flex items-center gap-2">
      {label && <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">{label}</label>}
      <DateField value={dFrom} onChange={setDFrom} onCommit={commitFrom} heightClass={heightClass} className={width} />
      <span className="text-slate-400">–</span>
      <DateField value={dTo} onChange={setDTo} onCommit={commitTo} heightClass={heightClass} className={width} />
    </div>
  )
}
