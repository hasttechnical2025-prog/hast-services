'use client'
import { useEffect } from 'react'
import { useSession } from './SessionProvider'

// LƯỚI AN TOÀN TỰ ĐỘNG: cuốn phiếu chưa làm về hôm nay NGAY KHI MỞ app — phòng khi Vercel cron
// (`0 22 * * *`) lỡ không chạy. Port từ admin/page.tsx cũ (9b67bf3) khi office chuyển sang /qlkt;
// trước đó thiếu bước này nên cron chết là MẤT luôn fallback. Chạy ở LAYOUT -> mọi trang /qlkt đều mồi.
// An toàn: endpoint chỉ admin/tech_admin; KHÔNG ?force (vẫn tôn trọng T7/CN/lễ); hàm cuốn idempotent
// (cuốn rồi gọi lại = 0 phiếu); throttle 1 lần/ngày/trình duyệt qua localStorage['soct_cuon_last'].
export function AutoCuonNgay() {
  const { user } = useSession()
  useEffect(() => {
    const role = user?.role
    if (role !== 'admin' && role !== 'tech_admin') return
    const vnToday = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
    let last: string | null = null
    try { last = localStorage.getItem('soct_cuon_last') } catch { /* ignore */ }
    if (last === vnToday) return // đã mồi hôm nay ở trình duyệt này
    ;(async () => {
      try {
        const res = await fetch('/api/cron/cuon-ngay-phieu') // KHÔNG force -> tôn trọng T7/CN/lễ
        if (!res.ok) return
        try { localStorage.setItem('soct_cuon_last', vnToday) } catch { /* ignore */ }
      } catch { /* mạng lỗi -> lần mở sau thử lại */ }
    })()
  }, [user?.role])
  return null
}
