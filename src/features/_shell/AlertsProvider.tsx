'use client'
import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'
import { useSession } from './SessionProvider'
import { useShared } from './SharedDataProvider'
import { useRealtimeRefetch } from '@/lib/useRealtime'
import { JOBS_TOPIC, KHO_TOPIC, CSKH_TOPIC, THUECPC_TOPIC, DATHANG_TOPIC, CONGNO_TOPIC } from '@/lib/realtime'
import { chotSoDate, counterStatus } from '@/lib/thue-cpc'

// Gom DỮ LIỆU cho chuông cảnh báo xuyên-module (như /admin). Chỉ fetch + tính; render ở NotificationCenter.
export type AlertsData = {
  mucCanhBao: any[]; mucSapHet: any[]; canhBaoTonList: any[]; unfinishedPastJobs: any[]; futureJobs: any[]
  henCskh: any[]; kanban: { col1: number; col2: number; col1_phieu: number; col2_phieu: number; col2_chua_minv: number }
  hdbtExpiring: any[]; counterDueList: any[]; leaveToday: any[]; hdbtCanhBaoThang: number
  refetch: () => void
}
const Ctx = createContext<AlertsData | null>(null)
export function useAlerts(): AlertsData {
  return useContext(Ctx) || { mucCanhBao: [], mucSapHet: [], canhBaoTonList: [], unfinishedPastJobs: [], futureJobs: [], henCskh: [], kanban: { col1: 0, col2: 0, col1_phieu: 0, col2_phieu: 0, col2_chua_minv: 0 }, hdbtExpiring: [], counterDueList: [], leaveToday: [], hdbtCanhBaoThang: 2, refetch: () => {} }
}

const getJson = (u: string, fb: any) => fetch(u).then(r => r.ok ? r.json() : fb).catch(() => fb)
const normModel = (s: any) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

export function BellAlertsProvider({ children }: { children: React.ReactNode }) {
  const { user, config } = useSession()
  const { customers, inventory, committed } = useShared()
  const hdbtCanhBaoThang = parseInt(config?.hdbt_canh_bao_thang || '2') || 2
  const counterBaoTruocNgay = parseInt(config?.counter_bao_truoc_ngay || '3') || 3
  const counterChuyenKyNgay = parseInt(config?.counter_chuyen_ky_ngay || '20') || 20

  const [mucMap, setMucMap] = useState<any[]>([])
  const [mucSapHet, setMucSapHet] = useState<any[]>([])
  const [canhBaoTon, setCanhBaoTon] = useState<any[]>([])
  const [henCskh, setHenCskh] = useState<any[]>([])
  const [kanban, setKanban] = useState({ col1: 0, col2: 0, col1_phieu: 0, col2_phieu: 0, col2_chua_minv: 0 })
  const [counterDueList, setCounterDueList] = useState<any[]>([])
  const [leaveToday, setLeaveToday] = useState<any[]>([])
  const [unfinishedPastJobs, setUnfinished] = useState<any[]>([])
  const [futureJobs, setFuture] = useState<any[]>([])
  const [choVe, setChoVe] = useState<Record<string, number>>({})

  const refetch = useCallback(() => {
    if (!user) return
    getJson('/api/admin/muc-may-thue', { data: [] }).then(j => setMucMap(j.data || []))
    getJson('/api/admin/muc-sap-het', { data: [] }).then(j => setMucSapHet(j.data || []))
    getJson('/api/admin/canh-bao-ton', { items: [] }).then(j => setCanhBaoTon(j.items || []))
    getJson('/api/admin/cskh/hen', { data: [] }).then(j => setHenCskh(j.data || []))
    getJson('/api/admin/kanban-hd?count=1', {}).then(j => { if (j && typeof j.col1 === 'number') setKanban({ col1: j.col1, col2: j.col2, col1_phieu: j.col1_phieu ?? j.col1, col2_phieu: j.col2_phieu ?? j.col2, col2_chua_minv: j.col2_chua_minv ?? j.col2 }) })
    getJson('/api/admin/nghi-phep?today=1', { data: [] }).then(j => setLeaveToday(j.data || []))
    getJson('/api/admin/kho-hang/dang-giu', { choVe: {} }).then(j => setChoVe(j.choVe || {}))

    // Phiếu ngày trước chưa hoàn + đặt trước ngày tới
    const vnNow = new Date(Date.now() + 7 * 3600 * 1000)
    const today = vnNow.toISOString().slice(0, 10)
    const yesterday = new Date(Date.parse(today + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10)
    const tomorrow = new Date(Date.parse(today + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10)
    const kq = 'Chờ nhận,Đã nhận,Đang làm,Chưa hoàn thành'
    getJson(`/api/admin/cong-viec?denNgay=${yesterday}&ket_qua=${encodeURIComponent(kq)}`, { data: [] }).then(j => setUnfinished(j.data || []))
    getJson(`/api/admin/cong-viec?tuNgay=${tomorrow}&ket_qua=${encodeURIComponent(kq)}`, { data: [] }).then(j => setFuture(j.data || []))

    // Máy thuê/CPC đến hạn lấy counter (kỳ theo cutoff)
    const dTmp = new Date(vnNow.getTime())
    if (dTmp.getUTCDate() <= counterChuyenKyNgay) { dTmp.setUTCDate(1); dTmp.setUTCMonth(dTmp.getUTCMonth() - 1) }
    const thang = dTmp.toISOString().slice(0, 7)
    getJson(`/api/admin/thue-cpc/counter?thang_nam=${thang}`, { data: { rows: [] } }).then(j => {
      const due = (j.data?.rows || [])
        .map((m: any) => {
          const daNhap = m.so_bw != null || m.so_mau != null
          const st = counterStatus(chotSoDate(thang, m.chot_so_ngay, m.chot_so_cuoi_thang, counterChuyenKyNgay), daNhap, today, counterBaoTruocNgay)
          return { ...m, _st: st }
        })
        .filter((m: any) => m._st.status === 'overdue' || m._st.status === 'due_soon')
        .sort((a: any, b: any) => (a._st.status === 'overdue' ? 0 : 1) - (b._st.status === 'overdue' ? 0 : 1) || a._st.days - b._st.days)
      setCounterDueList(due)
    })
  }, [user, counterBaoTruocNgay, counterChuyenKyNgay])

  useEffect(() => { refetch() }, [refetch])
  useRealtimeRefetch([JOBS_TOPIC, KHO_TOPIC, CSKH_TOPIC, THUECPC_TOPIC, DATHANG_TOPIC, CONGNO_TOPIC], 'changed', refetch, !!user, 90000)

  // HĐBT/thuê sắp hết hạn (từ danh sách khách)
  const hdbtExpiring = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const limit = new Date(today); limit.setMonth(limit.getMonth() + hdbtCanhBaoThang)
    return customers
      .filter((c: any) => String(c.loai_hd || '').trim() && c.ngay_het_han_hdbt && new Date(c.ngay_het_han_hdbt) <= limit)
      .sort((a: any, b: any) => new Date(a.ngay_het_han_hdbt).getTime() - new Date(b.ngay_het_han_hdbt).getTime())
  }, [customers, hdbtCanhBaoThang])

  // Mực máy thuê đã HẾT (khả dụng ≤ 0) + còn máy thuê phụ thuộc model
  const mucCanhBao = useMemo(() => {
    if (!mucMap.length) return [] as any[]
    const modelsByMa = new Map<string, Set<string>>()
    for (const r of mucMap) { if (!modelsByMa.has(r.ma_hang)) modelsByMa.set(r.ma_hang, new Set()); modelsByMa.get(r.ma_hang)!.add(r.model_may) }
    const rentalCount = new Map<string, number>()
    for (const c of customers as any[]) {
      if (['Máy thuê', 'Máy CPC'].includes(String(c.loai_hd || '').trim()) && c.model) {
        const k = normModel(c.model); rentalCount.set(k, (rentalCount.get(k) || 0) + 1)
      }
    }
    const out: any[] = []
    for (const [ma, models] of modelsByMa) {
      const inv = inventory.find((i: any) => i.ma_hang === ma)
      const ton = Number(inv?.ton_kho) || 0
      const giu = committed[ma] || 0
      const khaDung = ton - giu
      if (khaDung > 0) continue
      const modelArr = [...models]
      const soMay = modelArr.reduce((s, m) => s + (rentalCount.get(normModel(m)) || 0), 0)
      if (soMay === 0) continue
      // model/hãng lấy từ KHO HÀNG (chuỗi gộp sẵn) cho gọn — giống chuông "Hàng dưới ngưỡng tồn kho";
      // modelArr (từ danh sách máy thuê) chỉ dùng đếm số máy phụ thuộc.
      out.push({ ma_hang: ma, ten_hang: inv?.ten_hang || ma, model: inv?.model || '', hang: inv?.hang || '', ton, giu, kha_dung: khaDung, cho_ve: choVe[ma] || 0, models: modelArr, so_may: soMay })
    }
    return out.sort((a, b) => a.kha_dung - b.kha_dung)
  }, [mucMap, customers, inventory, committed, choVe])

  const canhBaoTonList = useMemo(() => canhBaoTon
    .filter((x: any) => Number(x.nguong_dat) > 0 && Number(x.ton_kho) <= Number(x.nguong_dat))
    .sort((a: any, b: any) => (Number(b.nguong_dat) - Number(b.ton_kho)) - (Number(a.nguong_dat) - Number(a.ton_kho))), [canhBaoTon])

  const value: AlertsData = {
    mucCanhBao, mucSapHet, canhBaoTonList, unfinishedPastJobs, futureJobs, henCskh, kanban,
    hdbtExpiring, counterDueList, leaveToday, hdbtCanhBaoThang, refetch,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
