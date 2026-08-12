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
//     fetch lúc mount -> tránh gọi thừa).
// Nhờ vậy dù lỡ 1 tín hiệu, chỉ cần quay lại tab / mạng về / kênh nối lại là danh sách tự đồng bộ.
export function useRealtimeRefetch(
  topics: string | string[],
  event: string,
  refetch: () => void,
  enabled: boolean = true,
) {
  // Luôn gọi bản refetch MỚI NHẤT mà không cần re-subscribe kênh.
  const fnRef = useRef(refetch)
  fnRef.current = refetch
  const key = (Array.isArray(topics) ? topics : [topics]).join('|')

  useEffect(() => {
    if (!enabled) return
    const list = key.split('|')
    const run = () => { try { fnRef.current() } catch { /* refetch tự nuốt lỗi */ } }

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

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch))
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, event, enabled])
}
