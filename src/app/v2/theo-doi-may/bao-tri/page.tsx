'use client'
import { useToast } from '@/ui'
import { useShared } from '@/features/_shell/SharedDataProvider'
import { useSession } from '@/features/_shell/SessionProvider'
import { BaoTriTool } from '@/features/bao-tri/BaoTriTool'

// Theo dõi máy › Bảo trì — port nguyên BaoTriTool (dán counter + 5 tab cháu + in Sổ theo dõi).
// Gọi lại API cũ /api/admin/bao-tri.
export default function BaoTriPage() {
  const { customers } = useShared()
  const { user } = useSession()
  const { notify, toastNode } = useToast()
  return (
    <>
      <BaoTriTool customers={customers} role={user?.role} showNotification={notify} />
      {toastNode}
    </>
  )
}
