"use client"

import { useEffect } from "react"

/**
 * NGUYÊN TẮC TOÀN APP: chỉ CLICK vào nút được thiết kế mới có tác dụng.
 * Không dùng phím tắt để Lưu / Xác thực / Hủy:
 *   - Enter KHÔNG submit form, KHÔNG bấm hộ nút Lưu / Đăng nhập / Tra cứu…
 *   - Esc  KHÔNG bấm hộ nút Hủy / đóng hộp thoại.
 *
 * Chặn ở tầng CAPTURE của document nên chạy trước mọi handler React và trước
 * "submit ngầm" (implicit submission) của HTML -> không cần vá từng form.
 *
 * Ngoại lệ có chủ đích:
 *   - Đang gõ tiếng Việt bằng bộ gõ (Telex/VNI): Enter dùng để chốt ký tự -> phải để yên.
 *   - Enter trong <textarea>: là xuống dòng, không phải xác nhận.
 */
export default function NoKeyShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== 'Escape') return
      // Bộ gõ tiếng Việt đang dựng ký tự -> không đụng vào
      if (e.isComposing || e.keyCode === 229) return
      // Xuống dòng trong ô ghi chú nhiều dòng vẫn giữ nguyên
      if (e.key === 'Enter' && (e.target as HTMLElement | null)?.tagName === 'TEXTAREA') return

      e.preventDefault()   // chặn hành vi mặc định (submit ngầm, bấm nút đang focus)
      e.stopPropagation()  // chặn luôn các handler onKeyDown của React ở bên dưới
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [])

  return null
}
