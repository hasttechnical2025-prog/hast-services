'use client'
import { useToast } from '@/ui'
import { useShared } from '@/features/_shell/SharedDataProvider'
import { GiamDinhTool } from '@/features/giam-dinh/GiamDinhTool'

// Theo dõi máy › Giám định — port nguyên GiamDinhTool. Gọi lại /api/admin/giam-dinh + /api/admin/bao-gia.
export default function GiamDinhPage() {
  const { customers, inventory, dmOptions } = useShared()
  const { notify, toastNode } = useToast()
  return (
    <>
      <GiamDinhTool
        customers={customers}
        inventory={inventory}
        ktvOptions={dmOptions('ktv_giam_dinh')}
        tinhTrangOptions={dmOptions('tinh_trang_may')}
        showNotification={notify}
      />
      {toastNode}
    </>
  )
}
