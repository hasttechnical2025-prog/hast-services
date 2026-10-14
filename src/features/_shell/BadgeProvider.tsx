'use client'
import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from './SessionProvider'
import { useRealtimeRefetch } from '@/lib/useRealtime'
import { JOBS_TOPIC, CSKH_TOPIC, THUECPC_TOPIC } from '@/lib/realtime'
import { chotSoDate, counterStatus } from '@/lib/thue-cpc'

// Badge đếm trên sidebar v2 — gom TỔNG các badge NỘI BỘ của tab con/cháu ra sidebar để gây chú ý.
// Mỗi mục con có badge ↔ 1 key "cha.con":
//  - cong_viec.hoan_phieu    = phiếu cứng chưa nộp            (/api/admin/phieu-cung?count=1)
//  - cong_viec.bao_cao_khach = báo cáo chờ gửi khách          (/api/admin/bao-cao-khach?count=1)
//  - cong_viec.cham_soc_kh   = khách cần chăm sóc (can_lam)   (/api/admin/cskh/can-cham-soc)
//  - tai_chinh.thue_cpc      = máy cần lấy counter + sắp hết mực (2 badge cháu counter/canh_bao_muc)
// Tôn trọng quyền (kể cả cấp-3). Tự tươi: realtime JOBS/CSKH/THUECPC + poll 90s + đổi route.
type BadgeCtx = { counts: Record<string, number>; refetch: () => void }
const Ctx = createContext<BadgeCtx | null>(null)

export function useBadges(): BadgeCtx {
  return useContext(Ctx) || { counts: {}, refetch: () => {} }
}

const vnToday = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
// Kỳ counter mặc định theo cutoff (ngày chuyển kỳ) — giống monthNow() trong ThueCpcModule.
const monthNow = (cutoff: number) => {
  const d = new Date()
  if (d.getDate() <= cutoff) { d.setDate(1); d.setMonth(d.getMonth() - 1) }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function BadgeProvider({ children }: { children: React.ReactNode }) {
  const { user, subVisible, subSubVisible, config } = useSession()
  const pathname = usePathname()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const setKey = (k: string, n: number) => setCounts(c => (c[k] === n ? c : { ...c, [k]: n }))

  const refetch = useCallback(() => {
    if (!user) return
    // ── Sổ công tác ──
    if (subVisible('cong_viec', 'hoan_phieu')) {
      fetch('/api/admin/phieu-cung?count=1').then(r => r.ok ? r.json() : { count: 0 }).then(j => setKey('cong_viec.hoan_phieu', j.count ?? 0)).catch(() => {})
    } else setKey('cong_viec.hoan_phieu', 0)

    if (subVisible('cong_viec', 'bao_cao_khach')) {
      fetch('/api/admin/bao-cao-khach?count=1').then(r => r.ok ? r.json() : { count: 0 }).then(j => setKey('cong_viec.bao_cao_khach', j.count ?? 0)).catch(() => {})
    } else setKey('cong_viec.bao_cao_khach', 0)

    if (subVisible('cong_viec', 'cham_soc_kh')) {
      fetch('/api/admin/cskh/can-cham-soc').then(r => r.ok ? r.json() : { can_lam: 0 }).then(j => setKey('cong_viec.cham_soc_kh', j.can_lam ?? 0)).catch(() => {})
    } else setKey('cong_viec.cham_soc_kh', 0)

    // ── Tài chính › Thuê/CPC: gom 2 badge cháu (counter tới hạn + sắp hết mực) ──
    if (subVisible('tai_chinh', 'thue_cpc')) {
      const seeCounter = subSubVisible('tai_chinh', 'thue_cpc', 'counter')
      const seeMuc = subSubVisible('tai_chinh', 'thue_cpc', 'canh_bao_muc')
      let due = 0, muc = 0, done = 0
      const finish = () => { if (++done === 2) setKey('tai_chinh.thue_cpc', due + muc) }
      // counter tới hạn (kỳ mặc định theo cutoff)
      if (seeCounter) {
        const cutoff = parseInt(config?.counter_chuyen_ky_ngay || '20') || 20
        const today = vnToday()
        fetch(`/api/admin/thue-cpc/counter?thang_nam=${monthNow(cutoff)}`).then(r => r.ok ? r.json() : { data: { rows: [] } }).then(j => {
          let n = 0
          for (const r of j.data?.rows || []) {
            const daNhap = r.so_bw != null || r.so_mau != null
            const s = counterStatus(chotSoDate(monthNow(cutoff), r.chot_so_ngay, r.chot_so_cuoi_thang, cutoff), daNhap, today).status
            if (s === 'overdue' || s === 'due_soon') n++
          }
          due = n
        }).catch(() => {}).finally(finish)
      } else finish()
      // sắp hết mực (lọc nhóm admin đã lưu, mặc định 'muc')
      if (seeMuc) {
        let nhom = 'muc'; try { nhom = localStorage.getItem('soct_cbvt_nhom2') || 'muc' } catch {}
        fetch('/api/admin/muc-sap-het').then(r => r.ok ? r.json() : { data: [] }).then(j => {
          muc = (j.data || []).filter((r: any) => (r.trang_thai ? r.trang_thai === 'canh_bao' : true) && (nhom === 'all' || (r.nhom || 'muc') === nhom)).length
        }).catch(() => {}).finally(finish)
      } else finish()
    } else setKey('tai_chinh.thue_cpc', 0)

    // ── Kanban Hóa đơn: số PHIẾU cột 2 (Đang xử lý HĐ) chưa xuất M-invoice ──
    if (subVisible('tai_chinh', 'kanban')) {
      fetch('/api/admin/kanban-hd?count=1').then(r => r.ok ? r.json() : { col2_chua_minv: 0 }).then(j => setKey('tai_chinh.kanban', j.col2_chua_minv ?? 0)).catch(() => {})
    } else setKey('tai_chinh.kanban', 0)
  }, [user, subVisible, subSubVisible, config])

  useEffect(() => { refetch() }, [refetch])
  useEffect(() => { refetch() }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  useRealtimeRefetch([JOBS_TOPIC, CSKH_TOPIC, THUECPC_TOPIC], 'changed', refetch, !!user, 90000)

  return <Ctx.Provider value={{ counts, refetch }}>{children}</Ctx.Provider>
}
