'use client'
import { useState } from 'react'
import { useToast } from '@/ui'
import { AdminGuard } from '@/features/he-thong/AdminGuard'
import { TroLyLogTool } from '@/features/he-thong/TroLyLogTool'
import { AliasTool } from '@/features/he-thong/DanhMucTool'

// Hệ thống › Trợ lý AI (chỉ admin) — gom 2 tab cháu: Nhật ký (log) + Biệt danh (cấu hình).
const TABS = [['nhat_ky', 'Nhật ký'], ['biet_danh', 'Biệt danh']] as const

export default function TroLyAIPage() {
  const { notify, toastNode } = useToast()
  const [tab, setTab] = useState<'nhat_ky' | 'biet_danh'>('nhat_ky')
  return (
    <AdminGuard>
      <div className="space-y-4">
        <div className="sticky top-0 z-20 bg-slate-200 -mx-2 px-2 flex gap-1 border-b border-slate-200">
          {TABS.map(([k, label]) => {
            const on = tab === k
            return (
              <button key={k} onClick={() => setTab(k)}
                className={`px-4 py-2 font-medium text-sm transition whitespace-nowrap border-b-2 ${on ? 'border-blue-600 text-blue-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                {label}
              </button>
            )
          })}
        </div>
        {tab === 'nhat_ky' && <TroLyLogTool showNotification={notify} />}
        {tab === 'biet_danh' && <AliasTool showNotification={notify} />}
      </div>
      {toastNode}
    </AdminGuard>
  )
}
