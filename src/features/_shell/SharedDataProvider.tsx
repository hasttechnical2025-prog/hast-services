'use client'
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { KHO_TOPIC, KHACH_TOPIC, DATA_EVENT } from '@/lib/realtime'
import { useRealtimeRefetch } from '@/lib/useRealtime'
import { useSession } from './SessionProvider'

// Dữ liệu dùng NHIỀU nơi — fetch 1 lần ở vỏ /v2, cung cấp qua context + refetch.
// Bóc khỏi admin/page.tsx (mỗi màn tự fetch lại). Tự đồng bộ realtime: KHO/KHACH đổi → refetch.
// Best-effort theo role: endpoint nào 401 (role không có quyền) thì bỏ qua, giữ mảng rỗng.

export type DanhMucItem = { id: string; nhom: string; gia_tri: string; thu_tu: number; active: boolean }

type Ctx = {
  customers: any[]
  inventory: any[]
  users: any[]
  danhMuc: DanhMucItem[]
  loading: boolean
  refetchAll: () => void
  refetchInventory: () => void
  refetchCustomers: () => void
  /** Giá trị danh mục đang dùng theo nhóm (fallback nếu bảng trống). */
  dmOptions: (nhom: string, fallback?: string[]) => string[]
}

const SharedCtx = createContext<Ctx | null>(null)

export function useShared(): Ctx {
  const ctx = useContext(SharedCtx)
  if (!ctx) throw new Error('useShared phải nằm trong <SharedDataProvider>')
  return ctx
}

async function getJson(url: string): Promise<any[]> {
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const j = await res.json()
    return j.data || []
  } catch { return [] }
}

export function SharedDataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useSession()
  const [customers, setCustomers] = useState<any[]>([])
  const [inventory, setInventory] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [danhMuc, setDanhMuc] = useState<DanhMucItem[]>([])
  const [loading, setLoading] = useState(true)

  const refetchInventory = useCallback(() => { getJson('/api/admin/kho-hang').then(setInventory) }, [])
  const refetchCustomers = useCallback(() => { getJson('/api/admin/khach-hang').then(setCustomers) }, [])

  const refetchAll = useCallback(() => {
    Promise.all([
      getJson('/api/admin/khach-hang'),
      getJson('/api/admin/kho-hang'),
      getJson('/api/admin/users'),
      getJson('/api/admin/danh-muc'),
    ]).then(([c, inv, u, dm]) => {
      setCustomers(c); setInventory(inv); setUsers(u); setDanhMuc(dm as DanhMucItem[])
    }).finally(() => setLoading(false))
  }, [])

  // Chỉ fetch khi đã biết user (sau khi SessionProvider xác thực xong) — tránh gọi lúc chưa login.
  useEffect(() => { if (user) refetchAll() }, [user, refetchAll])

  // Tự đồng bộ: kho đổi (nhập/hàng về/sửa mã) → refetch tồn; khách đổi → refetch khách. Poll 90s nền.
  useRealtimeRefetch(KHO_TOPIC, DATA_EVENT, refetchInventory, !!user, 90000)
  useRealtimeRefetch(KHACH_TOPIC, DATA_EVENT, refetchCustomers, !!user, 0)

  const dmOptions = useCallback((nhom: string, fallback: string[] = []) => {
    const items = danhMuc.filter(d => d.nhom === nhom && d.active).map(d => d.gia_tri)
    return items.length > 0 ? items : fallback
  }, [danhMuc])

  return (
    <SharedCtx.Provider value={{ customers, inventory, users, danhMuc, loading, refetchAll, refetchInventory, refetchCustomers, dmOptions }}>
      {children}
    </SharedCtx.Provider>
  )
}
