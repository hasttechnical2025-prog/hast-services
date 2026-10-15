'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useMemo, useState, useEffect, useRef } from 'react'
import * as Icons from 'lucide-react'
import { LogOut, ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ShieldAlert } from 'lucide-react'
import { V2_NAV, findParent, type V2Child } from '@/lib/v2-nav'
import { useSession } from './SessionProvider'
import { useBadges } from './BadgeProvider'
import { NotificationCenter } from './NotificationCenter'
import TroLyAI from './TroLyAI'

// Badge đỏ đếm (như bản cũ) bám phải trong mục sidebar.
function CountPill({ n }: { n: number }) {
  if (!n) return null
  return <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white t3 font-bold shrink-0">{n}</span>
}
// Key badge của 1 mục con = "cha.con" (vd cong_viec.hoan_phieu). Bỏ trống nếu không có permSub.
function childBadgeKey(c: V2Child): string | null {
  return c.permSub ? `${c.permParent}.${c.permSub}` : null
}

type Gate = { isAdmin: boolean; tabVisible: (p: string) => boolean; subVisible: (p: string, s: string) => boolean }

// Role có được xem 1 MỤC CON (nav child)? Dùng CHUNG cho sidebar (ẩn) và route guard (chặn link).
function childAllowed(c: V2Child, g: Gate): boolean {
  if (c.adminOnly && !g.isAdmin) return false
  if (c.permAnyOf) return c.permAnyOf.some(k => g.subVisible(c.permParent, k))
  if (c.permSub) return g.subVisible(c.permParent, c.permSub)
  return true
}

// Role có được TRUY CẬP route /v2/<parentSlug>/<childSlug>? (chặn cả khi gõ thẳng link)
function canAccessRoute(parentSlug: string | undefined, childSlug: string | undefined, g: Gate): boolean {
  if (!parentSlug) return true // trang gốc /v2 (server tự redirect theo role)
  const p = V2_NAV.find(x => x.slug === parentSlug)
  if (!p) return true // route lạ → để Next trả 404, không chặn ở đây
  if (p.leaf) return p.permSub ? g.subVisible(p.permKey, p.permSub) : g.tabVisible(p.permKey)
  if (!g.tabVisible(p.permKey)) return false
  if (!childSlug) return true // vào thẳng trang cha (hiếm) → cho qua, sidebar sẽ dẫn tới con hợp lệ
  const c = p.children.find(x => x.slug === childSlug)
  if (!c) return true // con lạ → 404 tự nhiên
  return childAllowed(c, g)
}

// Vỏ ứng dụng /v2: sidebar trái (cây route) + top bar (breadcrumb + chuông) + nội dung.
// Điều hướng client-side (<Link>) nên provider/realtime giữ mount khi đổi module.

function iconOf(name: string): LucideIcon {
  const pascal = name.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')
  return ((Icons as any)[pascal] as LucideIcon) || Icons.Square
}

// Tách /v2/<parent>/<child>/<...> từ pathname.
function parseRoute(pathname: string): { parent?: string; child?: string } {
  const parts = pathname.replace(/^\/+|\/+$/g, '').split('/') // ['v2','so-cong-tac','giao-viec',...]
  if (parts[0] !== 'v2') return {}
  return { parent: parts[1], child: parts[2] }
}

function Sidebar({ parent, child }: { parent?: string; child?: string }) {
  const { tabVisible, subVisible, user, config } = useSession()
  const { counts } = useBadges()
  const isAdmin = user?.role === 'admin'
  const appName = config?.app_ten?.trim() || 'Sổ công tác'
  // Tính con hiển thị + ẩn cha không còn con nào. Cha "lá" (leaf) gate theo permSub.
  // Con adminOnly (vd tab quản trị Hệ thống) chỉ hiện với admin.
  const gate: Gate = { isAdmin, tabVisible, subVisible }
  const parents = useMemo(() => V2_NAV
    .map(p => ({
      p,
      kids: p.children.filter(c => childAllowed(c, gate)),
    }))
    .filter(({ p, kids }) => {
      if (p.leaf) return p.permSub ? subVisible(p.permKey, p.permSub) : tabVisible(p.permKey)
      return tabVisible(p.permKey) && kids.length > 0
    }), [tabVisible, subVisible, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  // Trạng thái gập/mở ĐỘC LẬP từng nhóm (đa-mở). MẶC ĐỊNH (đăng nhập / refresh / Thu gọn):
  // chỉ mở nhóm chứa trang hiện tại, các nhóm khác thu gọn. Trong phiên tự mở thêm được; refresh về mặc định.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(parent ? [parent] : []))
  const toggle = (slug: string) => setExpanded(prev => { const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n })
  const ensureOpen = (slug: string) => setExpanded(prev => prev.has(slug) ? prev : new Set(prev).add(slug))
  // Mở nhóm chứa trang hiện tại khi route đổi (tải lại / deep-link / điều hướng).
  useEffect(() => { if (parent) ensureOpen(parent) }, [parent]) // eslint-disable-line react-hooks/exhaustive-deps
  const expandableSlugs = parents.filter(x => !x.p.leaf).map(x => x.p.slug)
  const allOpen = expandableSlugs.length > 0 && expandableSlugs.every(s => expanded.has(s))
  // "Mở tất cả" -> mở hết; "Thu gọn" -> chỉ giữ nhóm hiện tại.
  const toggleAll = () => setExpanded(allOpen ? new Set(parent ? [parent] : []) : new Set(expandableSlugs))

  // Bề rộng sidebar CO DÃN: kéo cạnh phải, kẹp [200, 360], mặc định 256, nhớ localStorage.
  const SIDEBAR_KEY = 'v2:sidebar-w'
  const [sideW, setSideW] = useState(256)
  const sideWRef = useRef(256); sideWRef.current = sideW
  const dragW = useRef<{ sx: number; sw: number } | null>(null)
  useEffect(() => { try { const v = parseInt(localStorage.getItem(SIDEBAR_KEY) || ''); if (v >= 200 && v <= 360) setSideW(v) } catch {} }, [])
  const clampW = (x: number) => Math.min(360, Math.max(200, x))
  const onWMove = (e: PointerEvent) => { const d = dragW.current; if (!d) return; setSideW(clampW(d.sw + (e.clientX - d.sx))) }
  const onWUp = () => {
    window.removeEventListener('pointermove', onWMove); window.removeEventListener('pointerup', onWUp)
    document.body.style.userSelect = ''
    try { localStorage.setItem(SIDEBAR_KEY, String(sideWRef.current)) } catch {}
  }
  const onWDown = (e: React.PointerEvent) => {
    e.preventDefault()
    dragW.current = { sx: e.clientX, sw: sideWRef.current }
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onWMove); window.addEventListener('pointerup', onWUp)
  }

  return (
    <aside style={{ width: sideW }} className="relative shrink-0 border-r border-slate-200 bg-slate-50/60 flex flex-col">
      {/* Tay kéo co dãn bề rộng (kẹp 200–360px, nhớ localStorage). */}
      <div onPointerDown={onWDown} title="Kéo để đổi rộng sidebar" className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-blue-300/50 active:bg-blue-400/60 z-40 select-none" />
      <div className="h-12 px-3 border-b border-slate-200 flex items-center gap-2 shrink-0">
        {/* Logo + tên app lấy từ hệ thống (public/logo.png + Cài đặt › app_ten). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Logo" className="h-7 w-auto max-w-[32px] object-contain rounded-md shrink-0" />
        <div className="leading-tight min-w-0">
          <div className="text-xs font-bold text-slate-800 truncate" title={appName}>{appName}</div>
          <div className="t3 text-slate-400">Phiên bản 2027</div>
        </div>
      </div>
      <div className="px-2 pt-2 flex justify-end">
        <button onClick={toggleAll} title={allOpen ? 'Thu gọn tất cả' : 'Mở tất cả'}
          className="t3 text-slate-400 hover:text-blue-600 inline-flex items-center gap-1 px-1.5 py-0.5 rounded">
          {allOpen ? <Icons.ChevronsDownUp className="w-3 h-3" /> : <Icons.ChevronsUpDown className="w-3 h-3" />}
          {allOpen ? 'Thu gọn' : 'Mở tất cả'}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pt-1 pb-2 space-y-0.5">
        {parents.map(({ p, kids }) => {
          const isActive = p.slug === parent
          const isExpanded = expanded.has(p.slug)
          const Ic = iconOf(p.icon)
          const headHref = p.leaf ? `/v2/${p.slug}` : `/v2/${p.slug}/${(kids[0] || p.children[0]).slug}`
          // Tổng badge các mục con — hiện trên tab CHA khi nhóm đang THU GỌN, để không mất tín hiệu.
          // Cha "lá" (vd Kanban): badge riêng theo key permKey.permSub, hiện cả khi đang mở (không có con).
          const parentSum = p.leaf
            ? (p.permSub ? (counts[`${p.permKey}.${p.permSub}`] || 0) : 0)
            : kids.reduce((s, c) => { const k = childBadgeKey(c); return s + (k ? (counts[k] || 0) : 0) }, 0)
          return (
            <div key={p.slug}>
              <div className="flex items-center gap-0.5">
                <Link
                  href={headHref}
                  onClick={() => { if (!p.leaf) ensureOpen(p.slug) }}
                  className={cn('flex items-center gap-2 px-2.5 py-1.5 rounded-md t1 font-semibold flex-1 min-w-0',
                    p.tone === 'rose'
                      ? (isActive ? 'bg-rose-50 text-rose-700' : 'text-rose-600 hover:bg-rose-50')
                      : isActive ? (p.leaf ? 'bg-blue-50 text-blue-700' : 'text-slate-800') : 'text-slate-500 hover:bg-slate-100')}
                >
                  <Ic className={cn('w-4 h-4 shrink-0', p.tone === 'rose' ? 'text-rose-500' : isActive ? 'text-blue-600' : 'text-slate-400')} />
                  <span className="flex-1 truncate">{p.label}</span>
                  {(!isExpanded || p.leaf) && <CountPill n={parentSum} />}
                </Link>
                {!p.leaf && (
                  <button onClick={() => toggle(p.slug)} title={isExpanded ? 'Thu gọn' : 'Mở'}
                    className="shrink-0 w-6 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-100">
                    <Icons.ChevronDown className={cn('w-3.5 h-3.5 transition-transform', isExpanded ? '' : '-rotate-90')} />
                  </button>
                )}
              </div>
              {isExpanded && !p.leaf && (
                <div className="ml-3 pl-2 border-l border-slate-200 space-y-0.5 mb-1 mt-0.5">
                  {kids.map(c => {
                    const active = c.slug === child
                    const bk = childBadgeKey(c)
                    return (
                      <Link
                        key={c.slug}
                        href={`/v2/${p.slug}/${c.slug}`}
                        className={cn('flex items-center gap-2 px-2.5 py-1.5 rounded-md t1 cursor-pointer',
                          active ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-100')}
                      >
                        <span className={cn('w-1 h-1 rounded-full shrink-0', active ? 'bg-blue-500' : 'bg-slate-300')} />
                        <span className="flex-1 truncate">{c.label}</span>
                        <CountPill n={bk ? (counts[bk] || 0) : 0} />
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>
      <UserFooter />
    </aside>
  )
}

function UserFooter() {
  const { user } = useSession()
  const router = useRouter()
  const initials = (user?.full_name || '?').split(' ').slice(-2).map(s => s[0]).join('').toUpperCase()
  const logout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }) } catch { /* vẫn điều hướng về landing */ }
    router.replace('/')
  }
  return (
    <div className="px-3 py-2 border-t border-slate-200 flex items-center gap-2">
      <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-semibold">{initials}</div>
      <div className="leading-tight flex-1 min-w-0">
        <div className="text-xs font-semibold text-slate-700 truncate">{user?.full_name || '…'}</div>
        <div className="t3 text-slate-400">{user?.role}</div>
      </div>
      <button onClick={logout} title="Đăng xuất" className="text-slate-400 hover:text-rose-600"><LogOut className="w-4 h-4" /></button>
    </div>
  )
}

function TopBar({ parent, child }: { parent?: string; child?: string }) {
  const p = parent ? findParent(parent) : undefined
  const c = p?.children.find(x => x.slug === child)
  return (
    <header className="h-12 shrink-0 border-b border-slate-200 flex items-center gap-3 px-4 bg-white">
      <div className="flex items-center gap-1.5 text-sm min-w-0 shrink-0">
        <span className="text-slate-400">{p?.label || 'Sổ công tác'}</span>
        {c && <>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <span className="font-semibold text-slate-800 truncate">{c.label}</span>
        </>}
      </div>
      {/* Chuông đặt cạnh breadcrumb, cách ml-2 để không lẫn với link */}
      <div className="ml-2"><NotificationCenter /></div>
      <div className="flex-1" />
    </header>
  )
}

function AccessDenied({ role }: { role?: string }) {
  return (
    <div className="max-w-md mx-auto mt-10 border border-slate-200 rounded-xl p-8 text-center bg-slate-50/50 space-y-3">
      <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto"><ShieldAlert className="w-6 h-6" /></div>
      <div className="font-semibold text-slate-700">Bạn không có quyền truy cập mục này</div>
      <p className="text-xs text-slate-400">Tài khoản của bạn (<b>{role || '—'}</b>) chưa được cấp quyền. Liên hệ Admin nếu cần mở quyền.</p>
      <Link href="/v2" className="inline-block text-sm font-semibold text-blue-700 hover:underline">→ Về trang chính</Link>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ''
  const { parent, child } = parseRoute(pathname)
  const { loading, user, tabVisible, subVisible } = useSession()

  if (loading || !user) {
    return (
      <div className="h-[100dvh] flex items-center justify-center text-slate-400 text-sm">Đang tải…</div>
    )
  }

  // Chặn truy cập route theo quyền (kể cả khi gõ thẳng link): không render nội dung nếu không có quyền.
  const allowed = canAccessRoute(parent, child, { isAdmin: user.role === 'admin', tabVisible, subVisible })

  // Khung cao ĐÚNG màn hình + overflow-hidden: sidebar trái cố định (footer role luôn đáy),
  // CHỈ vùng phải cuộn khi danh sách dài. min-h-0 cho phép con overflow đúng.
  return (
    <div className="v2-shell h-[100dvh] flex overflow-hidden">
      <Sidebar parent={parent} child={child} />
      <section className="flex-1 min-w-0 flex flex-col bg-white min-h-0">
        <TopBar parent={parent} child={child} />
        {/* Vùng cuộn KHÔNG padding (padding ở wrapper trong) -> thanh tab con sticky top-0 dính SÁT
            mép trên, không để lộ content ở khe padding. */}
        {/* --head-h = -2.5rem: component dùng chung từ admin (ThueCpcModule) ghim tab con tại
            top-[calc(var(--head-h)+2.5rem)]. Admin có header+tab-cha (--head-h+2.5rem); ở v2 TopBar
            nằm NGOÀI vùng cuộn nên offset đúng = 0 → đặt -2.5rem để calc ra 0 (tab con sticky sát mép). */}
        <div className="flex-1 overflow-y-auto bg-slate-200" style={{ ['--head-h' as string]: '-2.5rem' } as React.CSSProperties}>
          <div className="px-2 py-4">{allowed ? children : <AccessDenied role={user.role} />}</div>
        </div>
      </section>
      {/* Trợ lý AI — nút nổi góc dưới phải (không chiếm chỗ bảng/dữ liệu), gate quyền tro_ly. */}
      {tabVisible('tro_ly') && <TroLyAI />}
    </div>
  )
}
