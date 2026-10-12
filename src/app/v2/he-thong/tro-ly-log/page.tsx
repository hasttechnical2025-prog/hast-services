'use client'
import { useToast } from '@/ui'
import { AdminGuard } from '@/features/he-thong/AdminGuard'
import { TroLyLogTool } from '@/features/he-thong/TroLyLogTool'

// Hệ thống › Nhật ký AI (chỉ admin).
export default function TroLyLogPage() {
  const { notify, toastNode } = useToast()
  return (
    <AdminGuard>
      <TroLyLogTool showNotification={notify} />
      {toastNode}
    </AdminGuard>
  )
}
