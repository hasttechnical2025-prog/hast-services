"use client"
import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// Realtime "tự lành" cho các danh sách dùng Supabase Broadcast.
// Broadcast là fire-and-forget (KHÔNG phát lại): nếu WebSocket rớt đúng lúc server bắn tín
// hiệu, client mất tín hiệu và bị stale cho tới khi F5 (hay gặp trên tab nền / máy idle /
// mạng chợp chờn). Hook này bù bằng các mồi refetch:
//  1) nhận broadcast (như cũ);
//  2) tab được focus lại (visibilitychange -> visible);
//  3) mạng trở lại (sự kiện 'online');
//  4) kênh SUBSCRIBED lại sau khi nối lại (bỏ qua lần SUBSCRIBED ĐẦU vì component đã tự
//     fetch lúc mount -> tránh gọi thừa);
//  5) POLL DỰ PHÒNG (tùy chọn `pollMs`): khi tab đang HIỂN THỊ, cứ pollMs ms refetch 1 lần.
//     Đây là lưới an toàn cho tình huống "ngồi nhìn màn hình chờ" — không đổi tab, không rớt
//     mạng, kênh vẫn SUBSCRIBED nhưng WS "chết ngầm" nên lỡ mất tín hiệu broadcast: các mồi
//     (2)(3)(4) đều KHÔNG kích hoạt -> danh sách kẹt vô hạn tới khi F5. Poll bảo đảm tối đa
//     pollMs là tự khớp lại. Broadcast vẫn là kênh chính (tức thì); poll chỉ chạy nền, nhẹ,
//     và TẠM DỪNG khi tab ẩn / mất mạng để khỏi gọi thừa.
export function useRealtimeRefetch(
  topics: string | string[],
  event: string,
  refetch: () => void,
  enabled: boolean = true,
  pollMs: number = 0,
  pollFn?: () => void,
) {
  // Luôn gọi bản refetch MỚI NHẤT mà không cần re-subscribe kênh.
  const fnRef = useRef(refetch)
  fnRef.current = refetch
  // pollFn riêng cho lưới poll (thường NHẸ hơn — VD chỉ tải lại danh sách, không tải kèm
  // khách/kho/danh mục). Không truyền -> poll dùng chung refetch. CẢ HAI nên refetch NGẦM
  // (không bật spinner toàn màn) để nền tự đồng bộ không gây cảm giác "reload".
  const pollRef = useRef(pollFn || refetch)
  pollRef.current = pollFn || refetch
  const key = (Array.isArray(topics) ? topics : [topics]).join('|')

  useEffect(() => {
    if (!enabled) return
    const list = key.split('|')
    const run = () => { try { fnRef.current() } catch { /* refetch tự nuốt lỗi */ } }
    const runPoll = () => { try { pollRef.current() } catch { /* refetch tự nuốt lỗi */ } }

    const channels = list.map(topic => {
      let subscribedOnce = false
      return supabase
        .channel(topic)
        .on('broadcast', { event }, run)
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            if (subscribedOnce) run()   // chỉ refetch khi NỐI LẠI; lần đầu bỏ qua
            subscribedOnce = true
          }
        })
    })

    const onVisible = () => { if (document.visibilityState === 'visible') run() }
    const onOnline = () => run()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)

    // Poll dự phòng: chỉ gọi khi tab hiển thị & còn mạng (tránh đánh thức tab nền / gọi offline).
    let timer: ReturnType<typeof setInterval> | undefined
    if (pollMs > 0) {
      timer = setInterval(() => {
        if (document.visibilityState !== 'visible') return
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return
        runPoll()
      }, pollMs)
    }

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch))
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      if (timer) clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, event, enabled, pollMs])
}
