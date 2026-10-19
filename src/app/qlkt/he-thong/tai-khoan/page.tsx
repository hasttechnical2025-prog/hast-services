'use client'
import { useToast } from '@/ui'
import { useShared } from '@/features/_shell/SharedDataProvider'
import { AdminGuard } from '@/features/he-thong/AdminGuard'
import { UserManagementTool } from '@/features/he-thong/UserManagementTool'

// Hệ thống › Tài khoản (chỉ admin). Quản lý KTV & nhân viên + role.
export default function TaiKhoanPage() {
  const { users, refetchAll } = useShared()
  const { notify, toastNode } = useToast()
  return (
    <AdminGuard>
      <UserManagementTool users={users} onUpdateSuccess={refetchAll} showNotification={notify} />
      {toastNode}
    </AdminGuard>
  )
}
