'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useMemo } from 'react'
import * as Icons from 'lucide-react'
import { Bell, Search, LogOut, ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { V2_NAV, findParent } from '@/lib/v2-nav'
import { useSession } from './SessionProvider'

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
  const { tabVisible, subVisible } = useSession()
  const parents = useMemo(() => V2_NAV.filter(p => tabVisible(p.permKey)), [tabVisible])

  return (
    <aside className="w-56 shrink-0 border-r border-slate-200 bg-slate-50/60 flex flex-col">
      <div className="px-3 py-3 border-b border-slate-200 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">S</div>
        <div className="leading-tight">
          <div className="text-xs font-bold text-slate-800">Sổ công tác</div>
          <div className="text-[10px] text-slate-400">HSTC · phiên bản 2027</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {parents.map(p => {
          const open = p.slug === parent
          const Ic = iconOf(p.icon)
          const kids = p.children.filter(c => c.permSub ? subVisible(c.permParent, c.permSub) : true)
          const headHref = `/v2/${p.slug}/${(kids[0] || p.children[0]).slug}`
          return (
            <div key={p.slug}>
              <Link
                href={headHref}
                className={cn('flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] font-semibold',
                  open ? 'text-slate-800' : 'text-slate-500 hover:bg-slate-100')}
              >
                <Ic className={cn('w-4 h-4', open ? 'text-blue-600' : 'text-slate-400')} />
                {p.label}
              </Link>
              {open && (
                <div className="ml-3 pl-2 border-l border-slate-200 space-y-0.5 mb-1 mt-0.5">
                  {kids.map(c => {
                    const active = c.slug === child
                    return (
                      <Link
                        key={c.slug}
                        href={`/v2/${p.slug}/${c.slug}`}
                        className={cn('flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] cursor-pointer',
                          active ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-100')}
                      >
                        <span className={cn('w-1 h-1 rounded-full', active ? 'bg-blue-500' : 'bg-slate-300')} />
                        {c.label}
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
        <div className="text-[10px] text-slate-400">{user?.role}</div>
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
      <div className="flex items-center gap-1.5 text-sm min-w-0">
        <span className="text-slate-400">{p?.label || 'Sổ công tác'}</span>
        {c && <>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <span className="font-semibold text-slate-800 truncate">{c.label}</span>
        </>}
      </div>
      <div className="flex-1" />
      <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 w-56 text-slate-400">
        <Search className="w-3.5 h-3.5" /><span className="text-xs">Tìm nhanh…</span>
      </div>
      <button className="relative w-8 h-8 rounded-md hover:bg-slate-100 flex items-center justify-center" aria-label="Thông báo">
        <Bell className="w-4 h-4 text-slate-500" />
      </button>
    </header>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ''
  const { parent, child } = parseRoute(pathname)
  const { loading, user } = useSession()

  if (loading || !user) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Đang tải…</div>
    )
  }

  return (
    <div className="flex-1 flex min-h-0">
      <Sidebar parent={parent} child={child} />
      <section className="flex-1 min-w-0 flex flex-col bg-white">
        <TopBar parent={parent} child={child} />
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/40">{children}</div>
      </section>
    </div>
  )
}
