'use client'
import { useToast } from '@/ui'
import { HoanPhieuModule } from '@/features/hoan-phieu/HoanPhieuModule'

// Hoàn phiếu — kiểm soát nộp phiếu cứng. Gọi lại API cũ /api/admin/phieu-cung.
export default function HoanPhieuPage() {
  const { notify, toastNode } = useToast()
  return (
    <>
      <HoanPhieuModule notify={notify} />
      {toastNode}
    </>
  )
}
