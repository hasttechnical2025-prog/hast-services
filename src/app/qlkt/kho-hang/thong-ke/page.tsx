'use client'
import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/ui'
import { useShared } from '@/features/_shell/SharedDataProvider'
import { NhapHangThangTool } from '@/features/kho-hang/NhapHangThangTool'
import { useDatHangCart } from '@/features/kho-hang/useDatHangCart'
import { V2_BASE } from '@/lib/v2-nav'

// Kho hàng › Thống kê nhập — port nguyên NhapHangThangTool (panel Cảnh báo tồn + thống kê theo tháng).
export default function ThongKeNhapPage() {
  const { dmOptions } = useShared()
  const { notify, toastNode } = useToast()
  const router = useRouter()
  const { lines, addToCart } = useDatHangCart()
  const [canhBao, setCanhBao] = useState<any[]>([])

  const refetchCanhBao = useCallback(() => {
    fetch('/api/admin/canh-bao-ton')
      .then(r => r.ok ? r.json() : { items: [] })
      .then(j => setCanhBao(j.items || []))
      .catch(() => {})
  }, [])
  useEffect(() => { refetchCanhBao() }, [refetchCanhBao])

  const onAddToCart = useCallback((items: { ma_hang: string, sl_dat: string }[], redirect?: boolean) => {
    addToCart(items)
    if (redirect) router.push(`${V2_BASE}/kho-hang/dat-hang`)
  }, [addToCart, router])

  return (
    <>
      <NhapHangThangTool
        showNotification={notify}
        canhBao={canhBao}
        refetchCanhBao={refetchCanhBao}
        hangOptions={dmOptions('hang', ['Konica', 'Fuji', 'Khác'])}
        cartCount={lines.length}
        onAddToCart={onAddToCart}
        onGoToCart={() => router.push(`${V2_BASE}/kho-hang/dat-hang`)}
      />
      {toastNode}
    </>
  )
}
