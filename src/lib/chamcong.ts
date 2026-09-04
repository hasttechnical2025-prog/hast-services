// Cầu nối SANG app "Chấm công HSTC" (Supabase project B RIÊNG). Chỉ dùng ở SERVER (API routes).
// Đẩy MỘT CHIỀU: nghỉ phép đã duyệt bên này -> bảng chamcong_nghi_phep_dong_bo bên B, để app
// chấm công tự mở ô + điền giải trình "Nghỉ phép/ốm". Xem migration_nghi_phep_dong_bo.sql (repo B).
//
// BEST-EFFORT: mọi lỗi được nuốt + trả về { ok:false, err } -> KHÔNG được làm hỏng việc duyệt đơn.
// Env: CHAMCONG_SUPABASE_URL + CHAMCONG_SERVICE_ROLE_KEY (service key project B) — chưa có thì no-op.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expandNgayNghi, type Buoi, type LoaiNghi } from './nghi-phep'

const CC_URL = process.env.CHAMCONG_SUPABASE_URL || ''
const CC_KEY = process.env.CHAMCONG_SERVICE_ROLE_KEY || ''
const TABLE = 'chamcong_nghi_phep_dong_bo'

export function chamcongConfigured(): boolean { return !!CC_URL && !!CC_KEY }

let _client: SupabaseClient | null = null
function chamcongClient(): SupabaseClient | null {
  if (!chamcongConfigured()) return null
  if (!_client) _client = createClient(CC_URL, CC_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  return _client
}

export type DonNghi = {
  id: string
  loai: LoaiNghi
  tu_ngay: string
  den_ngay: string
  buoi: Buoi
  full_name: string
}

// Đẩy 1 đơn đã duyệt: XÓA sạch dòng cũ theo nguon_id rồi CHÈN lại (đúng cả khi khoảng ngày đổi).
export async function syncNghiPhepDuyet(don: DonNghi): Promise<{ ok: boolean; n: number; err?: string }> {
  const cc = chamcongClient()
  if (!cc) return { ok: false, n: 0, err: 'Chưa cấu hình CHAMCONG_SUPABASE_URL/KEY' }
  const name = (don.full_name || '').trim()
  if (!name) return { ok: false, n: 0, err: 'Đơn thiếu họ tên' }
  const rows = expandNgayNghi(don.tu_ngay, don.den_ngay, don.buoi).map(x => ({
    employee_name: name, ngay: x.ngay, buoi: x.buoi, loai: don.loai, nguon_id: don.id,
  }))
  try {
    await cc.from(TABLE).delete().eq('nguon_id', don.id)
    if (rows.length) {
      const { error } = await cc.from(TABLE).insert(rows)
      if (error) throw error
    }
    return { ok: true, n: rows.length }
  } catch (e: any) {
    return { ok: false, n: 0, err: e?.message || 'Lỗi ghi Supabase chấm công' }
  }
}

// Gỡ đồng bộ 1 đơn (khi hủy duyệt / từ chối / xóa đơn).
export async function unsyncNghiPhep(nguon_id: string): Promise<{ ok: boolean; err?: string }> {
  const cc = chamcongClient()
  if (!cc) return { ok: false, err: 'Chưa cấu hình CHAMCONG_SUPABASE_URL/KEY' }
  try {
    const { error } = await cc.from(TABLE).delete().eq('nguon_id', nguon_id)
    if (error) throw error
    return { ok: true }
  } catch (e: any) { return { ok: false, err: e?.message } }
}

// ĐỒNG BỘ LẠI (self-heal): nhận TOÀN BỘ đơn đã duyệt bên A -> ghi đè từng đơn + xóa "mồ côi"
// (dòng bên B có nguon_id không còn là đơn đã duyệt). Bù cho lần đẩy lẻ bị lỡ.
export async function reconcileNghiPhep(dons: DonNghi[]): Promise<{ ok: boolean; upserted: number; deleted: number; loi: number; err?: string }> {
  const cc = chamcongClient()
  if (!cc) return { ok: false, upserted: 0, deleted: 0, loi: 0, err: 'Chưa cấu hình CHAMCONG_SUPABASE_URL/KEY' }
  try {
    const validIds = new Set(dons.map(d => d.id))
    const { data: existing, error: e1 } = await cc.from(TABLE).select('nguon_id')
    if (e1) throw e1
    const orphanIds = [...new Set((existing || []).map((r: any) => r.nguon_id))].filter(id => !validIds.has(id))
    let deleted = 0
    if (orphanIds.length) {
      const { error: e2 } = await cc.from(TABLE).delete().in('nguon_id', orphanIds)
      if (e2) throw e2
      deleted = orphanIds.length
    }
    let upserted = 0, loi = 0
    for (const d of dons) {
      const r = await syncNghiPhepDuyet(d)
      if (r.ok) upserted += r.n; else loi++
    }
    return { ok: true, upserted, deleted, loi }
  } catch (e: any) {
    return { ok: false, upserted: 0, deleted: 0, loi: 0, err: e?.message }
  }
}
