"use client"

import { useEffect, useRef, useState } from "react"

// Kiểm tra định kỳ có bản deploy mới không (so mã build từ /api/version).
// Nếu có -> hiện banner gợi ý tải lại (không tự reload để tránh mất dữ liệu đang nhập).
export default function UpdateChecker({ intervalMs = 5 * 60 * 1000 }: { intervalMs?: number }) {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const baseline = useRef<string | null>(null)

  useEffect(() => {
    let stopped = false
    const check = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return
        const { version } = await res.json()
        if (!version) return
        if (baseline.current === null) { baseline.current = version; return } // lần đầu: ghi mốc
        if (version !== baseline.current) setUpdateAvailable(true)
      } catch { /* bỏ qua lỗi mạng, thử lại lần sau */ }
    }
    check()
    const id = setInterval(() => { if (!stopped) check() }, intervalMs)
    const onVis = () => { if (document.visibilityState === 'visible') check() } // quay lại tab -> kiểm tra ngay
    document.addEventListener('visibilitychange', onVis)
    return () => { stopped = true; clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [intervalMs])

  if (!updateAvailable) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] w-[calc(100%-2rem)] max-w-md">
      <div className="bg-blue-600 text-white rounded-xl shadow-lg border border-blue-500 px-4 py-3 flex items-center gap-3">
        <span className="text-sm font-medium flex-1">Đã có bản cập nhật mới của ứng dụng.</span>
        <button
          onClick={() => window.location.reload()}
          className="shrink-0 bg-white text-blue-700 text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition"
        >
          Tải lại ngay
        </button>
        <button
          onClick={() => setUpdateAvailable(false)}
          className="shrink-0 text-white/80 hover:text-white text-sm px-1"
          title="Để sau"
        >
          Để sau
        </button>
      </div>
    </div>
  )
}
