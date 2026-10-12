import { SessionProvider } from '@/features/_shell/SessionProvider'
import { SharedDataProvider } from '@/features/_shell/SharedDataProvider'
import { BadgeProvider } from '@/features/_shell/BadgeProvider'
import { BellAlertsProvider } from '@/features/_shell/AlertsProvider'
import { AppShell } from '@/features/_shell/AppShell'

// Vỏ route /v2 (UI 2027). Nằm TRONG root layout (đã có html/body + guard bảo trì),
// nên chỉ dựng provider + shell. Auth guard thực hiện client-side trong SessionProvider
// (redirect '/' nếu 401) — API vẫn tự kiểm quyền ở server, đây chỉ là lớp điều hướng.
// SharedDataProvider: dữ liệu dùng chung (khách/kho/users/danh mục) fetch 1 lần + realtime.
export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SharedDataProvider>
        <BadgeProvider>
          <BellAlertsProvider>
            <AppShell>{children}</AppShell>
          </BellAlertsProvider>
        </BadgeProvider>
      </SharedDataProvider>
    </SessionProvider>
  )
}
