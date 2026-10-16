'use client'
// Nút nổi (FAB) dạng pill KÉO-THẢ di chuyển tự do, vị trí lưu localStorage + kẹp trong khung nhìn.
// Dùng chung: /admin (sang v2) và /v2 (về /admin). Phân biệt kéo vs bấm (ngưỡng 4px).
import { useState, useRef, useEffect, type ReactNode } from 'react'

export default function DraggableFab({ href, label, icon, storageKey, defaultPos = 'bottom-5 left-5', className = 'bg-blue-600 hover:bg-blue-700' }: {
  href: string; label: string; icon: ReactNode; storageKey: string; defaultPos?: string; className?: string
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const posRef = useRef<{ x: number; y: number } | null>(null); posRef.current = pos
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; w: number; h: number; moved: boolean } | null>(null)
  const suppress = useRef(false)
  const ref = useRef<HTMLButtonElement>(null)

  const clamp = (x: number, y: number, w: number, h: number) => ({
    x: Math.min(Math.max(8, x), window.innerWidth - w - 8),
    y: Math.min(Math.max(8, y), window.innerHeight - h - 8),
  })

  useEffect(() => {
    try { const raw = localStorage.getItem(storageKey); if (raw) { const p = JSON.parse(raw); if (typeof p?.x === 'number') setPos(clamp(p.x, p.y, ref.current?.offsetWidth || 150, ref.current?.offsetHeight || 44)) } } catch {}
    const onResize = () => { if (posRef.current) setPos(clamp(posRef.current.x, posRef.current.y, ref.current?.offsetWidth || 150, ref.current?.offsetHeight || 44)) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [storageKey])

  const onMove = (e: PointerEvent) => {
    const d = drag.current; if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return
    d.moved = true
    setPos(clamp(d.ox + dx, d.oy + dy, d.w, d.h))
  }
  const onUp = () => {
    const d = drag.current
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp)
    if (d?.moved) { suppress.current = true; setTimeout(() => { suppress.current = false }, 0); try { if (posRef.current) localStorage.setItem(storageKey, JSON.stringify(posRef.current)) } catch {} }
    drag.current = null
  }
  const onDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault() // chặn kéo-ảnh/chọn-text mặc định -> kéo mượt
    const r = ref.current!.getBoundingClientRect()
    drag.current = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, w: r.width, h: r.height, moved: false }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
  }

  const style: React.CSSProperties = pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', touchAction: 'none' } : { touchAction: 'none' }
  return (
    <button ref={ref} type="button" title={label + ' — kéo để di chuyển'} draggable={false}
      onPointerDown={onDown}
      onClick={() => { if (!suppress.current) window.location.href = href }}
      style={style}
      className={`fixed z-[80] inline-flex items-center gap-1.5 h-11 px-4 rounded-full text-white text-sm font-semibold shadow-lg select-none cursor-grab active:cursor-grabbing transition ${pos ? '' : defaultPos} ${className}`}>
      {icon} {label}
    </button>
  )
}
