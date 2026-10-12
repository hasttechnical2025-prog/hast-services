'use client'
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DEFAULT_TAB_VIS } from '@/lib/tabs'

// Provider "vỏ": thông tin đăng nhập + phân quyền tab, bóc khỏi admin/page.tsx khổng lồ.
// Fetch 1 lần ở layout /v2, cung cấp qua context cho toàn cây route.

export type SessionUser = { id: string; full_name: string; role: string }

type Ctx = {
  user: SessionUser | null
  loading: boolean
  /** Cấu hình hệ thống (soct_cau_hinh) dạng {khoa: gia_tri} — best-effort. */
  config: Record<string, string>
  /** Role có được xem tab cha? (admin luôn true) */
  tabVisible: (parent: string) => boolean
  /** Role có được xem tab con "cha.con"? (mặc định hiện nếu chưa cấu hình) */
  subVisible: (parent: string, sub: string) => boolean
}

const SessionCtx = createContext<Ctx | null>(null)

export function useSession(): Ctx {
  const ctx = useContext(SessionCtx)
  if (!ctx) throw new Error('useSession phải nằm trong <SessionProvider>')
  return ctx
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [tabVisCfg, setTabVisCfg] = useState<Record<string, Record<string, boolean>>>({})
  const [config, setConfig] = useState<Record<string, string>>({})

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (res.status === 401) { router.replace('/'); return }
        const j = await res.json()
        if (!alive) return
        if (res.ok && j.data) {
          // kinh_doanh / ktv không dùng /v2 (office admin/tech_admin/staff/kthc).
          if (j.data.role === 'kinh_doanh') { router.replace('/kho-thue'); return }
          if (j.data.role === 'ktv') { router.replace('/ktv'); return }
          setUser(j.data)
          // Cấu hình phân quyền tab (best-effort; kinh_doanh/ktv không tới đây).
          try {
            const cRes = await fetch('/api/admin/cau-hinh')
            if (cRes.ok) {
              const cJson = await cRes.json()
              if (alive) setConfig(cJson?.data || {})
              const vis = JSON.parse(cJson?.data?.tab_visibility || '{}')
              if (alive) setTabVisCfg(vis || {})
            }
          } catch { /* dùng mặc định */ }
        } else {
          router.replace('/')
        }
      } catch {
        if (alive) router.replace('/')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [router])

  const roleVis = useCallback((role: string) => ({ ...(DEFAULT_TAB_VIS[role] || {}), ...(tabVisCfg[role] || {}) }), [tabVisCfg])

  const tabVisible = useCallback((parent: string) => {
    if (!user) return false
    if (user.role === 'admin') return true
    if (parent === 'cong_viec') return user.role !== 'kthc'
    if (parent === 'he_thong') return true // mọi role vào Hệ thống để đổi mật khẩu
    return !!roleVis(user.role)[parent]
  }, [user, roleVis])

  const subVisible = useCallback((parent: string, sub: string) => {
    if (!user) return false
    if (user.role === 'admin') return true
    const v = roleVis(user.role)[`${parent}.${sub}`]
    return v === undefined ? true : !!v
  }, [user, roleVis])

  return (
    <SessionCtx.Provider value={{ user, loading, config, tabVisible, subVisible }}>
      {children}
    </SessionCtx.Provider>
  )
}
