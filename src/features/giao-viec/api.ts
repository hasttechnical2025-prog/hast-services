// Lớp gọi API Giao việc — tái dùng ĐÚNG route handler cũ (/api/admin/cong-viec, khach-hang).
import type { Job, JobForm } from './types'

export type JobQuery = { tuNgay?: string; denNgay?: string; date?: string; report?: string; ket_qua?: string }

export function buildJobsUrl(q: JobQuery): string {
  const p = new URLSearchParams()
  if (q.report?.trim()) p.set('report', q.report.trim())
  else if (q.date) p.set('date', q.date)
  else { if (q.tuNgay) p.set('tuNgay', q.tuNgay); if (q.denNgay) p.set('denNgay', q.denNgay) }
  if (q.ket_qua) p.set('ket_qua', q.ket_qua)
  return `/api/admin/cong-viec?${p.toString()}`
}

export async function listJobs(q: JobQuery): Promise<Job[]> {
  const res = await fetch(buildJobsUrl(q))
  if (res.status === 401) throw new Error('UNAUTH')
  const j = await res.json()
  if (!res.ok) throw new Error(j.error || 'Lỗi tải danh sách')
  return j.data || []
}

// Tạo khách mới (khi khai khách mới trong form) → trả id.
export async function createCustomer(form: JobForm): Promise<string> {
  const res = await fetch('/api/admin/khach-hang', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ten_khach_hang: form.ten_khach_hang_moi, dia_chi: form.dia_chi_moi,
      vi_tri_dat_may: form.vi_tri_dat_may_moi, ma_may: form.ma_may, model: form.model_moi,
    }),
  })
  const j = await res.json()
  if (!res.ok) throw new Error(j.error || 'Lỗi tạo khách hàng mới')
  return j.data.id
}

// Lưu phiếu (tạo/sửa). editingId có => PUT edit; không => POST.
export async function saveJob(form: JobForm, finalCustomerId: string, editingId: string | null): Promise<void> {
  const res = await fetch('/api/admin/cong-viec', {
    method: editingId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(editingId
      ? { ...form, id: editingId, id_khach_hang: finalCustomerId, edit: true }
      : { ...form, id_khach_hang: finalCustomerId }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || 'Lỗi lưu phiếu')
}

export async function deleteJob(id: string): Promise<void> {
  const res = await fetch(`/api/admin/cong-viec?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || 'Lỗi xóa phiếu')
}
