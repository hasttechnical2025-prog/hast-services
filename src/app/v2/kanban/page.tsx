'use client'
import { useToast } from '@/ui'
import { useSession } from '@/features/_shell/SessionProvider'
import KanbanHdTool from '@/features/kanban/KanbanHdTool'

// Kanban Hóa đơn — menu cha "lá" (tách khỏi Tài chính). Tái dùng nguyên KanbanHdTool.
export default function KanbanPage() {
  const { user } = useSession()
  const { notify, toastNode } = useToast()
  return (
    <>
      <KanbanHdTool role={user?.role || 'staff'} showNotification={notify} v2Layout />
      {toastNode}
    </>
  )
}
