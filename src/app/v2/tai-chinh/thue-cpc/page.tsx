'use client'
import { useToast } from '@/ui'
import { useSession } from '@/features/_shell/SessionProvider'
import ThueCpcModule from '@/components/ThueCpcModule'

// Tài chính › Thuê / CPC — tái dùng nguyên ThueCpcModule (tự quản 3 tab cháu nội bộ).
export default function ThueCpcPage() {
  const { subSubVisible } = useSession()
  const { notify, toastNode } = useToast()
  return (
    <>
      <ThueCpcModule showNotification={notify} canSub={(g) => subSubVisible('tai_chinh', 'thue_cpc', g)} />
      {toastNode}
    </>
  )
}
