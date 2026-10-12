'use client'
import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from './SessionProvider'
import { useRealtimeRefetch } from '@/lib/useRealtime'
import { JOBS_TOPIC, CSKH_TOPIC } from '@/lib/realtime'

// Badge đếm trên sidebar v2 — ĐÚNG 2 badge như bản cũ:
//  - cong_viec.hoan_phieu  = số phiếu cứng CHƯA NỘP  (/api/admin/phieu-cung?count=1)
//  - cong_viec.bao_cao_khach = số báo cáo CHỜ GỬI khách (/api/admin/bao-cao-khach?count=1)
// Tôn trọng quyền (chỉ đếm tab role được xem). Tự tươi: realtime JOBS/CSKH + poll 90s + đổi route.
type BadgeCtx = { counts: Record<string, number>; refetch: () => void }
const Ctx = createContext<BadgeCtx | null>(null)

export function useBadges(): BadgeCtx {
  return useContext(Ctx) || { counts: {}, refetch: () => {} }
}

export function BadgeProvider({ children }: { children: React.ReactNode }) {
  const { user, subVisible } = useSession()
  const pathname = usePathname()
  const [counts, setCounts] = useState<Record<string, number>>({})

  const refetch = useCallback(() => {
    if (!user) return
    // Hoàn phiếu
    if (subVisible('cong_viec', 'hoan_phieu')) {
      fetch('/api/admin/phieu-cung?count=1').then(r => r.ok ? r.json() : { count: 0 })
        .then(j => setCounts(c => ({ ...c, 'cong_viec.hoan_phieu': j.count ?? 0 }))).catch(() => {})
    } else setCounts(c => ({ ...c, 'cong_viec.hoan_phieu': 0 }))
    // Báo cáo sửa chữa (gửi khách)
    if (subVisible('cong_viec', 'bao_cao_khach')) {
      fetch('/api/admin/bao-cao-khach?count=1').then(r => r.ok ? r.json() : { count: 0 })
        .then(j => setCounts(c => ({ ...c, 'cong_viec.bao_cao_khach': j.count ?? 0 }))).catch(() => {})
    } else setCounts(c => ({ ...c, 'cong_viec.bao_cao_khach': 0 }))
  }, [user, subVisible])

  useEffect(() => { refetch() }, [refetch])
  // Đổi route (vd vừa nộp phiếu / gửi báo cáo rồi rời tab) → cập nhật lại số.
  useEffect(() => { refetch() }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  // Realtime: việc / CSKH đổi từ máy khác → tự cập nhật; kèm poll 90s nền.
  useRealtimeRefetch([JOBS_TOPIC, CSKH_TOPIC], 'changed', refetch, !!user, 90000)

  return <Ctx.Provider value={{ counts, refetch }}>{children}</Ctx.Provider>
}
