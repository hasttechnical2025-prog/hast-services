'use client'
import { useState } from 'react'
import { X, Boxes } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Job } from './types'

// Modal "Vật tư đã dùng / Trả về kho" (phiếu Hoàn thành) — port từ admin.
// Trả/hủy trả từng dòng vật tư: POST /api/admin/cong-viec/tra-vat-tu {id, da_tra}. Kho tự cộng/trừ (trigger).
export function TraKhoModal({ job, onClose, onChanged, notify }: {
  job: Job
  onClose: () => void
  onChanged: () => void
  notify: (t: 'success' | 'error', m: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const vts = job.soct_chi_tiet_vat_tu || []

  const tra = async (lineId: string, want: boolean) => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/cong-viec/tra-vat-tu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: lineId, da_tra: want }) })
      if (res.ok) { notify('success', want ? 'Đã trả vật tư về kho (cộng tồn).' : 'Đã hủy trả (trừ tồn lại).'); onChanged() }
      else { const j = await res.json().catch(() => ({})); notify('error', j.error || 'Lỗi') }
    } catch { notify('error', 'Lỗi kết nối!') } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-[80]">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Vật tư đã dùng {job.report ? `— Phiếu ${job.report}` : ''}</h2>
            <p className="text-xs text-slate-500">{job.soct_khach_hang?.ten_khach_hang}{job.ma_may ? ` · Máy ${job.ma_may}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
        </div>
        <div className="p-5 space-y-2">
          <p className="text-xs text-slate-500">Khách không lấy vật tư nào thì bấm <b>Trả về kho</b> — tồn kho sẽ cộng lại. Dòng đã trả được giữ để đối soát (có thể Hủy trả nếu nhầm).</p>
          {vts.length === 0 ? <p className="text-sm text-slate-400 text-center py-3">Không có vật tư.</p> : vts.map(v => (
            <div key={v.id} className={`flex items-center gap-3 p-3 rounded-lg border ${v.da_tra ? 'bg-slate-50 border-slate-200' : 'border-slate-200'}`}>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${v.da_tra ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{v.soct_kho_hang?.ten_hang || v.ma_hang}</div>
                <div className="text-xs text-slate-500">SL: {v.so_luong} · <span className="font-mono">{v.ma_hang}</span>{v.da_tra ? ' · đã trả về kho' : ''}</div>
              </div>
              {v.da_tra
                ? <Button variant="outline" disabled={busy} onClick={() => tra(v.id, false)} className="h-8 text-xs shrink-0">Hủy trả</Button>
                : <Button disabled={busy} onClick={() => tra(v.id, true)} className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 gap-1 shrink-0"><Boxes className="w-3.5 h-3.5" /> Trả về kho</Button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
