"use client"

import { useState, useEffect, useCallback } from "react"
import { Check, X, CalendarClock, RefreshCw } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { LEAVE_TOPIC, LEAVE_EVENT } from "@/lib/realtime"
import { LOAI_LABEL, moTaKhoang, type LoaiNghi, type Buoi } from "@/lib/nghi-phep"

type Don = {
  id: string
  loai: LoaiNghi
  tu_ngay: string
  den_ngay: string
  buoi: Buoi
  so_ngay: number
  ly_do: string | null
  trang_thai: string
  ghi_chu_duyet: string | null
  soct_users?: { full_name?: string } | null
}

const loaiBadge = (l: LoaiNghi) =>
  l === 'om' ? 'bg-rose-50 text-rose-700 border-rose-100'
    : l === 'viec_rieng' ? 'bg-amber-50 text-amber-700 border-amber-100'
      : 'bg-emerald-50 text-emerald-700 border-emerald-100'

export default function NghiPhepDuyet({ notify, onPending }: {
  notify?: (type: 'success' | 'error', msg: string) => void
  onPending?: (n: number) => void
}) {
  const [pending, setPending] = useState<Don[]>([])
  const [upcoming, setUpcoming] = useState<Don[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [reject, setReject] = useState<Don | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/nghi-phep')
      const j = await res.json()
      if (res.ok) {
        setPending(j.pending || [])
        setUpcoming(j.upcoming || [])
        onPending?.((j.pending || []).length)
      }
    } catch { /* giữ dữ liệu cũ */ } finally { setLoading(false) }
  }, [onPending])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    const ch = supabase.channel(LEAVE_TOPIC).on('broadcast', { event: LEAVE_EVENT }, () => fetchData()).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchData])

  const decide = async (id: string, action: 'duyet' | 'tu_choi', ghi_chu?: string) => {
    setBusy(id)
    try {
      const res = await fetch('/api/admin/nghi-phep', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, ghi_chu }),
      })
      const j = await res.json()
      if (res.ok) { notify?.('success', action === 'duyet' ? 'Đã duyệt đơn nghỉ.' : 'Đã từ chối đơn nghỉ.'); fetchData() }
      else notify?.('error', j.error || 'Không xử lý được')
    } catch { notify?.('error', 'Lỗi kết nối!') } finally { setBusy(null) }
  }

  const DonCard = ({ d, actionable }: { d: Don; actionable: boolean }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold text-slate-800 text-sm">{d.soct_users?.full_name || '—'}</div>
        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border shrink-0 ${loaiBadge(d.loai)}`}>{LOAI_LABEL[d.loai]}</span>
      </div>
      <div className="text-xs text-slate-600 mt-1 flex items-center gap-1">
        <CalendarClock className="w-3.5 h-3.5 text-slate-400" /> {moTaKhoang(d.tu_ngay, d.den_ngay, d.buoi)}
      </div>
      {d.ly_do && <div className="text-xs text-slate-500 mt-1">Lý do: {d.ly_do}</div>}
      {d.ghi_chu_duyet && <div className="text-xs text-slate-400 mt-0.5">Ghi chú duyệt: {d.ghi_chu_duyet}</div>}
      {actionable && (
        <div className="flex gap-2 mt-2.5">
          <button
            onClick={() => decide(d.id, 'duyet')}
            disabled={busy === d.id}
            className="flex-1 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
          ><Check className="w-4 h-4" /> Duyệt</button>
          <button
            onClick={() => { setReject(d); setRejectReason("") }}
            disabled={busy === d.id}
            className="flex-1 h-9 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
          ><X className="w-4 h-4" /> Từ chối</button>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700">Đơn chờ duyệt {pending.length > 0 && <span className="ml-1 text-rose-600">({pending.length})</span>}</h3>
        <button onClick={fetchData} className="p-1.5 text-slate-400 hover:text-emerald-600" title="Làm mới"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {loading ? (
        <div className="text-center text-sm text-slate-400 py-8">Đang tải…</div>
      ) : pending.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-400">Không có đơn nào chờ duyệt.</div>
      ) : (
        <div className="space-y-2">{pending.map(d => <DonCard key={d.id} d={d} actionable />)}</div>
      )}

      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-2">Sắp nghỉ (đã duyệt)</h3>
        {upcoming.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center text-xs text-slate-400">Chưa có lịch nghỉ nào sắp tới.</div>
        ) : (
          <div className="space-y-2">{upcoming.map(d => <DonCard key={d.id} d={d} actionable={false} />)}</div>
        )}
      </div>

      {/* Modal từ chối */}
      {reject && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-5 space-y-3">
              <h3 className="text-base font-bold text-rose-600 flex items-center gap-2"><X className="w-5 h-5" /> Từ chối đơn nghỉ</h3>
              <p className="text-sm text-slate-600">{reject.soct_users?.full_name} — {LOAI_LABEL[reject.loai]}: {moTaKhoang(reject.tu_ngay, reject.den_ngay, reject.buoi)}</p>
              <textarea
                rows={3}
                className="w-full p-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-rose-400 outline-none"
                placeholder="Lý do từ chối (gửi cho người đăng ký, không bắt buộc)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            <div className="bg-slate-50 p-4 flex justify-end gap-2 border-t border-slate-100">
              <button onClick={() => setReject(null)} className="px-3 h-9 rounded-lg border border-slate-200 text-slate-600 text-sm">Đóng</button>
              <button
                onClick={() => { const d = reject; setReject(null); decide(d.id, 'tu_choi', rejectReason.trim() || undefined) }}
                className="px-3 h-9 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium"
              >Xác nhận từ chối</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
