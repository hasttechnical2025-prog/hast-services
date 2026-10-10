'use client'
import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"

// Hộp xác nhận trong app (thay window.confirm). z cao để nổi trên mọi modal.
export function ConfirmDialog({ message, confirmLabel = 'Xác nhận', danger = true, onYes, onNo }: {
  message: string, confirmLabel?: string, danger?: boolean, onYes: () => void, onNo: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[90] flex items-center justify-center p-4" onClick={onNo}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onNo} className="h-9 text-xs">Hủy</Button>
          <Button onClick={onYes} className={`h-9 text-xs ${danger ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}

// Hook: const { confirm, confirmNode } = useConfirm()
//   if (!(await confirm('message', { confirmLabel, danger }))) return
//   ...và render {confirmNode} trong JSX của component.
export function useConfirm() {
  const [st, setSt] = useState<{ message: string; confirmLabel?: string; danger?: boolean; resolve: (v: boolean) => void } | null>(null)
  const confirm = useCallback((message: string, opts?: { confirmLabel?: string; danger?: boolean }) =>
    new Promise<boolean>(resolve => setSt({ message, confirmLabel: opts?.confirmLabel, danger: opts?.danger, resolve })), [])
  const confirmNode = st ? (
    <ConfirmDialog message={st.message} confirmLabel={st.confirmLabel} danger={st.danger}
      onYes={() => { st.resolve(true); setSt(null) }} onNo={() => { st.resolve(false); setSt(null) }} />
  ) : null
  return { confirm, confirmNode }
}
