"use client"

import { useState, useEffect, useCallback } from "react"

const BYPASS_FLAG = 'hast_qt_ok'

/**
 * Màn chặn phủ toàn trang cho MỌI user trừ admin (bật/tắt bằng cờ `bao_tri` ở Cấu hình).
 * Đặt ở root layout -> áp cho tất cả trang (/, /admin, /m, /ktv, /admin/scan), PC & mobile.
 *
 * CỐ Ý trông như MỘT SỰ CỐ MÁY CHỦ THẬT, không phải thông báo bảo trì:
 *   - không nhắc chữ "bảo trì", không icon bánh răng (bánh răng = có người đang chỉnh = cố ý)
 *   - nền trắng trơn, không thẻ bo tròn/đổ bóng, không logo -> giống trang lỗi thô
 *   - có mã lỗi 503 + nút "Thử lại" y như trang lỗi thật (bấm vẫn hỏng -> càng thật)
 *   - KHÔNG có bất kỳ nút/link đăng nhập nào: chỉ cần một gợi ý là lộ ngay việc app bị
 *     khóa có chủ đích và có cửa riêng cho admin.
 * Thông điệp lấy từ BAO_TRI_MSG (dùng chung với lỗi 503 ở các route đăng nhập) để giọng
 * điệu khớp nhau — lệch một chỗ là lộ.
 *
 * Admin vào lại bằng link kín ?qt=<khóa> (khóa đặt ở Hệ thống > Cấu hình, đối chiếu Ở
 * SERVER nên không lộ trong JS). Nhớ trong sessionStorage để không mất khi chuyển trang
 * trước lúc đăng nhập xong.
 *
 * ĐÂY CHỈ LÀ LỚP GIAO DIỆN. Chặn thật nằm ở server: requireRole() + các route đăng nhập
 * + cron + Telegram. Tắt JS hay gọi thẳng API vẫn không qua được.
 */
export default function MaintenanceGate() {
  const [blocked, setBlocked] = useState(false)
  const [msg, setMsg] = useState('')
  const [trying, setTrying] = useState(false)

  const check = useCallback(async () => {
    try {
      const qt = new URLSearchParams(window.location.search).get('qt') || ''
      const url = qt ? `/api/status?qt=${encodeURIComponent(qt)}` : '/api/status'
      const r = await fetch(url, { cache: 'no-store' })
      const j = await r.json()

      // Tab nào đã từng được phép (admin đăng nhập, hoặc mở bằng link kín) thì nhớ lại:
      // admin đăng xuất giữa chừng vẫn thấy được form để đăng nhập lại, khỏi tự nhốt mình.
      if (j.allow) sessionStorage.setItem(BYPASS_FLAG, '1')
      if (j.ok) sessionStorage.removeItem(BYPASS_FLAG) // hết khóa -> quên đi
      const allowed = j.allow || sessionStorage.getItem(BYPASS_FLAG) === '1'

      setBlocked(j.ok === false && !allowed)
      setMsg(j.msg || '')
    } catch { /* lỗi mạng -> không khóa nhầm */ }
  }, [])

  useEffect(() => {
    check()
    // Bật/tắt trong lúc user đang mở app -> tự nhận sau tối đa 30s
    const t = setInterval(check, 30_000)
    return () => clearInterval(t)
  }, [check])

  // Nút "Thử lại" của trang lỗi thật: có khựng một nhịp rồi vẫn hỏng.
  const retry = async () => {
    setTrying(true)
    await new Promise(res => setTimeout(res, 600))
    await check()
    setTrying(false)
  }

  if (!blocked) return null

  return (
    <div className="fixed inset-0 z-[999] bg-white flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <svg className="w-12 h-12 mx-auto text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <h1 className="text-xl font-semibold text-slate-700">Không thể kết nối tới máy chủ</h1>
        <p className="text-sm text-slate-500">{msg || 'Máy chủ không phản hồi. Vui lòng thử lại sau ít phút.'}</p>
        <p className="text-xs text-slate-400 font-mono pt-1">HTTP 503 — Service Unavailable</p>
        <div className="pt-2">
          <button
            onClick={retry}
            disabled={trying}
            className="px-4 h-9 rounded-md border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            {trying ? 'Đang thử lại…' : 'Thử lại'}
          </button>
        </div>
      </div>
    </div>
  )
}
