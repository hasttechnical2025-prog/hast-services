'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

// Bàn phím cho combobox "gõ để lọc" dùng chung toàn app (CustomerCombobox, MaterialCombobox, ...).
// Luật phím (khớp NoKeyShortcuts: Enter/Escape bị chặn toàn cục, KHÔNG dùng ở đây):
//   ↓/↑ : di chuyển dòng đang chọn (active), chạy vòng, tự cuộn vào tầm nhìn
//   Home/End : về đầu / cuối danh sách
//   Tab : CHỌN dòng đang active RỒI để Tab nhảy sang ô kế tự nhiên (kiểu "b" — giống Google)
//   (Mở/đóng vẫn do focus/blur của ô input quản như cũ; Esc bị chặn nên không bắt.)
// Dùng: gắn onKeyDown vào <input>, listRef vào thẻ cuộn chứa gợi ý, mỗi dòng gợi ý đặt
//   data-cbi={index} + tô nền khi index === activeIndex (và onMouseEnter={() => setActiveIndex(index)}).
// LƯU Ý: activeIndex chỉ chạy trên MẢNG results (các dòng gợi ý thật) — các dòng phụ ở đầu list
//   (nút "+ Tạo mới", banner cảnh báo mã cũ...) KHÔNG nằm trong results, vẫn chỉ chọn bằng chuột.
export function useComboboxKeys<T>({ open, results, onSelect }: {
  open: boolean
  results: T[]
  onSelect: (item: T) => void
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // Reset về đầu khi mở lại hoặc khi danh sách lọc đổi (gõ thêm ký tự)
  useEffect(() => { setActiveIndex(0) }, [open, results.length])

  // Cuộn dòng active vào tầm nhìn
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector(`[data-cbi="${activeIndex}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault(); setActiveIndex(i => (i + 1) % results.length); break
      case 'ArrowUp':
        e.preventDefault(); setActiveIndex(i => (i - 1 + results.length) % results.length); break
      case 'Home':
        e.preventDefault(); setActiveIndex(0); break
      case 'End':
        e.preventDefault(); setActiveIndex(results.length - 1); break
      case 'Tab': {
        // Kiểu (b): chọn dòng đang active, KHÔNG preventDefault → Tab nhảy ô kế tự nhiên
        const item = results[activeIndex]
        if (item != null) onSelect(item)
        break
      }
    }
  }, [open, results, activeIndex, onSelect])

  return { activeIndex, setActiveIndex, onKeyDown, listRef }
}
