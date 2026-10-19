'use client'
import { useState, useCallback, useEffect } from 'react'
import { useToast } from '@/ui'
import { useShared } from '@/features/_shell/SharedDataProvider'
import { useSession } from '@/features/_shell/SessionProvider'
import { DatHangTool } from '@/features/kho-hang/DatHangTool'
import { useDatHangCart } from '@/features/kho-hang/useDatHangCart'

// Kho hàng › Đặt hàng — port nguyên DatHangTool. Giỏ hàng dùng chung Thống kê nhập (useDatHangCart).
export default function DatHangPage() {
  const { inventory, committed, dmOptions, refetchInventory } = useShared()
  const { user } = useSession()
  const { notify, toastNode } = useToast()
  const { lines, setLines } = useDatHangCart()
  const [canhBao, setCanhBao] = useState<any[]>([])

  useEffect(() => {
    fetch('/api/admin/canh-bao-ton')
      .then(r => r.ok ? r.json() : { items: [] })
      .then(j => setCanhBao(j.items || []))
      .catch(() => {})
  }, [])

  const onUpdateSuccess = useCallback(() => { refetchInventory() }, [refetchInventory])

  return (
    <>
      <DatHangTool
        inventory={inventory}
        committed={committed}
        nhaCungCapOptions={dmOptions('nha_cung_cap')}
        hangOptions={dmOptions('hang', ['Konica', 'Fuji', 'Khác'])}
        onUpdateSuccess={onUpdateSuccess}
        showNotification={notify}
        currentUserRole={user?.role || ''}
        lines={lines}
        setLines={setLines}
        canhBao={canhBao}
      />
      {toastNode}
    </>
  )
}
