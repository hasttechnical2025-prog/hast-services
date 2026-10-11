'use client'
import { useMemo, useRef, useState, useLayoutEffect } from 'react'
import Link from 'next/link'
import { Bell, AlertTriangle, PackageX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useShared } from './SharedDataProvider'
import { useSession } from './SessionProvider'

// Chuông cảnh báo — gom các "alert section" từ dữ liệu dùng chung. GĐ0: cảnh báo tồn kho
// (ngưỡng per-item đã đặt). Mở rộng sau: mực máy thuê, counter đến hạn, HĐBT sắp hết…
// Ẩn với role kthc (kế toán) theo quy ước hiện tại. Panel position:fixed bám rect (tránh cắt).

type AlertItem = { key: string; label: string; detail?: string; tone: 'rose' | 'amber' }
type AlertSection = { id: string; title: string; icon: typeof AlertTriangle; items: AlertItem[]; href?: string }

export function NotificationCenter() {
  const { inventory } = useShared()
  const { user } = useSession()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  // Quy tắc parity (admin/page.tsx): ngưỡng > 0 và tồn <= ngưỡng; thiếu nhiều lên đầu.
  const lowStock = useMemo(() => {
    return (inventory || [])
      .filter((x: any) => !x.ngung_su_dung && Number(x.nguong_dat) > 0 && Number(x.ton_kho) <= Number(x.nguong_dat))
      .sort((a: any, b: any) => (Number(b.nguong_dat) - Number(b.ton_kho)) - (Number(a.nguong_dat) - Number(a.ton_kho)))
  }, [inventory])

  const sections: AlertSection[] = useMemo(() => {
    const out: AlertSection[] = []
    if (lowStock.length > 0) {
      out.push({
        id: 'ton', title: 'Cảnh báo tồn kho', icon: AlertTriangle, href: '/v2/kho-hang/thong-ke',
        items: lowStock.slice(0, 20).map((x: any) => ({
          key: x.ma_hang,
          label: `${x.ma_hang} — ${x.ten_hang || ''}`.trim(),
          detail: `Tồn ${Number(x.ton_kho).toLocaleString('vi-VN')} / ngưỡng ${Number(x.nguong_dat).toLocaleString('vi-VN')}`,
          tone: Number(x.ton_kho) <= 0 ? 'rose' : 'amber',
        })),
      })
    }
    return out
  }, [lowStock])

  const total = sections.reduce((s, sec) => s + sec.items.length, 0)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
  }, [open])

  // kthc không cần chuông cảnh báo kỹ thuật
  if (user?.role === 'kthc') return null

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        className="relative w-8 h-8 rounded-md hover:bg-slate-100 flex items-center justify-center"
        aria-label={`Thông báo${total ? ` (${total})` : ''}`}
      >
        <Bell className="w-4 h-4 text-slate-500" />
        {total > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">{total > 99 ? '99+' : total}</span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 w-80 max-h-[70vh] overflow-y-auto bg-white rounded-lg border border-slate-200 shadow-lg"
            style={{ top: pos?.top ?? 50, right: pos?.right ?? 12 }}
          >
            <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Thông báo</span>
              <span className="text-[11px] text-slate-400">{total} mục</span>
            </div>
            {sections.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-slate-400 italic">Không có cảnh báo nào.</div>
            ) : sections.map(sec => {
              const Ic = sec.icon
              return (
                <div key={sec.id} className="py-1.5">
                  <div className="px-3 py-1 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5"><Ic className="w-3.5 h-3.5 text-amber-600" /> {sec.title} ({sec.items.length})</span>
                    {sec.href && <Link href={sec.href} onClick={() => setOpen(false)} className="text-[11px] text-blue-600 hover:underline">Mở →</Link>}
                  </div>
                  <ul className="divide-y divide-slate-50">
                    {sec.items.map(it => (
                      <li key={it.key} className="px-3 py-1.5 flex items-start gap-2">
                        {it.tone === 'rose'
                          ? <PackageX className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />
                          : <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />}
                        <div className="min-w-0">
                          <div className="text-xs text-slate-700 truncate">{it.label}</div>
                          {it.detail && <div className={cn('text-[10px]', it.tone === 'rose' ? 'text-rose-600' : 'text-amber-600')}>{it.detail}</div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
