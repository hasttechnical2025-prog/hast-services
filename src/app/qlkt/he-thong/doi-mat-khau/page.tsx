'use client'
import { useToast } from '@/ui'
import { DoiMatKhauTool } from '@/features/he-thong/DoiMatKhauTool'

// Hệ thống › Đổi mật khẩu — MỌI role (không chặn admin). Mặc định điểm đến cho role không-admin.
export default function DoiMatKhauPage() {
  const { notify, toastNode } = useToast()
  return (
    <>
      <DoiMatKhauTool showNotification={notify} />
      {toastNode}
    </>
  )
}
