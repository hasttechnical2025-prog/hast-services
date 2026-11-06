"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { RefreshCw, Clock, MapPin, ChevronLeft, ChevronRight, CalendarClock } from "lucide-react"
import { thuVN, fmtNgayVN, khoangGio, type OtRow } from "@/lib/ot"

// KTV XEM lịch làm thêm giờ (OT) ĐƯỢC PHÂN — READ-ONLY. KTV không tự đăng ký (tech_admin tạo ca).
const ymNow = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const thangLabel = (ym: string) => { const [y, m] = ym.split('-'); return `Tháng ${m}/${y}` }
// Số giờ 1 ca từ "HH:MM" → "HH:MM" (làm tròn 0.5h). Qua đêm (đến < từ) +24h.
function gioCa(tu: string | null, den: string | null): number {
  if (!tu || !den) return 0
  const [h1, m1] = tu.split(':').map(Number), [h2, m2] = den.split(':').map(Number)
  if ([h1, m1, h2, m2].some(n => isNaN(n))) return 0
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1)
  if (mins < 0) mins += 24 * 60
  return Math.round((mins / 60) * 2) / 2
}

export default function KtvOtXem() {
  const [thang, setThang] = useState<string>(ymNow())
  const [rows, setRows] = useState<OtRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ktv/ot?thang=${thang}`)
      const j = await res.json()
      if (res.ok) setRows(j.data || [])
    } catch { /* giữ dữ liệu cũ */ } finally { setLoading(false) }
  }, [thang])

  useEffect(() => { fetchData() }, [fetchData])

  const tongGio = useMemo(() => rows.reduce((s, r) => s + gioCa(r.tu_gio, r.den_gio), 0), [rows])

  return (
    <div className="space-y-3">
      {/* Chọn tháng */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 p-2">
        <button onClick={() => setThang(t => shiftMonth(t, -1))} className="h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><ChevronLeft className="w-5 h-5" /></button>
        <div className="text-sm font-bold text-slate-700">{thangLabel(thang)}</div>
        <button onClick={() => setThang(t => shiftMonth(t, 1))} className="h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><ChevronRight className="w-5 h-5" /></button>
      </div>

      {/* Tóm tắt */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-emerald-700">{rows.length}</div>
          <div className="text-[11px] text-emerald-600 font-medium">ca OT</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-emerald-700">{tongGio.toLocaleString('vi-VN')}</div>
          <div className="text-[11px] text-emerald-600 font-medium">giờ (tạm tính)</div>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 px-1 flex items-center gap-1">
        <CalendarClock className="w-3.5 h-3.5 shrink-0" /> Lịch OT do văn phòng phân công. Số giờ tính tiền do P. HCNS chốt trên phiếu.
      </p>

      {loading && rows.length === 0 ? (
        <div className="text-center text-sm text-slate-400 py-8"><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1.5 text-emerald-600" />Đang tải lịch OT...</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-400">Không có ca OT nào trong {thangLabel(thang).toLowerCase()}.</div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-slate-800 text-sm font-mono">{fmtNgayVN(r.ngay)} <span className="text-slate-400 font-sans font-normal">· Thứ {thuVN(r.ngay)}</span></div>
                {khoangGio(r.tu_gio, r.den_gio) && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded"><Clock className="w-3 h-3" />{khoangGio(r.tu_gio, r.den_gio)}</span>
                )}
              </div>
              {r.dia_diem && <div className="text-xs text-slate-500 mt-1.5 flex items-start gap-1"><MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400 mt-0.5" /><span>{r.dia_diem}</span></div>}
              {r.dau_viec && <div className="text-sm text-slate-700 mt-1">{r.dau_viec}</div>}
              <div className="flex items-center gap-2 mt-1.5">
                {r.ket_qua && <span className="text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{r.ket_qua}</span>}
                {r.ghi_chu && <span className="text-[11px] text-slate-400">{r.ghi_chu}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
