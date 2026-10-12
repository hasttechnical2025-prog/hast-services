'use client'
import { useToast } from '@/ui'
import { CongNoTool } from '@/features/tai-chinh/CongNoTool'

// Tài chính › Công nợ — port nguyên CongNoTool. Gọi lại /api/admin/cong-no.
export default function CongNoPage() {
  const { notify, toastNode } = useToast()
  return (
    <>
      <CongNoTool showNotification={notify} />
      {toastNode}
    </>
  )
}
