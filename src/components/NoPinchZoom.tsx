"use client"

import { useEffect } from "react"

/**
 * Chặn phóng to/thu nhỏ bằng 2 ngón (pinch) trên iOS Safari — nơi bỏ qua
 * cờ user-scalable=no của viewport. Vẫn giữ cuộn 1 ngón bình thường.
 */
export default function NoPinchZoom() {
  useEffect(() => {
    // Cử chỉ pinch của Safari (không chuẩn nhưng iOS hỗ trợ)
    const stopGesture = (e: Event) => e.preventDefault()
    // touchmove nhiều ngón -> chặn zoom, chừa lại chạm 1 ngón để cuộn
    const stopMultiTouch = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault() }

    document.addEventListener("gesturestart", stopGesture, { passive: false })
    document.addEventListener("gesturechange", stopGesture, { passive: false })
    document.addEventListener("gestureend", stopGesture, { passive: false })
    document.addEventListener("touchmove", stopMultiTouch, { passive: false })

    return () => {
      document.removeEventListener("gesturestart", stopGesture)
      document.removeEventListener("gesturechange", stopGesture)
      document.removeEventListener("gestureend", stopGesture)
      document.removeEventListener("touchmove", stopMultiTouch)
    }
  }, [])

  return null
}
