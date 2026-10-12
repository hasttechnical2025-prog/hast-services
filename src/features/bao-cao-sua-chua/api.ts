// API Báo cáo sửa chữa (gửi khách) — tái dùng route cũ /api/admin/bao-cao-khach.

export async function listBaoCao(trang_thai: 'cho_gui' | 'da_gui'): Promise<any[]> {
  const res = await fetch(`/api/admin/bao-cao-khach?trang_thai=${trang_thai}`)
  if (res.status === 401) throw new Error('UNAUTH')
  const j = await res.json()
  if (!res.ok) throw new Error(j.error || 'Lỗi tải danh sách')
  return j.data || []
}

export async function markBaoCao(id: string, action: 'da_gui' | 'cho_gui'): Promise<void> {
  const res = await fetch('/api/admin/bao-cao-khach', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) })
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Lỗi') }
}

export async function deleteBaoCao(id: string): Promise<void> {
  const res = await fetch(`/api/admin/bao-cao-khach?id=${id}`, { method: 'DELETE' })
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Lỗi') }
}
