// Phát tín hiệu realtime qua Supabase Realtime "Broadcast" (HTTP endpoint).
// Server phát; client lắng nghe topic 'soct_jobs' rồi refetch qua API đã xác thực.
// Không mở quyền đọc bảng cho anon key -> dữ liệu vẫn kín.

export const JOBS_TOPIC = 'soct_jobs'
export const JOBS_EVENT = 'changed'

// Topic riêng cho đơn nghỉ phép (đăng ký / duyệt) -> KTV & màn duyệt tự cập nhật.
export const LEAVE_TOPIC = 'soct_leave'
export const LEAVE_EVENT = 'changed'

// Kho hàng / tồn kho (thêm-sửa-xóa mặt hàng, hàng về, import) -> danh sách kho tự cập nhật.
export const KHO_TOPIC = 'soct_kho'
// Khách hàng / điểm máy / khách cụm (thêm-sửa-xóa, gán cụm) -> danh sách khách tự cập nhật.
export const KHACH_TOPIC = 'soct_khach'
export const DATA_EVENT = 'changed'

async function broadcast(topic: string, event: string): Promise<void> {
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
        messages: [{ topic, event, payload: { at: Date.now() } }],
      }),
    })
  } catch (error) {
    // Realtime lỗi không được làm hỏng mutation chính
    console.error(`Broadcast ${topic} failed:`, error)
  }
}

export function broadcastJobsChanged(): Promise<void> {
  return broadcast(JOBS_TOPIC, JOBS_EVENT)
}

export function broadcastLeaveChanged(): Promise<void> {
  return broadcast(LEAVE_TOPIC, LEAVE_EVENT)
}

export function broadcastKhoChanged(): Promise<void> {
  return broadcast(KHO_TOPIC, DATA_EVENT)
}

export function broadcastKhachChanged(): Promise<void> {
  return broadcast(KHACH_TOPIC, DATA_EVENT)
}
