// Lớp gọi API Giao việc — tái dùng ĐÚNG route handler cũ (/api/admin/cong-viec, khach-hang).
import type { Job, JobForm } from './types'

export type JobQuery = { tuNgay?: string; denNgay?: string; date?: string; report?: string; ket_qua?: string; q?: string }

export function buildJobsUrl(query: JobQuery): string {
  const p = new URLSearchParams()
  if (query.report?.trim()) p.set('report', query.report.trim())
  else if (query.date) p.set('date', query.date)
  else { if (query.tuNgay) p.set('tuNgay', query.tuNgay); if (query.denNgay) p.set('denNgay', query.denNgay) }
  if (query.ket_qua) p.set('ket_qua', query.ket_qua)
  if (query.q?.trim()) p.set('q', query.q.trim())   // tìm toàn cục (server)
  return `/api/admin/cong-viec?${p.toString()}`
}

export type DedupeInfo = { groups: number; extras: number; list: { report: string; extras: number }[] }
export async function dedupeInfo(): Promise<DedupeInfo> {
  const res = await fetch('/api/admin/cong-viec/dedupe')
  const j = await res.json()
  if (!res.ok) throw new Error(j.error || 'Lỗi quét phiếu trùng')
  return { groups: j.groups, extras: j.extras, list: j.list || [] }
}
export async function dedupeRun(): Promise<{ removed: number; groups: number }> {
  const res = await fetch('/api/admin/cong-viec/dedupe', { method: 'POST' })
  const j = await res.json()
  if (!res.ok) throw new Error(j.error || 'Lỗi dọn phiếu trùng')
  return { removed: j.removed, groups: j.groups }
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

// Bóc tách phiếu PDF (server) -> dữ liệu tiền-điền form.
export async function importPdf(file: File): Promise<any> {
  const fd = new FormData(); fd.append('file', file)
  const res = await fetch('/api/admin/phieu-pdf', { method: 'POST', body: fd })
  const j = await res.json()
  if (!res.ok) throw new Error(j.error || 'Không đọc được phiếu')
  return j.data
}

// Trạng thái máy (bảo trì tháng + giám định chờ thay) theo mã máy.
export async function fetchMayStatus(ma_may: string): Promise<any | null> {
  try {
    const res = await fetch(`/api/admin/may-status?ma_may=${encodeURIComponent(ma_may)}`)
    if (!res.ok) return null
    const j = await res.json()
    return j.data
  } catch { return null }
}

// Thêm mã hàng lạ vào kho (admin) — tồn khởi tạo 0.
export async function addKhoItem(ma_hang: string, ten_hang: string): Promise<void> {
  const res = await fetch('/api/admin/kho-hang', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ma_hang, ten_hang, ton_kho: 0 }) })
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `Lỗi thêm mã ${ma_hang}`) }
}

// Đóng (đã thay) 1 biên bản giám định khi lưu việc — dùng số phiếu của việc.
export async function closeGiamDinh(id: string, ngay_thay: string, so_report: string): Promise<void> {
  await fetch('/api/admin/giam-dinh', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, da_thay: true, ngay_thay, so_report }) })
}

export async function deleteJob(id: string): Promise<void> {
  const res = await fetch(`/api/admin/cong-viec?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || 'Lỗi xóa phiếu')
}
