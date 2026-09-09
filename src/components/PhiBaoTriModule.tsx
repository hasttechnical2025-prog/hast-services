"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import DateField from "@/components/DateField"
import { Landmark, Search, Send, X, RefreshCw } from "lucide-react"

type May = {
  id: string
  ten_khach_hang: string
  ma_may: string | null
  model: string | null
  loai_hd: string | null
  ma_khach_cum: string | null
  vi_tri_dat_may?: string | null
  ngay_het_han_hdbt: string | null
  so_hddv: string | null
  ngay_ky_hddv: string | null
  don_gia_bt: number | null
  soct_khach_cum?: { ma_khach_hang?: string; ten_khach_hang?: string } | null
}
type Group = { so_hddv: string; mays: May[]; donGias: Set<number>; ngayKy: string | null }

const fmtVnd = (x: any) => (Math.round(Number(x) || 0)).toLocaleString('vi-VN')
const fmtDate = (s?: string | null) => { if (!s) return ''; const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '' }
const digits = (s: string) => s.replace(/[^\d]/g, '')
const sanitize = (s: string) => String(s || '').replace(/[^A-Za-z0-9]+/g, '').slice(0, 40)

export default function PhiBaoTriModule({ showNotification }: { showNotification: (t: 'success' | 'error', m: string) => void }) {
  const [rows, setRows] = useState<May[]>([])
  const [billed, setBilled] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [nam, setNam] = useState(String(new Date().getFullYear()))
  const [bill, setBill] = useState<{ so_hddv: string; ten_dong: string; soMay: number; donGia: number } | null>(null)
  const [pushing, setPushing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/phi-bao-tri'); const j = await res.json()
      if (res.ok) { setRows(j.data || []); setBilled(new Set(j.billed || [])) }
      else showNotification('error', j.error || 'Lỗi tải dữ liệu')
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setLoading(false) }
  }, [showNotification])
  useEffect(() => { load() }, [load])

  const khName = (m: May) => m.soct_khach_cum?.ten_khach_hang || m.ten_khach_hang || '—'
  const setLocal = (id: string, field: keyof May, value: any) => setRows(rs => rs.map(r => r.id === id ? { ...r, [field]: value } : r))

  // PATCH 1 field cấu hình (staff) — chỉ đụng 3 cột phí BT của máy.
  const patch = async (id: string, field: 'so_hddv' | 'ngay_ky_hddv' | 'don_gia_bt', value: any) => {
    try {
      const res = await fetch('/api/admin/phi-bao-tri', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, [field]: value }) })
      if (!res.ok) { const j = await res.json(); showNotification('error', j.error || 'Lỗi lưu') }
    } catch { showNotification('error', 'Lỗi kết nối!') }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter(m => `${khName(m)} ${m.ma_may || ''} ${m.model || ''} ${m.so_hddv || ''}`.toLowerCase().includes(s))
  }, [rows, q]) // eslint-disable-line react-hooks/exhaustive-deps

  // Gom theo Số HĐDV (chỉ HĐ có đơn giá > 0) cho phần hóa đơn.
  const groups = useMemo<Group[]>(() => {
    const m = new Map<string, Group>()
    for (const r of rows) {
      const hd = (r.so_hddv || '').trim()
      if (!hd || !(Number(r.don_gia_bt) > 0)) continue
      if (!m.has(hd)) m.set(hd, { so_hddv: hd, mays: [], donGias: new Set(), ngayKy: r.ngay_ky_hddv })
      const g = m.get(hd)!
      g.mays.push(r); g.donGias.add(Number(r.don_gia_bt)); if (r.ngay_ky_hddv && !g.ngayKy) g.ngayKy = r.ngay_ky_hddv
    }
    return [...m.values()].sort((a, b) => a.so_hddv.localeCompare(b.so_hddv))
  }, [rows])

  // Gợi ý kỳ (từ ngày ký → +1 năm −1 ngày) trong năm đang chọn.
  const suggestKy = (ngayKy: string | null) => {
    if (!ngayKy) return { tu: '', den: '' }
    const p = String(ngayKy).slice(0, 10).split('-'); const mm = p[1], dd = p[2]
    const tu = `${dd}/${mm}/${nam}`
    const d = new Date(Number(nam), Number(mm) - 1, Number(dd)); d.setFullYear(d.getFullYear() + 1); d.setDate(d.getDate() - 1)
    const den = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
    return { tu, den }
  }
  const defaultTenDong = (g: Group) => {
    const { tu, den } = suggestKy(g.ngayKy)
    const kyTxt = (tu && den) ? ` từ ${tu} đến ${den}` : ''
    const kyKy = g.ngayKy ? ` ký ngày ${fmtDate(g.ngayKy)}` : ''
    return `Phí dịch vụ kỹ thuật tổng hợp máy photocopy${kyTxt} theo hợp đồng số ${g.so_hddv}${kyKy}`
  }
  const reportOf = (hd: string) => `PBT-${nam}-${sanitize(hd)}`

  const openBill = (g: Group) => setBill({ so_hddv: g.so_hddv, ten_dong: defaultTenDong(g), soMay: g.mays.length, donGia: [...g.donGias][0] })
  const doPush = async () => {
    if (!bill) return
    setPushing(true)
    try {
      const res = await fetch('/api/admin/phi-bao-tri/day-kanban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ so_hddv: bill.so_hddv, nam, ten_dong: bill.ten_dong }) })
      const j = await res.json()
      if (res.ok) { showNotification('success', `Đã tạo phí BT HĐ ${bill.so_hddv} (${j.so_may} máy) → Kanban "Chờ xuất HĐ".`); setBill(null); load() }
      else showNotification('error', j.error || 'Lỗi tạo phí bảo trì')
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setPushing(false) }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
        <Landmark className="w-6 h-6 text-blue-600 shrink-0" />
        <div className="flex-1">
          <h2 className="text-base font-bold text-slate-800">Phí bảo trì (phí dịch vụ kỹ thuật/năm theo HĐ)</h2>
          <p className="text-xs text-slate-500">Nhập cấu hình theo máy → gom theo <b>Số HĐDV</b> → tạo hóa đơn đẩy Kanban. Chỉ máy HĐBT/MF.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading} title="Tải lại" className="h-9 w-9 p-0"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></Button>
      </div>

      {/* ===== Danh sách hóa đơn theo HĐDV ===== */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <h3 className="text-sm font-bold text-slate-700">Hóa đơn phí bảo trì theo hợp đồng ({groups.length})</h3>
          <div className="space-y-1 ml-auto">
            <label className="text-xs font-semibold text-slate-600">Năm lập HĐ</label>
            <Input value={nam} onChange={e => setNam(digits(e.target.value).slice(0, 4))} className="bg-white w-24 h-9" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left">Số HĐDV</th>
                <th className="px-3 py-2 text-left">Khách hàng</th>
                <th className="px-2 py-2 text-center">Số máy</th>
                <th className="px-3 py-2 text-right">Đơn giá</th>
                <th className="px-3 py-2 text-right">Thành tiền (chưa VAT)</th>
                <th className="px-3 py-2 text-center">Kỳ (gợi ý)</th>
                <th className="px-2 py-2 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groups.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Chưa có hợp đồng nào đủ điều kiện (cần Số HĐDV + đơn giá &gt; 0). Nhập ở bảng cấu hình bên dưới.</td></tr>
              ) : groups.map(g => {
                const donGia = [...g.donGias][0]
                const lech = g.donGias.size > 1
                const daLap = billed.has(reportOf(g.so_hddv))
                const { tu, den } = suggestKy(g.ngayKy)
                return (
                  <tr key={g.so_hddv} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono font-semibold text-slate-700">{g.so_hddv}</td>
                    <td className="px-3 py-2">{khName(g.mays[0])}</td>
                    <td className="px-2 py-2 text-center font-semibold">{g.mays.length}</td>
                    <td className="px-3 py-2 text-right">{lech ? <span className="text-rose-600 text-xs font-semibold" title="Đơn giá không đồng nhất giữa các máy cùng HĐ">lệch giá</span> : fmtVnd(donGia)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800">{lech ? '—' : fmtVnd(g.mays.length * donGia)}</td>
                    <td className="px-3 py-2 text-center text-xs whitespace-nowrap">{tu && den ? `${tu} → ${den}` : <span className="text-slate-400">—</span>}</td>
                    <td className="px-2 py-2 text-center">
                      {daLap ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">✓ Đã lập {nam}</span>
                      ) : (
                        <Button onClick={() => openBill(g)} disabled={lech} className="h-8 gap-1.5" title={lech ? 'Sửa đơn giá cho đồng nhất trước' : 'Tạo hóa đơn phí BT → đẩy Kanban'}>
                          <Send className="w-3.5 h-3.5" /> Tạo → Kanban
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Bảng cấu hình phí BT theo máy (inline edit) ===== */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-slate-700">Cấu hình theo máy (HĐBT/MF) — {filtered.length} máy</h3>
          <div className="relative w-full sm:w-72 ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Tìm khách / mã máy / số HĐ..." className="pl-9 bg-white h-9" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left">Khách hàng</th>
                <th className="px-2 py-2 text-left">Mã máy</th>
                <th className="px-2 py-2 text-left">Model</th>
                <th className="px-2 py-2 text-center">Loại HĐ</th>
                <th className="px-2 py-2 text-center">Hết hạn HĐBT</th>
                <th className="px-3 py-2 text-left w-40">Số HĐDV</th>
                <th className="px-3 py-2 text-left w-36">Ngày ký HĐ</th>
                <th className="px-3 py-2 text-right w-32">Đơn giá phí BT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">Đang tải…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">Không có máy HĐBT/MF.</td></tr>
              ) : filtered.map(m => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-3 py-1.5">{khName(m)}{m.soct_khach_cum ? <span className="ml-1 text-[10px] text-violet-600">(cụm)</span> : ''}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">{m.ma_may}</td>
                  <td className="px-2 py-1.5 text-xs">{m.model}</td>
                  <td className="px-2 py-1.5 text-center text-xs">{m.loai_hd}</td>
                  <td className="px-2 py-1.5 text-center text-xs whitespace-nowrap">{fmtDate(m.ngay_het_han_hdbt) || '—'}</td>
                  <td className="px-3 py-1.5">
                    <Input value={m.so_hddv || ''} onChange={e => setLocal(m.id, 'so_hddv', e.target.value)}
                      onBlur={e => patch(m.id, 'so_hddv', e.target.value)} className="h-8 bg-white" placeholder="VD: 310325/HĐDV-ST" />
                  </td>
                  <td className="px-3 py-1.5">
                    <DateField value={m.ngay_ky_hddv ? String(m.ngay_ky_hddv).slice(0, 10) : ''} heightClass="h-8"
                      onChange={v => { setLocal(m.id, 'ngay_ky_hddv', v); patch(m.id, 'ngay_ky_hddv', v || null) }} />
                  </td>
                  <td className="px-3 py-1.5">
                    <Input value={m.don_gia_bt != null ? fmtVnd(m.don_gia_bt) : ''} onChange={e => setLocal(m.id, 'don_gia_bt', digits(e.target.value) ? Number(digits(e.target.value)) : null)}
                      onBlur={e => patch(m.id, 'don_gia_bt', digits(e.target.value) ? Number(digits(e.target.value)) : null)} className="h-8 bg-white text-right" placeholder="0" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Modal tạo hóa đơn phí BT ===== */}
      {bill && (
        <div className="fixed inset-0 bg-slate-900/50 z-[80] flex items-center justify-center p-4" onClick={() => !pushing && setBill(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">Tạo phí bảo trì — HĐ {bill.so_hddv}</h3>
              <button onClick={() => setBill(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
              <span className="font-semibold">{bill.soMay}</span> máy × <span className="font-semibold">{fmtVnd(bill.donGia)}</span> đ
              &nbsp;=&nbsp; <b className="text-slate-800">{fmtVnd(bill.soMay * bill.donGia)}</b> đ (chưa VAT) · VAT 8% → <b className="text-slate-800">{fmtVnd(Math.round(bill.soMay * bill.donGia * 1.08))}</b> đ · Năm lập: <b>{nam}</b>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Nội dung dòng dịch vụ (sửa tự do)</label>
              <textarea value={bill.ten_dong} onChange={e => setBill({ ...bill, ten_dong: e.target.value })} rows={3}
                className="w-full p-2.5 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-400 outline-none" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setBill(null)} disabled={pushing} className="h-9">Hủy</Button>
              <Button onClick={doPush} disabled={pushing || !bill.ten_dong.trim()} className="h-9 gap-1.5"><Send className="w-4 h-4" /> {pushing ? 'Đang tạo…' : 'Tạo → Kanban'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
