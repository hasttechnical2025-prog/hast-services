'use client'
import { useToast } from '@/ui'
import { useSession } from '@/features/_shell/SessionProvider'
import { AdminGuard } from '@/features/he-thong/AdminGuard'
import { CaiDatHeThongTool } from '@/features/he-thong/CaiDatHeThongTool'

// Hệ thống › Cài đặt hệ thống (chỉ admin). Lưu xong → refetchConfig để config + phân quyền tươi.
export default function CaiDatPage() {
  const { config, refetchConfig } = useSession()
  const { notify, toastNode } = useToast()
  return (
    <AdminGuard>
      <CaiDatHeThongTool cauHinh={config} onUpdateSuccess={refetchConfig} showNotification={notify} />
      {toastNode}
    </AdminGuard>
  )
}
