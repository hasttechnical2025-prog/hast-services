'use client'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { useSession } from '@/features/_shell/SessionProvider'

// Chặn truy cập trực tiếp URL các tab Hệ thống chỉ-admin với role khác (nav đã ẩn sẵn).
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession()
  if (loading) return <div className="text-sm text-slate-400 py-10 text-center">Đang tải…</div>
  if (user?.role !== 'admin') {
    return (
      <div className="max-w-md mx-auto mt-10 border border-slate-200 rounded-xl p-8 text-center bg-slate-50/50 space-y-3">
        <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto"><ShieldAlert className="w-6 h-6" /></div>
        <div className="font-semibold text-slate-700">Chỉ Admin truy cập được mục này</div>
        <p className="text-xs text-slate-400">Tài khoản của bạn (<b>{user?.role || '—'}</b>) không có quyền. Bạn có thể vào mục Đổi mật khẩu.</p>
        <Link href="/v2/he-thong/doi-mat-khau" className="inline-block text-sm font-semibold text-blue-700 hover:underline">→ Đổi mật khẩu</Link>
      </div>
    )
  }
  return <>{children}</>
}
