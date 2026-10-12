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
      <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50">
        <h3 className="text-lg font-semibold text-slate-700 mb-2">Quản lý Tài khoản (KTV & Nhân viên)</h3>
        <p className="text-sm text-slate-500 mb-6">Thêm mới, cập nhật tên đăng nhập và mật khẩu cho Kỹ thuật viên.</p>
        <UserManagementTool users={users} onUpdateSuccess={refetchAll} showNotification={notify} />
      </div>
      {toastNode}
    </AdminGuard>
  )
}
