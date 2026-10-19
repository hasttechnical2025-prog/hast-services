'use client'
import { useToast } from '@/ui'
import { useSession } from '@/features/_shell/SessionProvider'
import CskhTool from '@/features/so-cong-tac/CskhTool'

// Chăm sóc KH (CSKH) — tái dùng NGUYÊN component cũ CskhTool (4 view: Cần chăm sóc · Danh sách ·
// Pipeline · KPI), gọi lại API /api/admin/cskh/*. Giữ y hệt giao diện + nghiệp vụ + cỡ chữ.
export default function ChamSocKhPage() {
  const { user } = useSession()
  const { notify, toastNode } = useToast()
  return (
    <>
      <CskhTool role={user?.role || 'admin'} showNotification={notify} />
      {toastNode}
    </>
  )
}
