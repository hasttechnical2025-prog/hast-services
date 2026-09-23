"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import DateField from "@/components/DateField"
import { Plus, FileText, PenSquare, Trash2, X, Save, RefreshCw, LogOut, Package, Boxes } from "lucide-react"

type HangHoa = { ma_hang: string; ten_hang: string; dvt: string | null; don_gia_niem_yet: number | null; hang: string | null; model: string | null; ghi_chu: string | null }

// Combobox tra DANH MỤC MÁY (chọn mã -> tự điền tên + đơn giá niêm yết); vẫn cho gõ tự do mã ngoài danh mục.
function MayCombo({ value, catalog, onChangeMa, onPick }: {
  value: string; catalog: HangHoa[]
  onChangeMa: (ma: string) => void
  onPick: (it: HangHoa) => void
}) {
  const [open, setOpen] = useState(false)
  const [kw, setKw] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const matches = useMemo(() => {
    const s = (kw || value).trim().toLowerCase()
    const list = Array.isArray(catalog) ? catalog : []
    if (!s) return list.slice(0, 30)
    return list.filter(it => String(it.ma_hang || '').toLowerCase().includes(s) || String(it.ten_hang || '').toLowerCase().includes(s)).slice(0, 30)
  }, [kw, value, catalog])
  return (
    <div ref={boxRef} className="relative">
      <Input value={value}
        onChange={e => { const v = e.target.value.toUpperCase(); onChangeMa(v); setKw(v); setOpen(true) }}
        onFocus={() => setOpen(true)} placeholder="Mã" className="h-7 text-xs font-mono uppercase" />
      {open && matches.length > 0 && (
        <div className="absolute z-30 mt-0.5 w-[340px] max-w-[80vw] max-h-56 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg text-xs">
          {matches.map((it, i) => (
            <button key={i} type="button"
              onMouseDown={(e) => { e.preventDefault(); onPick(it); setOpen(false); setKw('') }}
              className="w-full text-left px-2 py-1.5 hover:bg-slate-100 flex items-center gap-2">
              <span className="font-mono font-semibold text-slate-800 shrink-0">{it.ma_hang}</span>
              <span className="text-slate-500 truncate">{it.ten_hang}</span>
              <span className="ml-auto text-[10px] text-slate-400 shrink-0">{Math.round(Number(it.don_gia_niem_yet) || 0).toLocaleString('vi-VN')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

type Line = { stt?: number; ma_hang: string; ten_hang: string; dvt: string; so_luong: number | string; don_gia: number | string; vat: number | string; ghi_chu?: string }
type Lenh = {
  id: string; so_lenh: string | null; ngay: string; ten_khach_hang: string; dia_chi: string | null; ma_so_thue: string | null
  so_hop_dong: string | null
  nguoi_kinh_doanh_id: string | null; ghi_chu: string | null; trang_thai_hd: string
  so_hoa_don: string | null; ngay_xuat_hd: string | null
  nguoi_kd?: { full_name: string } | null
  soct_lenh_xuat_ct?: Line[]
}

const fmtVnd = (n: any) => Math.round(Number(n) || 0).toLocaleString('vi-VN')
const fmtDate = (s?: string | null) => { if (!s) return ''; const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '' }

const TT_LABEL: Record<string, { label: string; cls: string }> = {
  'Chờ xuất HĐ': { label: 'Chờ bàn giao', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  'Đang xử lý HĐ': { label: 'Đã bàn giao KT', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  'Đã lên hóa đơn': { label: 'Đã lên HĐ', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  'Đã thanh toán': { label: 'Đã thanh toán', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
}

const emptyLine = (): Line => ({ ma_hang: '', ten_hang: '', dvt: 'Cái', so_luong: 1, don_gia: '', vat: 8, ghi_chu: '' })

// Quản lý Danh mục Máy & Hàng hóa. Thêm/sửa/xóa chỉ khi isManager (sale_admin/admin); còn lại chỉ xem.
function CatalogManager({ catalog, isManager, hangOptions, onClose, onChanged, notify }: {
  catalog: HangHoa[]; isManager: boolean; hangOptions: string[]; onClose: () => void; onChanged: () => void
  notify: (t: 'success' | 'error', m: string) => void
}) {
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const emptyF = { ma_hang: '', ten_hang: '', dvt: 'Cái', don_gia_niem_yet: '', hang: '' }
  const [f, setF] = useState(emptyF)
  // Nhập hàng loạt (dán từ Excel) — có bước KIỂM TRA trước khi nhập
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [importing, setImporting] = useState(false)
  type PRow = { ma_hang: string; ten_hang: string; dvt: string; don_gia_niem_yet: number; status: 'ok' | 'err' | 'overwrite'; note: string }
  const [preview, setPreview] = useState<PRow[] | null>(null)
  const setBulk = (v: string) => { setBulkText(v); setPreview(null) }   // sửa nội dung -> phải kiểm tra lại
  const list = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return catalog
    return catalog.filter(c => [c.ma_hang, c.ten_hang, c.hang, c.model].filter(Boolean).join(' ').toLowerCase().includes(kw))
  }, [catalog, q])
  const reset = () => { setF(emptyF); setEditing(false) }
  const pick = (c: HangHoa) => { setEditing(true); setF({ ma_hang: c.ma_hang, ten_hang: c.ten_hang, dvt: c.dvt || 'Cái', don_gia_niem_yet: c.don_gia_niem_yet != null ? String(c.don_gia_niem_yet) : '', hang: c.hang || '' }) }
  const fmtGia = (s: string) => { const d = String(s).replace(/\D/g, ''); return d ? Number(d).toLocaleString('vi-VN') : '' }

  // Bóc tách dòng dán: "Mã ⇥ Tên ⇥ ĐVT ⇥ Đơn giá" (tab, hoặc nhiều dấu cách/; , ) + gắn trạng thái.
  const parseRows = (text: string): PRow[] => {
    const existing = new Set(catalog.map(c => String(c.ma_hang || '').toUpperCase()))
    const seen = new Set<string>()
    return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
      const c = l.split('\t').length > 1 ? l.split('\t') : l.split(/\s{2,}|;|,(?=\s)/)
      const ma = (c[0] || '').trim().toUpperCase()
      const ten = (c[1] || '').trim()
      const dvt = (c[2] || '').trim() || 'Cái'
      const gia = Number(String(c[3] || '').replace(/\D/g, '')) || 0
      let status: PRow['status'] = 'ok'; let note = ''
      if (!ma || !ten) { status = 'err'; note = !ma ? 'Thiếu mã' : 'Thiếu tên' }
      else if (seen.has(ma)) { status = 'err'; note = 'Trùng mã trong danh sách dán' }
      else if (existing.has(ma)) { status = 'overwrite'; note = 'Đã có — sẽ ghi đè' }
      if (ma) seen.add(ma)
      return { ma_hang: ma, ten_hang: ten, dvt, don_gia_niem_yet: gia, status, note }
    })
  }
  const doCheck = () => {
    const rows = parseRows(bulkText)
    if (rows.length === 0) { notify('error', 'Chưa có dòng nào để kiểm tra'); return }
    setPreview(rows)
  }
  const doImport = async () => {
    const rows = (preview || []).filter(r => r.status !== 'err')
    if (rows.length === 0) { notify('error', 'Không có dòng hợp lệ để nhập'); return }
    setImporting(true)
    try {
      const res = await fetch('/api/admin/hang-hoa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: rows }) })
      const j = await res.json()
      if (res.ok) { notify('success', `Đã nhập ${j.count} mã`); setBulkText(''); setPreview(null); setBulkOpen(false); onChanged() }
      else notify('error', j.error || 'Lỗi import')
    } catch { notify('error', 'Lỗi kết nối') } finally { setImporting(false) }
  }
  const save = async () => {
    if (!f.ma_hang.trim()) { notify('error', 'Nhập mã hàng'); return }
    if (!f.ten_hang.trim()) { notify('error', 'Nhập tên hàng'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/admin/hang-hoa', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
      const j = await res.json()
      if (res.ok) { notify('success', editing ? 'Đã cập nhật mã' : 'Đã thêm mã'); reset(); onChanged() }
      else notify('error', j.error || 'Lỗi lưu')
    } catch { notify('error', 'Lỗi kết nối') } finally { setBusy(false) }
  }
  const del = async (ma: string) => {
    if (!window.confirm(`Xóa mã ${ma} khỏi danh mục?`)) return
    try {
      const res = await fetch(`/api/admin/hang-hoa?ma=${encodeURIComponent(ma)}`, { method: 'DELETE' })
      const j = await res.json()
      if (res.ok) { notify('success', 'Đã xóa mã'); onChanged() } else notify('error', j.error || 'Lỗi xóa')
    } catch { notify('error', 'Lỗi kết nối') }
  }
  return (
    <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl my-6 flex flex-col max-h-[92vh] overflow-hidden border border-slate-200">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><Boxes className="w-5 h-5 text-blue-600" />Danh mục Máy &amp; Hàng hóa</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {isManager && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase">{bulkOpen ? 'Nhập hàng loạt' : (editing ? 'Sửa mã' : 'Thêm mã')}</span>
                <button type="button" onClick={() => setBulkOpen(v => !v)} className="text-[11px] font-semibold text-blue-600 hover:underline">
                  {bulkOpen ? '— Đóng nhập hàng loạt' : '+ Nhập hàng loạt (dán từ Excel)'}
                </button>
              </div>

              {bulkOpen ? (
                <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200 space-y-2">
                  <p className="text-[11px] text-slate-500">Dán từ Excel, mỗi dòng: <b>Mã hàng ⇥ Tên hàng ⇥ ĐVT ⇥ Đơn giá</b> (ĐVT/Đơn giá bỏ trống cũng được). Bấm <b>Kiểm tra</b> trước, rồi <b>Nhập</b>. Trùng mã sẽ ghi đè.</p>
                  <textarea value={bulkText} onChange={e => setBulk(e.target.value)} rows={7}
                    placeholder={"1102RJ3AX.0G0\tMáy photo TASKalfa 5002i\tCái\t0\nTC10106.1G0\tMáy DC-V 3060CP\tCái\t0"}
                    className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-200" />
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" onClick={doCheck} className="h-8 text-xs">Kiểm tra</Button>
                    <Button onClick={doImport} disabled={importing || !preview || preview.every(r => r.status === 'err')} className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white">{importing ? 'Đang nhập...' : 'Nhập danh sách'}</Button>
                  </div>

                  {preview && (() => {
                    const ok = preview.filter(r => r.status === 'ok').length
                    const ow = preview.filter(r => r.status === 'overwrite').length
                    const er = preview.filter(r => r.status === 'err').length
                    return (
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap gap-2 text-[11px]">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">Mới hợp lệ: {ok}</span>
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">Ghi đè: {ow}</span>
                          <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold">Lỗi (bỏ qua): {er}</span>
                        </div>
                        <div className="border border-slate-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                          <table className="w-full text-left text-[11px] text-slate-600">
                            <thead className="bg-slate-100 text-slate-500 uppercase sticky top-0"><tr><th className="px-2 py-1">Mã</th><th className="px-2 py-1">Tên</th><th className="px-2 py-1 text-center">ĐVT</th><th className="px-2 py-1 text-right">Đơn giá</th><th className="px-2 py-1">Trạng thái</th></tr></thead>
                            <tbody className="divide-y divide-slate-100">
                              {preview.map((r, i) => (
                                <tr key={i} className={r.status === 'err' ? 'bg-rose-50/40' : r.status === 'overwrite' ? 'bg-amber-50/40' : ''}>
                                  <td className="px-2 py-1 font-mono font-semibold text-slate-800">{r.ma_hang || <span className="text-rose-500 italic">(trống)</span>}</td>
                                  <td className="px-2 py-1">{r.ten_hang || <span className="text-rose-500 italic">(trống)</span>}</td>
                                  <td className="px-2 py-1 text-center">{r.dvt}</td>
                                  <td className="px-2 py-1 text-right">{r.don_gia_niem_yet.toLocaleString('vi-VN')}</td>
                                  <td className="px-2 py-1">
                                    {r.status === 'ok' && <span className="text-emerald-600">✓ Mới</span>}
                                    {r.status === 'overwrite' && <span className="text-amber-600">↻ {r.note}</span>}
                                    {r.status === 'err' && <span className="text-rose-600">✕ {r.note}</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-12 gap-2.5 bg-slate-50/80 p-3 rounded-lg border border-slate-200">
                  <div className="sm:col-span-3">
                    <label className="block text-slate-600 font-semibold mb-1">Mã hàng *</label>
                    <Input value={f.ma_hang} disabled={editing} onChange={e => setF({ ...f, ma_hang: e.target.value.toUpperCase() })} className="h-8 font-mono uppercase bg-white disabled:opacity-60" />
                  </div>
                  <div className="sm:col-span-7">
                    <label className="block text-slate-600 font-semibold mb-1">Tên hàng *</label>
                    <Input value={f.ten_hang} onChange={e => setF({ ...f, ten_hang: e.target.value })} className="h-8 bg-white" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-slate-600 font-semibold mb-1">ĐVT</label>
                    <Input value={f.dvt} onChange={e => setF({ ...f, dvt: e.target.value })} className="h-8 bg-white text-center px-1" />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-slate-600 font-semibold mb-1">Hãng</label>
                    <select value={f.hang} onChange={e => setF({ ...f, hang: e.target.value })} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200">
                      <option value="">— Chọn hãng —</option>
                      {f.hang && !hangOptions.includes(f.hang) && <option value={f.hang}>{f.hang}</option>}
                      {hangOptions.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block text-slate-600 font-semibold mb-1">Đơn giá niêm yết</label>
                    <Input inputMode="numeric" value={fmtGia(f.don_gia_niem_yet)} onChange={e => setF({ ...f, don_gia_niem_yet: e.target.value.replace(/\D/g, '') })} placeholder="0" className="h-8 text-right bg-white" />
                  </div>
                  <div className="sm:col-span-5 flex items-end gap-2">
                    <Button onClick={save} disabled={busy} className="h-8 flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white">{editing ? 'Lưu' : 'Thêm'}</Button>
                    {editing && <Button variant="outline" onClick={reset} className="h-8 text-xs">Hủy</Button>}
                  </div>
                </div>
              )}
            </div>
          )}
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm mã / tên / hãng / model..." className="h-8 bg-white" />
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-500 text-[11px] font-semibold uppercase border-b border-slate-200">
                <tr><th className="px-2.5 py-2">Mã</th><th className="px-2.5 py-2">Tên</th><th className="px-2.5 py-2 text-center">ĐVT</th><th className="px-2.5 py-2 text-right">Đơn giá niêm yết</th><th className="px-2.5 py-2">Hãng</th>{isManager && <th className="px-2.5 py-2 text-center">Thao tác</th>}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.length === 0 ? (
                  <tr><td colSpan={isManager ? 6 : 5} className="px-4 py-6 text-center text-slate-400">Chưa có mã nào.</td></tr>
                ) : list.map(c => (
                  <tr key={c.ma_hang} className="hover:bg-slate-50">
                    <td className="px-2.5 py-1.5 font-mono font-semibold text-slate-800">{c.ma_hang}</td>
                    <td className="px-2.5 py-1.5">{c.ten_hang}</td>
                    <td className="px-2.5 py-1.5 text-center">{c.dvt || '—'}</td>
                    <td className="px-2.5 py-1.5 text-right">{Math.round(Number(c.don_gia_niem_yet) || 0).toLocaleString('vi-VN')}</td>
                    <td className="px-2.5 py-1.5 text-[11px] text-slate-500">{c.hang || '—'}</td>
                    {isManager && <td className="px-2.5 py-1.5 text-center whitespace-nowrap">
                      <button onClick={() => pick(c)} title="Sửa" className="p-1 rounded text-amber-600 hover:bg-amber-50"><PenSquare className="w-4 h-4" /></button>
                      <button onClick={() => del(c.ma_hang)} title="Xóa" className="p-1 rounded text-rose-600 hover:bg-rose-50 ml-1"><Trash2 className="w-4 h-4" /></button>
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!isManager && <p className="text-[11px] text-slate-400">Chỉ quản lý kinh doanh được thêm/sửa danh mục.</p>}
        </div>
      </div>
    </div>
  )
}

export default function LenhXuatHangPage() {
  const [me, setMe] = useState<{ full_name: string; role: string } | null>(null)
  const [authErr, setAuthErr] = useState(false)
  const [rows, setRows] = useState<Lenh[]>([])
  const [isManager, setIsManager] = useState(false)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [note, setNote] = useState<{ t: 'success' | 'error'; m: string } | null>(null)
  const notify = (t: 'success' | 'error', m: string) => { setNote({ t, m }); setTimeout(() => setNote(null), 3500) }

  // Modal
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ so_lenh: '', ngay: new Date().toISOString().slice(0, 10), ten_khach_hang: '', dia_chi: '', ma_so_thue: '', so_hop_dong: '', ghi_chu: '' })
  const [lines, setLines] = useState<Line[]>([emptyLine(), emptyLine()])
  const [delTarget, setDelTarget] = useState<Lenh | null>(null)

  // Danh mục máy & hàng hóa (vlookup dòng hàng) + màn quản lý
  const [catalog, setCatalog] = useState<HangHoa[]>([])
  const [catOpen, setCatOpen] = useState(false)
  const [hangOptions, setHangOptions] = useState<string[]>([])
  const loadCatalog = useCallback(() => {
    fetch('/api/admin/hang-hoa').then(r => r.ok ? r.json() : { data: [] }).then(j => setCatalog(j.data || [])).catch(() => {})
    fetch('/api/admin/danh-muc?nhom=hang').then(r => r.ok ? r.json() : { data: [] })
      .then(j => setHangOptions((j.data || []).filter((d: any) => d.active).sort((a: any, b: any) => (a.thu_tu || 0) - (b.thu_tu || 0)).map((d: any) => d.gia_tri)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : Promise.reject()).then(j => {
      const u = j.data
      if (!u || !['kinh_doanh', 'admin'].includes(u.role)) { setAuthErr(true); return }
      setMe(u)
    }).catch(() => setAuthErr(true))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/lenh-xuat')
      const j = await res.json()
      if (res.ok) { setRows(j.data || []); setIsManager(!!j.isManager) }
      else notify('error', j.error || 'Lỗi tải danh sách')
    } catch { notify('error', 'Lỗi kết nối') } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (me) { load(); loadCatalog() } }, [me, load, loadCatalog])

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return rows
    return rows.filter(r => [r.so_lenh, r.ten_khach_hang, r.so_hop_dong, r.so_hoa_don, r.nguoi_kd?.full_name].filter(Boolean).join(' ').toLowerCase().includes(kw))
  }, [rows, q])

  const lineTotal = (l: Line) => (Number(l.so_luong) || 0) * (Number(l.don_gia) || 0)
  const formTong = lines.reduce((s, l) => s + lineTotal(l), 0)
  const cardTong = (r: Lenh) => (r.soct_lenh_xuat_ct || []).reduce((s, l) => s + (Number(l.so_luong) || 0) * (Number(l.don_gia) || 0), 0)

  const openCreate = () => {
    setEditingId(null)
    setForm({ so_lenh: '', ngay: new Date().toISOString().slice(0, 10), ten_khach_hang: '', dia_chi: '', ma_so_thue: '', so_hop_dong: '', ghi_chu: '' })
    setLines([emptyLine(), emptyLine()])
    setOpen(true)
  }
  const openEdit = async (r: Lenh) => {
    setEditingId(r.id)
    setForm({ so_lenh: r.so_lenh || '', ngay: r.ngay ? r.ngay.slice(0, 10) : new Date().toISOString().slice(0, 10), ten_khach_hang: r.ten_khach_hang || '', dia_chi: r.dia_chi || '', ma_so_thue: r.ma_so_thue || '', so_hop_dong: r.so_hop_dong || '', ghi_chu: r.ghi_chu || '' })
    try {
      const res = await fetch(`/api/admin/lenh-xuat?id=${r.id}`)
      const j = await res.json()
      const ct: Line[] = (res.ok && j.data?.soct_lenh_xuat_ct) ? j.data.soct_lenh_xuat_ct : []
      const list: Line[] = ct.map(c => ({ ma_hang: c.ma_hang || '', ten_hang: c.ten_hang || '', dvt: c.dvt || 'Cái', so_luong: c.so_luong ?? '', don_gia: c.don_gia ?? '', vat: c.vat ?? 8, ghi_chu: (c as any).ghi_chu || '' }))
      while (list.length < 2) list.push(emptyLine())
      setLines(list)
    } catch { setLines([emptyLine(), emptyLine()]) }
    setOpen(true)
  }
  const updLine = (i: number, k: keyof Line, v: any) => setLines(prev => { const n = [...prev]; n[i] = { ...n[i], [k]: v }; return n })
  const addLine = () => setLines(prev => [...prev, emptyLine()])
  const rmLine = (i: number) => setLines(prev => prev.filter((_, idx) => idx !== i))

  const save = async () => {
    if (!form.ten_khach_hang.trim()) { notify('error', 'Vui lòng nhập tên khách hàng'); return }
    setSubmitting(true)
    try {
      const payload = { ...(editingId ? { id: editingId } : {}), ...form, lines }
      const res = await fetch('/api/admin/lenh-xuat', { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json()
      if (res.ok) { notify('success', editingId ? 'Đã cập nhật lệnh' : 'Đã tạo lệnh xuất hàng'); setOpen(false); load() }
      else notify('error', j.error || 'Lỗi lưu lệnh')
    } catch { notify('error', 'Lỗi kết nối') } finally { setSubmitting(false) }
  }

  const doDelete = async () => {
    if (!delTarget) return
    try {
      const res = await fetch(`/api/admin/lenh-xuat?id=${delTarget.id}`, { method: 'DELETE' })
      const j = await res.json()
      if (res.ok) { notify('success', 'Đã xóa lệnh'); setDelTarget(null); load() }
      else notify('error', j.error || 'Lỗi xóa')
    } catch { notify('error', 'Lỗi kết nối') }
  }

  const logout = async () => { try { await fetch('/api/auth/logout', { method: 'POST' }) } catch {} ; window.location.href = '/' }

  if (authErr) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="text-center space-y-2">
        <p className="text-slate-700 font-semibold">Không có quyền truy cập Lệnh xuất hàng</p>
        <p className="text-sm text-slate-500">Trang này dành cho phòng Kinh doanh.</p>
        <Button onClick={() => window.location.href = '/'} className="mt-2">Về trang chọn vai trò</Button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <header className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-200 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Package className="w-6 h-6 text-blue-600" />
            <div>
              <h1 className="text-lg font-bold text-slate-800">Lệnh xuất hàng</h1>
              <p className="text-xs text-slate-400">Phòng Kinh doanh{me ? ` · ${me.full_name}${isManager ? ' (Quản lý)' : ''}` : ''}</p>
            </div>
          </div>
          <button onClick={logout} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"><LogOut className="w-4 h-4" /> Đăng xuất</button>
        </header>

        {note && <div className={`px-3 py-2 rounded-lg text-sm border ${note.t === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>{note.m}</div>}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm khách, số lệnh, số HĐ..." className="h-9 pl-3" />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setCatOpen(true)} className="h-9 gap-1.5 text-slate-700" title="Danh mục Máy & Hàng hóa"><Boxes className="w-4 h-4" /> Danh mục máy</Button>
            <Button variant="outline" onClick={load} className="h-9 w-9 p-0" title="Làm mới"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></Button>
            <Button onClick={openCreate} className="h-9 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"><Plus className="w-4 h-4" /> Tạo lệnh</Button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-500 text-[11px] font-semibold uppercase border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 text-left">Ngày</th>
                  <th className="px-3 py-2.5 text-left">Khách hàng</th>
                  {isManager && <th className="px-3 py-2.5 text-left">NV kinh doanh</th>}
                  <th className="px-3 py-2.5 text-center">Số dòng</th>
                  <th className="px-3 py-2.5 text-right">Tổng (chưa VAT)</th>
                  <th className="px-3 py-2.5 text-center">Trạng thái</th>
                  <th className="px-3 py-2.5 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={isManager ? 7 : 6} className="px-4 py-8 text-center text-slate-400"><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1.5 text-blue-600" />Đang tải...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={isManager ? 7 : 6} className="px-4 py-8 text-center text-slate-400">Chưa có lệnh xuất hàng nào.</td></tr>
                ) : filtered.map(r => {
                  const tt = TT_LABEL[r.trang_thai_hd] || TT_LABEL['Chờ xuất HĐ']
                  const editable = r.trang_thai_hd === 'Chờ xuất HĐ'
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(r.ngay)}{r.so_lenh ? <div className="text-[10px] text-slate-400 font-mono">{r.so_lenh}</div> : null}</td>
                      <td className="px-3 py-2.5"><div className="font-medium text-slate-800">{r.ten_khach_hang}</div>{r.so_hop_dong && <div className="text-[10px] text-slate-500">HĐ: <span className="font-mono">{r.so_hop_dong}</span></div>}{r.dia_chi && <div className="text-[10px] text-slate-400">{r.dia_chi}</div>}</td>
                      {isManager && <td className="px-3 py-2.5">{r.nguoi_kd?.full_name || <span className="text-slate-300">—</span>}</td>}
                      <td className="px-3 py-2.5 text-center">{(r.soct_lenh_xuat_ct || []).length}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-800">{fmtVnd(cardTong(r))} đ</td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${tt.cls}`}>{tt.label}</span>
                        {r.so_hoa_don && <div className="text-[10px] text-emerald-600 font-mono mt-0.5">HĐ {r.so_hoa_don}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        {editable ? (
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => openEdit(r)} title="Sửa lệnh" className="p-1 rounded text-amber-600 hover:bg-amber-50"><PenSquare className="w-4 h-4" /></button>
                            <button onClick={() => setDelTarget(r)} title="Xóa lệnh" className="p-1 rounded text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        ) : <span className="text-[10px] text-slate-400 italic">đã bàn giao</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal tạo/sửa */}
      {open && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl my-6 flex flex-col max-h-[92vh] overflow-hidden border border-slate-200">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><FileText className="w-5 h-5 text-blue-600" />{editingId ? 'Sửa lệnh xuất hàng' : 'Tạo lệnh xuất hàng'}</h3>
              <button onClick={() => setOpen(false)} disabled={submitting} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/80 p-3.5 rounded-lg border border-slate-200">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Ngày lập</label>
                  <DateField value={form.ngay} onChange={v => setForm({ ...form, ngay: v })} heightClass="h-8" className="w-full" />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Số lệnh</label>
                  <Input value={form.so_lenh} onChange={e => setForm({ ...form, so_lenh: e.target.value })} placeholder="(tùy chọn)" className="h-8 bg-white" />
                </div>
                <div className="col-span-2 sm:col-span-2">
                  <label className="block text-slate-600 font-semibold mb-1">Tên khách hàng <span className="text-rose-500">*</span></label>
                  <Input value={form.ten_khach_hang} onChange={e => setForm({ ...form, ten_khach_hang: e.target.value })} placeholder="Tên khách mua hàng..." className="h-8 bg-white" />
                </div>
                <div className="col-span-2">
                  <label className="block text-slate-600 font-semibold mb-1">Địa chỉ</label>
                  <Input value={form.dia_chi} onChange={e => setForm({ ...form, dia_chi: e.target.value })} placeholder="Địa chỉ xuất hóa đơn..." className="h-8 bg-white" />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Mã số thuế</label>
                  <Input value={form.ma_so_thue} onChange={e => setForm({ ...form, ma_so_thue: e.target.value })} placeholder="MST..." className="h-8 font-mono bg-white" />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Số hợp đồng</label>
                  <Input value={form.so_hop_dong} onChange={e => setForm({ ...form, so_hop_dong: e.target.value })} placeholder="VD: 260922/KH-ST" className="h-8 bg-white" />
                </div>
                <div className="col-span-2 sm:col-span-2">
                  <label className="block text-slate-600 font-semibold mb-1">Ghi chú</label>
                  <Input value={form.ghi_chu} onChange={e => setForm({ ...form, ghi_chu: e.target.value })} placeholder="..." className="h-8 bg-white" />
                </div>
              </div>

              <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-blue-900 uppercase text-xs">Danh sách hàng ({lines.length} dòng)</span>
                  <Button type="button" variant="outline" onClick={addLine} className="h-7 text-[11px] px-2 text-blue-700 border-blue-200 hover:bg-blue-100/50"><Plus className="w-3.5 h-3.5 mr-1" /> Thêm dòng</Button>
                </div>
                <div className="grid grid-cols-12 gap-1.5 px-0.5 text-[10px] font-semibold uppercase text-blue-700/70">
                  <div className="col-span-2">Mã hàng</div><div className="col-span-3">Tên hàng</div><div className="col-span-1 text-center">ĐVT</div>
                  <div className="col-span-1 text-center">SL</div><div className="col-span-2 text-right">Đơn giá</div><div className="col-span-1 text-center">VAT%</div>
                  <div className="col-span-1 text-right">Thành tiền</div><div className="col-span-1"></div>
                </div>
                {lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                    <div className="col-span-2">
                      <MayCombo value={l.ma_hang} catalog={catalog}
                        onChangeMa={(v) => updLine(i, 'ma_hang', v)}
                        onPick={(it) => setLines(prev => { const n = [...prev]; n[i] = { ...n[i], ma_hang: it.ma_hang, ten_hang: it.ten_hang || '', dvt: it.dvt || 'Cái', don_gia: (n[i].don_gia === '' || n[i].don_gia == null || Number(n[i].don_gia) === 0) ? (Number(it.don_gia_niem_yet) || '') : n[i].don_gia }; return n })} />
                    </div>
                    <div className="col-span-3"><Input value={l.ten_hang} onChange={e => updLine(i, 'ten_hang', e.target.value)} placeholder="Tên hàng" className="h-7 text-xs" /></div>
                    <div className="col-span-1"><Input value={l.dvt} onChange={e => updLine(i, 'dvt', e.target.value)} className="h-7 text-xs text-center px-1" /></div>
                    <div className="col-span-1"><Input type="number" value={l.so_luong} onChange={e => updLine(i, 'so_luong', e.target.value)} className="h-7 text-xs text-center px-1 font-bold text-blue-700" /></div>
                    <div className="col-span-2"><Input type="number" value={l.don_gia} onChange={e => updLine(i, 'don_gia', e.target.value)} placeholder="0" className="h-7 text-xs text-right" /></div>
                    <div className="col-span-1"><Input type="number" value={l.vat} onChange={e => updLine(i, 'vat', e.target.value)} className="h-7 text-xs text-center px-1" /></div>
                    <div className="col-span-1 text-right text-[11px] font-semibold text-slate-700">{fmtVnd(lineTotal(l))}</div>
                    <div className="col-span-1 flex justify-center"><button type="button" onClick={() => rmLine(i)} className="text-slate-300 hover:text-rose-600" title="Xóa dòng"><X className="w-3.5 h-3.5" /></button></div>
                  </div>
                ))}
                <div className="pt-1.5 border-t border-dashed border-blue-100 text-right text-xs">
                  <span className="text-slate-500">Tổng chưa VAT: </span><span className="font-bold text-slate-800">{fmtVnd(formTong)} đ</span>
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5 shrink-0">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting} className="h-9 px-4 text-xs">Hủy</Button>
              <Button onClick={save} disabled={submitting} className="h-9 px-4 text-xs font-semibold gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"><Save className="w-4 h-4" />{submitting ? 'Đang lưu...' : (editingId ? 'Lưu cập nhật' : 'Tạo lệnh')}</Button>
            </div>
          </div>
        </div>
      )}

      {catOpen && <CatalogManager catalog={catalog} isManager={isManager} hangOptions={hangOptions} onClose={() => setCatOpen(false)} onChanged={loadCatalog} notify={notify} />}

      {/* Xác nhận xóa */}
      {delTarget && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4 border border-slate-200">
            <h3 className="text-base font-bold text-slate-800">Xác nhận xóa lệnh</h3>
            <p className="text-xs text-slate-500">Xóa lệnh xuất hàng của <b>{delTarget.ten_khach_hang}</b>? Không thể khôi phục.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDelTarget(null)} className="h-9 text-xs">Hủy</Button>
              <Button onClick={doDelete} className="h-9 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white">Xác nhận xóa</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
