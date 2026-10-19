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
  /** Tải lại cấu hình + phân quyền tab (sau khi lưu ở Cài đặt hệ thống). */
  refetchConfig: () => void
  /** Role có được xem tab cha? (admin luôn true) */
  tabVisible: (parent: string) => boolean
  /** Role có được xem tab con "cha.con"? (mặc định hiện nếu chưa cấu hình) */
  subVisible: (parent: string, sub: string) => boolean
  /** Role có được xem tab cháu "cha.con.cháu"? (vd nhóm trong Thuê/CPC) */
  subSubVisible: (parent: string, sub: string, subsub: string) => boolean
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

  // Tải cấu hình + phân quyền tab (gọi lúc đăng nhập xong và sau khi lưu ở Cài đặt hệ thống).
  const refetchConfig = useCallback(() => {
    fetch('/api/admin/cau-hinh')
      .then(r => r.ok ? r.json() : null)
      .then(cJson => {
        if (!cJson) return
        setConfig(cJson?.data || {})
        try { setTabVisCfg(JSON.parse(cJson?.data?.tab_visibility || '{}') || {}) } catch { /* giữ cũ */ }
      })
      .catch(() => { /* dùng mặc định */ })
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (res.status === 401) { router.replace('/'); return }
        const j = await res.json()
        if (!alive) return
        if (res.ok && j.data) {
          // kinh_doanh / ktv không dùng /qlkt (office admin/tech_admin/staff/kthc).
          if (j.data.role === 'kinh_doanh') { router.replace('/kho-thue'); return }
          if (j.data.role === 'ktv') { router.replace('/ktv'); return }
          // Cấu hình phân quyền tab + quyền dùng giao diện mới (v2). Đọc TRƯỚC khi hiển thị.
          let cfg: Record<string, string> = {}
          try {
            const cRes = await fetch('/api/admin/cau-hinh')
            if (cRes.ok) cfg = (await cRes.json())?.data || {}
          } catch { /* dùng mặc định -> fail-closed cho role khác admin */ }
          // Chặn vào giao diện mới nếu role chưa được cấp quyền (admin LUÔN được). Đá về /admin.
          if (j.data.role !== 'admin') {
            const allowed = String(cfg.v2_roles || '').split(',').map(s => s.trim()).filter(Boolean)
            if (!allowed.includes(j.data.role)) { router.replace('/admin'); return }
          }
          setUser(j.data)
          if (alive) setConfig(cfg)
          try { if (alive) setTabVisCfg(JSON.parse(cfg.tab_visibility || '{}') || {}) } catch { /* giữ mặc định */ }
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

  const subSubVisible = useCallback((parent: string, sub: string, subsub: string) => {
    if (!user) return false
    if (user.role === 'admin') return true
    const v = roleVis(user.role)[`${parent}.${sub}.${subsub}`]
    return v === undefined ? true : !!v
  }, [user, roleVis])

  return (
    <SessionCtx.Provider value={{ user, loading, config, refetchConfig, tabVisible, subVisible, subSubVisible }}>
      {children}
    </SessionCtx.Provider>
  )
}
