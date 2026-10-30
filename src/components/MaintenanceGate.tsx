"use client"

import { useEffect, useCallback } from "react"

const BYPASS_FLAG = 'hast_qt_ok'

/**
 * Khóa app (cờ `bao_tri` ở Cấu hình): phủ MÀN 404 cho MỌI user trừ admin.
 * Đặt ở root layout -> áp cho tất cả trang (/, /admin, /m, /ktv, /qlkt, /khoa, /admin/scan).
 *
 * NGỤY TRANG 404 + CHỐNG NHÁY (no-FOUC):
 *   - Màn chặn là `#maint-404` (render sẵn, ẩn) + CSS `html[data-maint="1"]` ở globals.css,
 *     TRÔNG Y HỆT trang 404 mặc định Next.js ("404 | This page could not be found.").
 *   - Script inline ở layout đặt data-maint NGAY từ localStorage TRƯỚC khi vẽ nội dung ->
 *     reload lúc đang khóa hiện 404 từ khung hình đầu, KHÔNG nháy app/login.
 *   - Component này chỉ XÁC NHẬN với server (/api/status) rồi bật/tắt data-maint + nhớ localStorage.
 *
 * Admin vào lại bằng link kín ?qt=<khóa> (đối chiếu Ở SERVER). Nhớ sessionStorage để admin
 * đăng xuất giữa chừng vẫn qua được màn, khỏi tự nhốt. Hết khóa -> poll 30s tự gỡ.
 *
 * ĐÂY CHỈ LÀ LỚP GIAO DIỆN. Chặn thật ở server: requireRole() + route đăng nhập + cron + Telegram.
 */
export default function MaintenanceGate() {
  const check = useCallback(async () => {
    try {
      const qt = new URLSearchParams(window.location.search).get('qt') || ''
      const url = qt ? `/api/status?qt=${encodeURIComponent(qt)}` : '/api/status'
      const r = await fetch(url, { cache: 'no-store' })
      const j = await r.json()

      // Tab đã từng được phép (admin đăng nhập / mở bằng link kín) thì nhớ lại.
      if (j.allow) sessionStorage.setItem(BYPASS_FLAG, '1')
      if (j.ok) sessionStorage.removeItem(BYPASS_FLAG) // hết khóa -> quên đi
      const allowed = j.allow || sessionStorage.getItem(BYPASS_FLAG) === '1'
      const blocked = j.ok === false && !allowed

      const el = document.documentElement
      if (blocked) el.setAttribute('data-maint', '1')
      else el.removeAttribute('data-maint')
      // Nhớ cho lần tải sau để script inline phủ 404 ngay, khỏi nháy.
      try { localStorage.setItem('hast_maint', blocked ? '1' : '0') } catch { /* ignore */ }
    } catch { /* lỗi mạng -> giữ nguyên trạng thái script inline đã đặt, không đổi */ }
  }, [])

  useEffect(() => {
    check()
    // Bật/tắt trong lúc user đang mở app -> tự nhận sau tối đa 30s.
    const t = setInterval(check, 30_000)
    return () => clearInterval(t)
  }, [check])

  return null
}
