'use client'
import { useToast } from '@/ui'
import { useShared } from '@/features/_shell/SharedDataProvider'
import { GiaNiemYetTool } from '@/features/kho-hang/GiaNiemYetTool'

// Kho hàng › Giá niêm yết — port nguyên GiaNiemYetTool. Gọi lại /api/admin/gia-niem-yet.
export default function GiaNiemYetPage() {
  const { dmOptions } = useShared()
  const { notify, toastNode } = useToast()
  return (
    <>
      <GiaNiemYetTool showNotification={notify} hangOptions={dmOptions('hang', ['Konica', 'Fuji', 'Khác'])} />
      {toastNode}
    </>
  )
}
