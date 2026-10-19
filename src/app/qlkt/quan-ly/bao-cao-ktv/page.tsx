'use client'
import { useToast } from '@/ui'
import { useShared } from '@/features/_shell/SharedDataProvider'
import { BaoCaoKtvTool } from '@/features/quan-ly/BaoCaoKtvTool'

// Quản lý › Báo cáo KTV — port nguyên BaoCaoKtvTool. technicians = users (/api/admin/users).
export default function BaoCaoKtvPage() {
  const { users } = useShared()
  const { notify, toastNode } = useToast()
  return (
    <>
      <BaoCaoKtvTool technicians={users} showNotification={notify} />
      {toastNode}
    </>
  )
}
