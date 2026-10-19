'use client'
import { useToast } from '@/ui'
import { BaoCaoThangTool } from '@/features/quan-ly/BaoCaoThangTool'

// Quản lý › Báo cáo tháng — port nguyên BaoCaoThangTool. Gọi lại /api/admin/bao-cao, /doanh-so.
export default function BaoCaoThangPage() {
  const { notify, toastNode } = useToast()
  return (
    <>
      <BaoCaoThangTool showNotification={notify} />
      {toastNode}
    </>
  )
}
