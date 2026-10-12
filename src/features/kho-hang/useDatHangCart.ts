'use client'
import { useState, useEffect, useCallback } from 'react'

// Giỏ đặt hàng dùng chung Thống kê nhập ↔ Đặt hàng (route riêng ở v2).
// Đồng bộ localStorage + cross-tab qua sự kiện 'storage' và custom event nội bộ.
export type DatHangLine = { ma_hang: string, sl_dat: string }
const KEY = 'soct_dathang_lines'
const EVT = 'soct_dathang_lines_changed'

function read(): DatHangLine[] {
  if (typeof window === 'undefined') return []
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : [] } catch { return [] }
}

export function useDatHangCart() {
  const [lines, setLinesState] = useState<DatHangLine[]>(read)

  // Nghe thay đổi từ route khác (cùng tab qua custom event, khác tab qua 'storage').
  useEffect(() => {
    const sync = () => setLinesState(read())
    window.addEventListener('storage', sync)
    window.addEventListener(EVT, sync)
    return () => { window.removeEventListener('storage', sync); window.removeEventListener(EVT, sync) }
  }, [])

  const write = useCallback((next: DatHangLine[]) => {
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
    setLinesState(next)
    try { window.dispatchEvent(new Event(EVT)) } catch { /* ignore */ }
  }, [])

  // Chữ ký tương thích useState: nhận giá trị mới hoặc hàm updater.
  const setLines = useCallback<React.Dispatch<React.SetStateAction<DatHangLine[]>>>((upd) => {
    const next = typeof upd === 'function' ? (upd as (p: DatHangLine[]) => DatHangLine[])(read()) : upd
    write(next)
  }, [write])

  // Gộp mặt hàng thiếu vào giỏ (cộng dồn nếu đã có).
  const addToCart = useCallback((items: DatHangLine[]) => {
    const copy = read()
    for (const it of items) {
      const sl = parseInt(it.sl_dat, 10) || 0
      if (sl <= 0) continue
      const idx = copy.findIndex(l => l.ma_hang === it.ma_hang)
      if (idx >= 0) copy[idx] = { ...copy[idx], sl_dat: String((Number(copy[idx].sl_dat) || 0) + sl) }
      else copy.push({ ma_hang: it.ma_hang, sl_dat: String(sl) })
    }
    write(copy)
  }, [write])

  return { lines, setLines, addToCart }
}
