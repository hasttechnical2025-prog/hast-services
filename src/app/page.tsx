"use client"

import Link from 'next/link'
import { useState } from 'react'
import { PasskeyLoginButton } from '@/components/PasskeyButtons'

export default function Home() {
  const [msg, setMsg] = useState<string | null>(null)
  const handleAdminLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Phát hiện thiết bị di động (Mobile User-Agent hoặc chiều rộng màn hình nhỏ)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768
    if (isMobile) {
      e.preventDefault()
      window.location.href = '/m'
    }
  }

  return (
    <main className="min-h-screen p-8 flex flex-col items-center justify-center bg-gray-50 font-sans">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-md text-center">
        <h1 className="text-3xl font-bold mb-6 text-slate-800">Tech-Service App</h1>
        <p className="mb-8 text-slate-600">Hệ thống Quản lý Giao việc & Kho hàng</p>

        <div className="flex flex-col gap-4">
          <Link
            href="/admin"
            onClick={handleAdminLinkClick}
            className="w-full py-3 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition font-medium block"
          >
            Dashboard Admin (Văn phòng)
          </Link>

          <Link
            href="/ktv"
            className="w-full py-3 px-4 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition font-medium block"
          >
            Sổ công tác Mobile (KTV)
          </Link>

          <div className="pt-2 mt-1 border-t border-slate-100">
            <PasskeyLoginButton
              onResult={(m) => setMsg(m)}
              className="w-full py-3 px-4 bg-slate-800 text-white rounded-md hover:bg-slate-900 transition font-medium disabled:opacity-60"
            />
            <p className="text-xs text-slate-400 mt-2">Đăng nhập nhanh & chuyển vai trò bằng vân tay / Face ID (cần bật trước trong app).</p>
            {msg && <p className="text-xs text-amber-600 mt-1">{msg}</p>}
          </div>
        </div>
      </div>
    </main>
  )
}
