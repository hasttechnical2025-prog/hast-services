'use client'
import { useToast } from '@/ui'
import PhiBaoTriModule from '@/components/PhiBaoTriModule'

// Tài chính › Phí bảo trì — tái dùng nguyên PhiBaoTriModule.
export default function PhiBaoTriPage() {
  const { notify, toastNode } = useToast()
  return (
    <>
      <PhiBaoTriModule showNotification={notify} />
      {toastNode}
    </>
  )
}
