'use client'
import { useToast } from '@/ui'
import { useSession } from '@/features/_shell/SessionProvider'
import ThueCpcModule from '@/components/ThueCpcModule'

// Tài chính › Thuê / CPC — tái dùng nguyên ThueCpcModule (tự quản 3 tab cháu nội bộ).
export default function ThueCpcPage() {
  const { subSubVisible } = useSession()
  const { notify, toastNode } = useToast()
  // md:px-2 (0.5rem): bù để lề âm -mx-6 của thanh tab con sticky (ThueCpcModule, khớp p-6 admin)
  // full-bleed đúng mép vùng cuộn p-4 của v2 trên desktop, tránh tràn ngang. Mobile dùng -mx-4 đã khớp.
  return (
    <div className="md:px-2">
      <ThueCpcModule showNotification={notify} canSub={(g) => subSubVisible('tai_chinh', 'thue_cpc', g)} />
      {toastNode}
    </div>
  )
}
