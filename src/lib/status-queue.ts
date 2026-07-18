// Hàng đợi offline cho thao tác đổi trạng thái của KTV (bấm Đang làm / Lắp tiếp / Hoàn thành).
// Vì sao cần: KTV thao tác dưới hầm không sóng -> gửi thẳng sẽ THẤT BẠI và mất luôn thao tác.
// Cơ chế: đóng dấu GIỜ CHẠM ngay tại máy (đã hiệu chỉnh lệch đồng hồ theo server), lưu vào
// localStorage, giao diện đổi trạng thái ngay (lạc quan), rồi TỰ GỬI LẠI khi có sóng —
// gói tin mang theo giờ chạm gốc nên dù đồng bộ trễ, mốc thời gian vẫn đúng lúc bấm.
//
// Idempotent: server ghi mốc MỘT LẦN (set khi NULL) nên gửi lại nhiều lần vẫn cùng kết quả.

const QUEUE_KEY = 'hast_status_queue'
const OFFSET_KEY = 'hast_clock_offset'

type QItem = { qid: string; jobId: string; ket_qua: string; tapped_at: string; so_phut?: number; tries: number }

let clockOffset = 0        // giờ server - giờ máy (ms)
let flushing = false
const listeners = new Set<(pending: number) => void>()

// ---- lệch đồng hồ ----
export async function initClockOffset(): Promise<void> {
  try {
    const saved = Number(localStorage.getItem(OFFSET_KEY))
    if (!isNaN(saved)) clockOffset = saved
  } catch { /* ignore */ }
  try {
    const t0 = Date.now()
    const r = await fetch('/api/now', { cache: 'no-store' })
    const j = await r.json()
    const rtt = Date.now() - t0
    // Giờ server tại thời điểm phản hồi ~ j.now + nửa vòng khứ hồi
    clockOffset = Math.round((j.now + rtt / 2) - Date.now())
    try { localStorage.setItem(OFFSET_KEY, String(clockOffset)) } catch { /* ignore */ }
  } catch { /* không có mạng -> giữ offset cũ (hoặc 0) */ }
}

export function nowISO(): string {
  return new Date(Date.now() + clockOffset).toISOString()
}

// ---- lưu / đọc hàng đợi ----
function readQueue(): QItem[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] }
}
function writeQueue(q: QItem[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) } catch { /* ignore */ }
  for (const cb of listeners) cb(q.length)
}
export function pendingCount(): number { return readQueue().length }
export function onPendingChange(cb: (n: number) => void): () => void {
  listeners.add(cb); cb(pendingCount()); return () => { listeners.delete(cb) }
}

// ---- xếp hàng 1 thao tác ----
export function enqueueStatus(item: { jobId: string; ket_qua: string; tapped_at?: string; so_phut?: number }) {
  const q = readQueue()
  q.push({
    qid: (crypto as any)?.randomUUID?.() || String(Date.now()) + Math.random(),
    jobId: item.jobId, ket_qua: item.ket_qua,
    tapped_at: item.tapped_at || nowISO(),
    so_phut: item.so_phut, tries: 0,
  })
  writeQueue(q)
  void flushQueue()
}

// ---- gửi lại (tuần tự theo đúng thứ tự, backoff, gộp lỗi) ----
function removeByQid(qid: string) {
  writeQueue(readQueue().filter(x => x.qid !== qid))
}

export async function flushQueue(): Promise<void> {
  if (flushing) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  flushing = true
  try {
    // Đọc lại hàng đợi ở MỖI vòng: mục được xếp thêm giữa lúc đang flush vẫn được xử lý.
    for (;;) {
      const q = readQueue()
      if (q.length === 0) break
      const it = q[0]
      try {
        const res = await fetch('/api/admin/cong-viec', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: it.jobId, ket_qua: it.ket_qua, tapped_at: it.tapped_at, so_phut: it.so_phut }),
        })
        if (res.ok) { removeByQid(it.qid); continue }         // xong 1 mục
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          // Lỗi vĩnh viễn (VD 403: việc đã bị gán lại) -> bỏ để không kẹt vô hạn
          console.warn('Bỏ thao tác không hợp lệ trong hàng đợi:', it, res.status)
          removeByQid(it.qid); continue
        }
        break                                                // 5xx/429 -> để lần sau
      } catch {
        break                                                // mất mạng -> giữ nguyên, để lần sau
      }
    }
  } finally {
    flushing = false
  }
}

// ---- lắp các mồi tự gửi lại: có sóng / mở lại app / định kỳ ----
export function startQueueSync(): () => void {
  const onOnline = () => { void flushQueue() }
  const onVisible = () => { if (document.visibilityState === 'visible') void flushQueue() }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  const timer = window.setInterval(() => { void flushQueue() }, 20_000)
  void flushQueue()
  return () => {
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    window.clearInterval(timer)
  }
}
