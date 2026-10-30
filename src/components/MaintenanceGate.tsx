"use client"

import { useState, useEffect, useCallback } from "react"

const BYPASS_FLAG = 'hast_qt_ok'

/**
 * Màn chặn phủ toàn trang cho MỌI user trừ admin (bật/tắt bằng cờ `bao_tri` ở Cấu hình).
 * Đặt ở root layout -> áp cho tất cả trang (/, /admin, /m, /ktv, /qlkt, /khoa, /admin/scan), PC & mobile.
 *
 * CỐ Ý TRÔNG Y HỆT TRANG 404 MẶC ĐỊNH CỦA NEXT.JS (không phải thông báo bảo trì):
 *   - "404 | This page could not be found." — markup + style inline khớp framework,
 *     KHÔNG dùng font/thương hiệu của app -> giống hệt một trang không tồn tại.
 *   - KHÔNG nút/link đăng nhập, KHÔNG nhắc "bảo trì": lộ một gợi ý là lộ việc khóa có chủ đích.
 *   - Khóa app -> trang trông đúng như "không có trang này", không phân biệt được với 404 thật.
 *
 * Admin vào lại bằng link kín ?qt=<khóa> (đặt ở Hệ thống > Cấu hình, đối chiếu Ở SERVER nên
 * không lộ trong JS). Nhớ trong sessionStorage để không mất khi chuyển trang trước lúc đăng nhập xong.
 * Hết khóa (admin mở) -> poll 30s tự phát hiện và gỡ màn chặn, không cần bấm gì.
 *
 * ĐÂY CHỈ LÀ LỚP GIAO DIỆN. Chặn thật nằm ở server: requireRole() + các route đăng nhập
 * + cron + Telegram. Tắt JS hay gọi thẳng API vẫn không qua được.
 */
export default function MaintenanceGate() {
  const [blocked, setBlocked] = useState(false)

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
    } catch { /* lỗi mạng -> không khóa nhầm */ }
  }, [])

  useEffect(() => {
    check()
    // Bật/tắt trong lúc user đang mở app -> tự nhận sau tối đa 30s
    const t = setInterval(check, 30_000)
    return () => clearInterval(t)
  }, [check])

  if (!blocked) return null

  // Sao chép đúng trang 404 mặc định của Next.js (inline style, font hệ thống) -> không lộ.
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 999, background: '#fff', color: '#000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji"',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h1 style={{ margin: 0, marginRight: 20, padding: '0 23px 0 0', fontSize: 24, fontWeight: 500, lineHeight: '49px', borderRight: '1px solid rgba(0,0,0,.3)' }}>404</h1>
        <div style={{ display: 'inline-block' }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 400, lineHeight: '49px' }}>This page could not be found.</h2>
        </div>
      </div>
    </div>
  )
}
