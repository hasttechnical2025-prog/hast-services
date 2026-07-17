"use client"

import { useState, useEffect } from "react"

/**
 * Màn "Hệ thống đang bảo trì" phủ toàn trang cho MỌI user trừ admin.
 * Đặt ở root layout -> áp cho tất cả trang (/, /admin, /m, /ktv, /admin/scan) trên cả PC & mobile.
 *
 * ĐÂY CHỈ LÀ LỚP GIAO DIỆN. Chặn thật nằm ở server: requireRole() + các route đăng nhập
 * + cron + Telegram. Tắt JS hay gọi thẳng API vẫn không qua được.
 */
export default function MaintenanceGate() {
  const [blocked, setBlocked] = useState(false)
  const [loggedIn, setLoggedIn] = useState(true)
  const [msg, setMsg] = useState('')
  const [showLogin, setShowLogin] = useState(false) // admin bấm "Đăng nhập" -> tạm mở lớp phủ

  useEffect(() => {
    let stop = false
    const check = async () => {
      try {
        const r = await fetch('/api/maintenance', { cache: 'no-store' })
        const j = await r.json()
        if (stop) return
        const b = !!j.bao_tri && !j.admin
        setBlocked(b)
        setLoggedIn(!!j.logged_in)
        setMsg(j.msg || '')
        if (!b) setShowLogin(false) // hết bảo trì / đã là admin -> về mặc định
      } catch { /* lỗi mạng -> không khóa nhầm */ }
    }
    check()
    // Bật/tắt bảo trì trong lúc user đang mở app -> tự nhận sau tối đa 30s
    const t = setInterval(check, 30_000)
    return () => { stop = true; clearInterval(t) }
  }, [])

  // Admin bấm "Đăng nhập quản trị viên" -> để lộ form đăng nhập bên dưới.
  // Không phải lỗ hổng: server vẫn từ chối đăng nhập của mọi role != admin (503).
  if (!blocked || showLogin) return null

  return (
    <div className="fixed inset-0 z-[999] bg-slate-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm max-w-sm w-full p-8 text-center space-y-3">
        <div className="w-14 h-14 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-slate-800">Hệ thống đang bảo trì</h1>
        <p className="text-sm text-slate-500">{msg || 'Vui lòng quay lại sau.'}</p>

        {/* Chưa đăng nhập -> chừa lối vào, nếu không admin đăng xuất giữa lúc bảo trì
            sẽ bị chính lớp phủ này che mất form đăng nhập và không vào lại được.
            Đã đăng nhập mà không phải admin -> KHÔNG có lối này (chặn cứng). */}
        {!loggedIn && (
          <button
            onClick={() => setShowLogin(true)}
            className="text-xs text-slate-400 hover:text-blue-600 underline underline-offset-2 pt-1"
          >
            Đăng nhập quản trị viên
          </button>
        )}
      </div>
    </div>
  )
}
