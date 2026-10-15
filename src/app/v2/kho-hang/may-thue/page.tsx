'use client'
import { useState } from 'react'
import { useToast } from '@/ui'
import { useShared } from '@/features/_shell/SharedDataProvider'
import { useSession } from '@/features/_shell/SessionProvider'
import KhoMayThueTool from '@/features/kho-hang/KhoMayThueTool'
import MucMayThueTool from '@/features/kho-hang/MucMayThueTool'

// Kho hàng › Kho máy thuê — 2 tab: Máy thuê (serial/counter) · Vật tư tiêu hao (gán mực, chỉ admin).
export default function KhoMayThuePage() {
  const { customers, inventory, committed } = useShared()
  const { user } = useSession()
  const { notify, toastNode } = useToast()
  const isAdmin = user?.role === 'admin'
  const [tab, setTab] = useState<'may' | 'vat_tu'>('may')

  const pill = (k: 'may' | 'vat_tu', label: string) => (
    <button onClick={() => setTab(k)} className={`px-4 py-2 font-medium text-sm transition whitespace-nowrap border-b-2 ${tab === k ? 'border-blue-600 text-blue-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
  )

  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-slate-200">
        {pill('may', 'Máy thuê')}
        {isAdmin && pill('vat_tu', 'Vật tư tiêu hao')}
      </div>
      {tab === 'may' && <KhoMayThueTool showNotification={notify} />}
      {tab === 'vat_tu' && isAdmin && (
        <MucMayThueTool customers={customers} inventory={inventory} committed={committed} showNotification={notify} />
      )}
      {toastNode}
    </div>
  )
}
