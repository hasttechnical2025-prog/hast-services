'use client'
import { useMemo } from 'react'
import { useToast } from '@/ui'
import { useShared } from '@/features/_shell/SharedDataProvider'
import { useSession } from '@/features/_shell/SessionProvider'
import PhieuDeNghiModule from '@/features/kho-hang/PhieuDeNghiModule'

// Kho hàng › Phiếu đề nghị — tái dùng nguyên PhieuDeNghiModule (BM38).
export default function PhieuDeNghiPage() {
  const { customers, inventory, danhMuc } = useShared()
  const { user } = useSession()
  const { notify, toastNode } = useToast()
  const khoMayOptions = useMemo(() => danhMuc.filter(d => d.nhom === 'kho_may' && d.active).sort((a, b) => a.thu_tu - b.thu_tu).map(d => d.gia_tri), [danhMuc])
  return (
    <>
      <PhieuDeNghiModule
        showNotification={notify}
        currentUserRole={user?.role || 'admin'}
        currentUserName={user?.full_name || ''}
        customers={customers}
        inventory={inventory}
        khoMayOptions={khoMayOptions}
        v2Layout
      />
      {toastNode}
    </>
  )
}
