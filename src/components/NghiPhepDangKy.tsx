"use client"

import { useState, useEffect, useCallback } from "react"
import { Send, Trash2, CalendarClock, RefreshCw } from "lucide-react"
import DateField from "@/components/DateField"
import { supabase } from "@/lib/supabase"
import { LEAVE_TOPIC, LEAVE_EVENT } from "@/lib/realtime"
import { LOAI_LABEL, BUOI_LABEL, TRANG_THAI_LABEL, moTaKhoang, type LoaiNghi, type Buoi } from "@/lib/nghi-phep"

type Don = {
  id: string
  loai: LoaiNghi
  tu_ngay: string
  den_ngay: string
  buoi: Buoi
  so_ngay: number
  ly_do: string | null
  trang_thai: 'cho_duyet' | 'da_duyet' | 'tu_choi'
  ghi_chu_duyet: string | null
}

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const ttBadge = (t: Don['trang_thai']) =>
  t === 'da_duyet' ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
    : t === 'tu_choi' ? 'bg-rose-50 text-rose-700 border-rose-100'
      : 'bg-amber-50 text-amber-700 border-amber-100'

export default function NghiPhepDangKy({ notify }: { notify: (type: 'success' | 'error', msg: string) => void }) {
  const empty = () => ({ loai: 'phep' as LoaiNghi, tu_ngay: todayStr(), den_ngay: todayStr(), buoi: 'ca_ngay' as Buoi, ly_do: '' })
  const [form, setForm] = useState(empty())
  const [list, setList] = useState<Don[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  const oneDay = form.tu_ngay === form.den_ngay

  const fetchList = useCallback(async () => {
    try { const r = await fetch('/api/ktv/nghi-phep'); const j = await r.json(); if (r.ok) setList(j.data || []) }
    catch { /* giữ dữ liệu cũ */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { fetchList() }, [fetchList])
  useEffect(() => {
    const ch = supabase.channel(LEAVE_TOPIC).on('broadcast', { event: LEAVE_EVENT }, () => fetchList()).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchList])

  const submit = async () => {
    if (!form.tu_ngay || !form.den_ngay) return notify('error', 'Chọn từ ngày / đến ngày')
    if (form.den_ngay < form.tu_ngay) return notify('error', 'Đến ngày phải sau hoặc bằng Từ ngày')
    setSaving(true)
    try {
      const res = await fetch('/api/ktv/nghi-phep', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, buoi: oneDay ? form.buoi : 'ca_ngay' }),
      })
      const j = await res.json()
      if (res.ok) { notify('success', 'Đã gửi đơn — chờ tech_admin duyệt.'); setForm(empty()); fetchList() }
      else notify('error', j.error || 'Gửi không thành công')
    } catch { notify('error', 'Lỗi kết nối!') } finally { setSaving(false) }
  }

  const cancel = async (id: string) => {
    try {
      const res = await fetch(`/api/ktv/nghi-phep?id=${id}`, { method: 'DELETE' })
      if (res.ok) { notify('success', 'Đã hủy đơn.'); fetchList() }
      else { const j = await res.json(); notify('error', j.error || 'Hủy không thành công') }
    } catch { notify('error', 'Lỗi kết nối!') }
  }

  return (
    <div className="space-y-4">
      {/* FORM ĐĂNG KÝ */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5"><CalendarClock className="w-4 h-4 text-emerald-600" /> Đăng ký nghỉ</h4>

        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase">Loại nghỉ</label>
          <div className="grid grid-cols-3 gap-1.5 mt-1">
            {(Object.keys(LOAI_LABEL) as LoaiNghi[]).map(l => (
              <button key={l} type="button" onClick={() => set('loai', l)}
                className={`h-9 rounded-lg text-xs font-semibold border transition ${form.loai === l ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                {LOAI_LABEL[l]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase">Từ ngày</label>
            <DateField value={form.tu_ngay} onChange={(v) => setForm(f => ({ ...f, tu_ngay: v, den_ngay: f.den_ngay < v ? v : f.den_ngay }))} heightClass="h-9" className="mt-1" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase">Đến ngày</label>
            <DateField value={form.den_ngay} onChange={(v) => set('den_ngay', v)} heightClass="h-9" className="mt-1" />
          </div>
        </div>

        {oneDay && (
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase">Buổi</label>
            <div className="grid grid-cols-3 gap-1.5 mt-1">
              {(Object.keys(BUOI_LABEL) as Buoi[]).map(b => (
                <button key={b} type="button" onClick={() => set('buoi', b)}
                  className={`h-9 rounded-lg text-xs font-semibold border transition ${form.buoi === b ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                  {BUOI_LABEL[b]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase">Lý do</label>
          <textarea rows={2} value={form.ly_do} onChange={(e) => set('ly_do', e.target.value)}
            placeholder="VD: về quê, khám bệnh…" className="w-full mt-1 p-2.5 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-emerald-400" />
        </div>

        <button onClick={submit} disabled={saving}
          className="w-full h-10 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          <Send className="w-4 h-4" /> {saving ? 'Đang gửi…' : 'Gửi đơn'}
        </button>
      </div>

      {/* ĐƠN CỦA TÔI */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-bold text-slate-700 text-sm">Đơn của tôi</h4>
          <button onClick={fetchList} className="p-1.5 text-slate-400 hover:text-emerald-600" title="Làm mới"><RefreshCw className="w-4 h-4" /></button>
        </div>
        {loading ? (
          <div className="text-center text-sm text-slate-400 py-6">Đang tải…</div>
        ) : list.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-400">Chưa có đơn nghỉ nào.</div>
        ) : (
          <div className="space-y-2">
            {list.map(d => (
              <div key={d.id} className="bg-white rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-800">{LOAI_LABEL[d.loai]}</div>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border shrink-0 ${ttBadge(d.trang_thai)}`}>{TRANG_THAI_LABEL[d.trang_thai]}</span>
                </div>
                <div className="text-xs text-slate-600 mt-1">{moTaKhoang(d.tu_ngay, d.den_ngay, d.buoi)}</div>
                {d.ly_do && <div className="text-xs text-slate-500 mt-0.5">Lý do: {d.ly_do}</div>}
                {d.ghi_chu_duyet && <div className="text-xs text-slate-400 mt-0.5">Ghi chú duyệt: {d.ghi_chu_duyet}</div>}
                {d.trang_thai === 'cho_duyet' && (
                  <button onClick={() => cancel(d.id)} className="mt-2 text-xs text-rose-600 hover:text-rose-700 flex items-center gap-1">
                    <Trash2 className="w-3.5 h-3.5" /> Hủy đơn
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
