'use client'
import { useToast } from '@/ui'
import { BaoCaoSuaChuaModule } from '@/features/bao-cao-sua-chua/BaoCaoSuaChuaModule'

// Báo cáo sửa chữa (gửi khách) — Chờ gửi / Đã gửi. Gọi lại API cũ /api/admin/bao-cao-khach.
export default function BaoCaoSuaChuaPage() {
  const { notify, toastNode } = useToast()
  return (
    <>
      <BaoCaoSuaChuaModule notify={notify} />
      {toastNode}
    </>
  )
}
