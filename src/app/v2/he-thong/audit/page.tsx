'use client'
import { useToast } from '@/ui'
import { AdminGuard } from '@/features/he-thong/AdminGuard'
import { AuditLogsTool } from '@/features/he-thong/AuditLogsTool'

// Hệ thống › Audit Logs (chỉ admin).
export default function AuditPage() {
  const { notify, toastNode } = useToast()
  return (
    <AdminGuard>
      <AuditLogsTool showNotification={notify} />
      {toastNode}
    </AdminGuard>
  )
}
