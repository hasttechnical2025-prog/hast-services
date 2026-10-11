'use client'
import { useToast } from '@/ui'
import { GiaoViecModule } from '@/features/giao-viec/GiaoViecModule'

// Trang mỏng: ghép module Giao việc (CRUD đầy đủ) + toast. Gọi lại API cũ, giữ nghiệp vụ.
export default function GiaoViecPage() {
  const { notify, toastNode } = useToast()
  return (
    <>
      <GiaoViecModule notify={notify} />
      {toastNode}
    </>
  )
}
