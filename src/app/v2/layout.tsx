import { SessionProvider } from '@/features/_shell/SessionProvider'
import { AppShell } from '@/features/_shell/AppShell'

// Vỏ route /v2 (UI 2027). Nằm TRONG root layout (đã có html/body + guard bảo trì),
// nên chỉ dựng provider + shell. Auth guard thực hiện client-side trong SessionProvider
// (redirect '/' nếu 401) — API vẫn tự kiểm quyền ở server, đây chỉ là lớp điều hướng.
export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  )
}
