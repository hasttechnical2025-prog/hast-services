'use client'
import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from './SessionProvider'
import { useRealtimeRefetch } from '@/lib/useRealtime'
import { JOBS_TOPIC, CSKH_TOPIC, THUECPC_TOPIC } from '@/lib/realtime'
import { useAlerts } from './AlertsProvider'

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

export function BadgeProvider({ children }: { children: React.ReactNode }) {
  const { user, subVisible, subSubVisible } = useSession()
  const alerts = useAlerts()
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

    // ── Tài chính › Thuê/CPC: badge này KHÔNG fetch ở đây — đọc lại từ chuông (useAlerts) ở effect
    //    riêng bên dưới, tránh gọi counter (~7.4kB) + muc-sap-het trùng lần 2. Giảm egress.

    // ── Theo dõi máy ──
    if (subVisible('theo_doi_may', 'bao_tri')) {
      fetch('/api/admin/bao-tri/count').then(r => r.ok ? r.json() : { count: 0 }).then(j => setKey('theo_doi_may.bao_tri', j.count ?? 0)).catch(() => {})
    } else setKey('theo_doi_may.bao_tri', 0)

    if (subVisible('theo_doi_may', 'giam_dinh')) {
      fetch('/api/admin/giam-dinh?count=1').then(r => r.ok ? r.json() : { count: 0 }).then(j => setKey('theo_doi_may.giam_dinh', j.count ?? 0)).catch(() => {})
    } else setKey('theo_doi_may.giam_dinh', 0)

    // ── Kanban Hóa đơn: số PHIẾU cột 2 (Đang xử lý HĐ) chưa xuất M-invoice ──
    if (subVisible('tai_chinh', 'kanban')) {
      fetch('/api/admin/kanban-hd?count=1').then(r => r.ok ? r.json() : { col2_chua_minv: 0 }).then(j => setKey('tai_chinh.kanban', j.col2_chua_minv ?? 0)).catch(() => {})
    } else setKey('tai_chinh.kanban', 0)
  }, [user, subVisible])

  useEffect(() => { refetch() }, [refetch])
  useEffect(() => { refetch() }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  useRealtimeRefetch([JOBS_TOPIC, CSKH_TOPIC, THUECPC_TOPIC], 'changed', refetch, !!user, 180000)

  // Badge Thuê/CPC = counter tới hạn + sắp hết mực. ĐỌC LẠI từ chuông (AlertsProvider) thay vì fetch
  // riêng — chuông đã tải counter/muc-sap-het rồi, dùng chung 1 nguồn (hết trùng, hết nhân theo đổi tab).
  useEffect(() => {
    if (!user || !subVisible('tai_chinh', 'thue_cpc')) { setKey('tai_chinh.thue_cpc', 0); return }
    const due = subSubVisible('tai_chinh', 'thue_cpc', 'counter') ? alerts.counterDueList.length : 0
    let nhom = 'muc'; try { nhom = localStorage.getItem('soct_cbvt_nhom2') || 'muc' } catch {}
    const muc = subSubVisible('tai_chinh', 'thue_cpc', 'canh_bao_muc')
      ? alerts.mucSapHet.filter((r: any) => (r.trang_thai ? r.trang_thai === 'canh_bao' : true) && (nhom === 'all' || (r.nhom || 'muc') === nhom)).length
      : 0
    setKey('tai_chinh.thue_cpc', due + muc)
  }, [user, subVisible, subSubVisible, alerts.counterDueList, alerts.mucSapHet]) // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={{ counts, refetch }}>{children}</Ctx.Provider>
}
