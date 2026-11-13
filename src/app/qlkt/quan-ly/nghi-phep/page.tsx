'use client'
import { useToast } from '@/ui'
import NghiPhepDuyet from '@/features/quan-ly/NghiPhepDuyet'
import { useSession } from '@/features/_shell/SessionProvider'

// Quản lý › Nghỉ phép — tái dùng nguyên NghiPhepDuyet (duyệt đơn nghỉ phép/ốm).
export default function NghiPhepPage() {
  const { notify, toastNode } = useToast()
  const { user } = useSession()
  return (
    <>
      <NghiPhepDuyet notify={notify} isAdmin={user?.role === 'admin'} />
      {toastNode}
    </>
  )
}
