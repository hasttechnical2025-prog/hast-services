'use client'
import { useRef, useState } from 'react'
import type { Job } from './types'

// Cột "Loại việc" — hover hiện popover vật tư (hoặc Ghi chú cho loại "Khác"). Port từ
// LoaiViecVatTuCell (admin). Popover position:fixed bám rect (tránh bị bảng cắt).
export function LoaiViecCell({ job }: { job: Job }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)
  const vts = (job.soct_chi_tiet_vat_tu || []).filter(v => !v.da_tra)
  const hasVt = vts.length > 0
  const ghi = String(job.ghi_chu || '').trim()
  const hasGhi = !hasVt && job.loai_cong_viec === 'Khác' && ghi.length > 0
  const has = hasVt || hasGhi
  const show = () => {
    if (!has) return
    const r = ref.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 3, left: Math.max(8, Math.min(r.left, window.innerWidth - 272)) })
  }
  return (
    <span ref={ref} onMouseEnter={show} onMouseLeave={() => setPos(null)}
      className={has ? 'cursor-help border-b border-dotted border-slate-300' : ''}>
      {job.loai_cong_viec || '—'}
      {pos && has && (
        <div className="fixed z-[80] w-64 rounded-lg border border-slate-200 bg-white shadow-xl p-2.5 text-left" style={{ top: pos.top, left: pos.left }}>
          {hasVt ? (
            <>
              <div className="text-[10px] font-bold uppercase text-slate-500 mb-1.5">Vật tư ({vts.length})</div>
              <div className="space-y-1">
                {vts.map((v, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="font-mono text-slate-500 shrink-0">{v.ma_hang}</span>
                    <span className="text-slate-700 flex-1 leading-tight">{v.soct_kho_hang?.ten_hang || v.ten_hang_hd || ''}</span>
                    <span className="font-semibold text-blue-700 shrink-0">×{Number(v.so_luong) || 0}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="text-[10px] font-bold uppercase text-slate-500 mb-1.5">Ghi chú</div>
              <div className="text-xs text-slate-700 leading-snug whitespace-pre-wrap break-words">{ghi}</div>
            </>
          )}
        </div>
      )}
    </span>
  )
}
