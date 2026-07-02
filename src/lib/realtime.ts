// Phát tín hiệu realtime qua Supabase Realtime "Broadcast" (HTTP endpoint).
// Server phát; client lắng nghe topic 'soct_jobs' rồi refetch qua API đã xác thực.
// Không mở quyền đọc bảng cho anon key -> dữ liệu vẫn kín.

export const JOBS_TOPIC = 'soct_jobs'
export const JOBS_EVENT = 'changed'

export async function broadcastJobsChanged(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return

  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [{ topic: JOBS_TOPIC, event: JOBS_EVENT, payload: { at: Date.now() } }],
      }),
    })
  } catch (error) {
    // Realtime lỗi không được làm hỏng mutation chính
    console.error('Broadcast jobs changed failed:', error)
  }
}
