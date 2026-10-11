'use client'
import { useCallback, useState } from 'react'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Thông báo nổi — thay showNotification của admin. notify ổn định (useCallback []).
// Dùng: const { notify, toastNode } = useToast(); render {toastNode}.
export function useToast() {
  const [t, setT] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const notify = useCallback((type: 'success' | 'error', msg: string) => {
    setT({ type, msg })
    setTimeout(() => setT(null), 5000)
  }, [])
  const toastNode = t ? (
    <div className="fixed bottom-4 right-4 z-[100] max-w-sm">
      <div className={cn('flex items-start gap-2 px-3.5 py-2.5 rounded-lg border shadow-lg text-sm',
        t.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800')}>
        {t.type === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
        <span className="flex-1">{t.msg}</span>
        <button onClick={() => setT(null)} className="text-current/60 hover:text-current"><X className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  ) : null
  return { notify, toastNode }
}
