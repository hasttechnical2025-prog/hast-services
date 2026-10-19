'use client'
import { useToast } from '@/ui'
import PhiBaoTriModule from '@/features/tai-chinh/PhiBaoTriModule'

// Tài chính › Phí bảo trì — tái dùng nguyên PhiBaoTriModule.
export default function PhiBaoTriPage() {
  const { notify, toastNode } = useToast()
  return (
    <>
      <PhiBaoTriModule showNotification={notify} v2Layout />
      {toastNode}
    </>
  )
}
