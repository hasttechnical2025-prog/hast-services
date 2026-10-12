// API Hoàn phiếu (kiểm soát nộp phiếu cứng) — tái dùng route cũ /api/admin/phieu-cung.

// report có giá trị -> tìm số phiếu TOÀN CỤC (server, cả đã nộp).
export async function listPhieuCung(report?: string): Promise<any[]> {
  const url = report?.trim() ? `/api/admin/phieu-cung?report=${encodeURIComponent(report.trim())}` : '/api/admin/phieu-cung'
  const res = await fetch(url)
  if (res.status === 401) throw new Error('UNAUTH')
  const j = await res.json()
  if (!res.ok) throw new Error(j.error || 'Lỗi tải danh sách')
  return j.data || []
}

// Đánh dấu nộp / bỏ nộp 1 phiếu.
export async function togglePhieu(id: string, da_nop_phieu: boolean): Promise<void> {
  const res = await fetch('/api/admin/phieu-cung', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, da_nop_phieu }) })
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Cập nhật không thành công') }
}

// Đánh dấu nộp TOÀN BỘ phiếu chưa nộp (admin).
export async function submitAllPhieu(): Promise<number> {
  const res = await fetch('/api/admin/phieu-cung', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true, da_nop_phieu: true }) })
  const j = await res.json()
  if (!res.ok) throw new Error(j.error || 'Lỗi')
  return j.count ?? 0
}

// Nhắc KTV nộp phiếu qua Telegram.
export async function remindPhieu(): Promise<{ sent: number; skipped: number; message?: string }> {
  const res = await fetch('/api/admin/phieu-cung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
  const j = await res.json()
  if (!res.ok) throw new Error(j.error || 'Lỗi')
  return { sent: j.sent ?? 0, skipped: j.skipped ?? 0, message: j.message }
}
