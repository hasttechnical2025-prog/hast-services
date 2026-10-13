'use client'
import { useRef, useState } from 'react'
import { FileText, ClipboardCheck, Clock } from 'lucide-react'
import { BBBG_TEMPLATE_LIST } from '@/lib/bbbg-templates'

// Nút "Xuất chứng từ" (port BbbgExportButton của admin): dropdown BBBG (theo mẫu) + BBGĐ (BM26)
// + lịch sử xuất (chung-tu-log). Tải .docx từ /api/admin/bbbg & /api/admin/bbgd. Menu position:fixed.
export function ChungTuButton({ jobId, bbbgLuc, onExported, notify }: {
  jobId: string
  bbbgLuc?: string | null
  onExported: () => void
  notify: (t: 'success' | 'error', m: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<any[]>([])
  const [logLoading, setLogLoading] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxH: number } | null>(null)

  const fmtTime = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}` }
  const lastFor = (loai: string, mau: string) => log.find(l => l.loai === loai && l.mau === mau)?.created_at as string | undefined

  const fetchLog = async () => {
    setLogLoading(true)
    try { const r = await fetch(`/api/admin/chung-tu-log?id=${jobId}`); const j = await r.json(); if (r.ok) setLog(j.data || []) } catch { } finally { setLogLoading(false) }
  }

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (open) { setOpen(false); return }
    const r = btnRef.current?.getBoundingClientRect()
    if (r) {
      const left = Math.max(8, r.right - 300)
      const spaceBelow = window.innerHeight - r.bottom - 8
      const spaceAbove = r.top - 8
      if (spaceBelow < 260 && spaceAbove > spaceBelow) setPos({ left, bottom: window.innerHeight - r.top + 4, maxH: spaceAbove })
      else setPos({ left, top: r.bottom + 4, maxH: spaceBelow })
    }
    setOpen(true); fetchLog()
  }

  const download = async (url: string, fallbackName: string, okMsg: string) => {
    setOpen(false); setBusy(true)
    try {
      const res = await fetch(url)
      if (!res.ok) { const j = await res.json().catch(() => ({})); notify('error', j.error || 'Lỗi xuất chứng từ'); return }
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') || ''
      const fname = decodeURIComponent((cd.match(/filename="?([^"]+)"?/) || [])[1] || fallbackName)
      const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = fname; a.click(); URL.revokeObjectURL(u)
      notify('success', okMsg); onExported(); fetchLog()
    } catch { notify('error', 'Lỗi kết nối') } finally { setBusy(false) }
  }
  const doExportBBBG = (mau: string) => download(`/api/admin/bbbg?id=${jobId}&mau=${encodeURIComponent(mau)}`, 'BBBG.docx', 'Đã xuất Biên bản bàn giao.')
  const doExportBBGD = () => download(`/api/admin/bbgd?id=${jobId}`, 'BBGD.docx', 'Đã xuất Biên bản giám định.')
  const chip = (iso?: string) => iso ? <span className="ml-auto pl-2 t3 font-semibold text-emerald-600 whitespace-nowrap">✓ {fmtTime(iso)}</span> : null

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle} disabled={busy}
        title={bbbgLuc ? 'Đã xuất chứng từ — xem lịch sử / xuất lại' : 'Xuất chứng từ (BBBG / BBGĐ)'}
        className={`relative w-7 h-7 rounded border flex items-center justify-center transition ${bbbgLuc ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50' : 'border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-slate-50'}`}>
        <FileText className="w-3.5 h-3.5" />
        {bbbgLuc && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-white" />}
      </button>
      {open && pos && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
          <div className="fixed w-[300px] bg-white border border-slate-200 rounded-lg shadow-lg z-[71] py-1 overflow-y-auto" style={{ left: pos.left, ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom }), maxHeight: pos.maxH }} onClick={e => e.stopPropagation()}>
            <div className="px-3 py-1 t3 font-semibold text-slate-400 uppercase">Biên bản bàn giao</div>
            {BBBG_TEMPLATE_LIST.map(t => (
              <button key={t.key} onClick={() => doExportBBBG(t.key)} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" /> <span className="truncate">{t.label}</span>{chip(lastFor('BBBG', t.key))}
              </button>
            ))}
            <div className="border-t border-slate-100 mt-1 pt-1">
              <div className="px-3 py-1 t3 font-semibold text-slate-400 uppercase">Biên bản giám định</div>
              <button onClick={doExportBBGD} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 flex items-center gap-2">
                <ClipboardCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" /> <span className="truncate">BM26 — Biên bản giám định</span>{chip(lastFor('BBGD', 'bm26'))}
              </button>
            </div>
            {(logLoading || log.length > 0) && (
              <div className="border-t border-slate-100 mt-1 pt-1">
                <div className="px-3 py-1 t3 font-semibold text-slate-400 uppercase flex items-center gap-1"><Clock className="w-3 h-3" /> Lịch sử xuất {log.length > 0 && `(${log.length})`}</div>
                {logLoading ? <div className="px-3 py-1.5 t2 text-slate-400">Đang tải…</div> : (
                  <div className="max-h-40 overflow-y-auto">
                    {log.map(l => (
                      <div key={l.id} className="px-3 py-1.5 t2 text-slate-600 flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${l.loai === 'BBGD' ? 'bg-indigo-400' : 'bg-blue-400'}`} />
                        <span className="font-medium text-slate-700 truncate">{l.mau_label || l.mau}</span>
                        <span className="text-slate-400 ml-auto pl-2 whitespace-nowrap">{l.nguoi_ten || '—'} · {fmtTime(l.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
