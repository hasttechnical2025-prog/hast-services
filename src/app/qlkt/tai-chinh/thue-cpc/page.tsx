'use client'
import { Suspense } from 'react'
import { useToast } from '@/ui'
import { useSession } from '@/features/_shell/SessionProvider'
import ThueCpcModule from '@/features/tai-chinh/ThueCpcModule'

// Tài chính › Thuê / CPC — tái dùng nguyên ThueCpcModule (tự quản các tab cháu nội bộ).
// Bọc Suspense vì ThueCpcModule dùng useSearchParams (đọc ?tab= từ chuông).
export default function ThueCpcPage() {
  const { subSubVisible } = useSession()
  const { notify, toastNode } = useToast()
  return (
    <>
      <Suspense fallback={null}>
        <ThueCpcModule showNotification={notify} canSub={(g) => subSubVisible('tai_chinh', 'thue_cpc', g)} />
      </Suspense>
      {toastNode}
    </>
  )
}
