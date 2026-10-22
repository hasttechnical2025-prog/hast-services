'use client'
import { useState, useEffect, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import DateField from "@/components/DateField"
import { Search, Plus, X, Trash2, Upload, RefreshCw, ChevronUp, ChevronDown, Phone, User, Headset, AlertTriangle, MapPin, History } from "lucide-react"
import { useConfirm } from "@/components/ConfirmDialog"
import { useRealtimeRefetch } from "@/lib/useRealtime"
import { CSKH_TOPIC, DATA_EVENT } from "@/lib/realtime"
import { usePaged, ListFrame } from "@/ui"

type Notify = (type: 'success' | 'error', msg: string) => void

const KENH = ['Điện thoại', 'Zalo', 'Email', 'Onsite', 'Khác']
const PHAN: Record<string, { label: string; chip: string; dot: string }> = {
  dang_dung: { label: 'Đang dùng', chip: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  nguy_co: { label: 'Nguy cơ', chip: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  da_mat: { label: 'Đã mất', chip: 'bg-red-50 text-red-600', dot: 'bg-red-500' },
}
const GIAI: Record<string, { label: string; cls: string }> = {
  chua_lien_he: { label: 'Chưa liên hệ', cls: 'text-slate-500' },
  da_lien_he: { label: 'Đã liên hệ', cls: 'text-blue-600' },
  quan_tam: { label: 'Quan tâm', cls: 'text-amber-700' },
  da_quay_lai: { label: 'Đã quay lại', cls: 'text-emerald-700 font-semibold' },
  tu_choi: { label: 'Từ chối', cls: 'text-slate-400' },
}
const GIAI_KEYS = ['chua_lien_he', 'da_lien_he', 'quan_tam', 'da_quay_lai', 'tu_choi']

const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase()
const fmtThang = (ym: any) => { const p = String(ym || '').slice(0, 7).split('-'); return p.length === 2 && p[0] ? `${p[1]}/${p[0]}` : '—' }
const fmtDate = (s: any) => { const p = String(s || '').slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '' }
const todayVN = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)

export default function CskhTool({ role = 'admin', showNotification }: { role?: string, showNotification: Notify }) {
  const isAdmin = role === 'admin'
  const { confirm, confirmNode } = useConfirm()
  const [rows, setRows] = useState<any[]>([])
  const [nguong, setNguong] = useState<{ nguyco: number; mat: number }>({ nguyco: 6, mat: 12 })
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [fPhan, setFPhan] = useState<'all' | 'dang_dung' | 'nguy_co' | 'da_mat'>('all')
  const [fGiai, setFGiai] = useState<string>('all')
  const [onlyChuaKhop, setOnlyChuaKhop] = useState(false)
  const [sortField, setSortField] = useState('lan_cuoi')
  const [sortAsc, setSortAsc] = useState(true)
  const [sel, setSel] = useState<any | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/cskh')
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Lỗi tải')
      setRows(j.data || [])
      if (j.nguong) setNguong(j.nguong)
    } catch (e: any) { showNotification('error', e.message || 'Lỗi tải danh sách') }
    finally { setLoading(false) }
  }, [showNotification])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch(CSKH_TOPIC, DATA_EVENT, load)

  const filtered = useMemo(() => {
    const kw = norm(q)
    let list = rows.filter(r => {
      if (fPhan !== 'all' && r.phan_loai !== fPhan) return false
      if (fGiai !== 'all' && r.giai_doan !== fGiai) return false
      if (onlyChuaKhop && r.khop_diem_may) return false
      if (kw) {
        const hay = norm(`${r.ma_may} ${r.ten_khach_hang} ${r.ten_cum} ${r.model} ${r.nguoi_lien_he} ${r.dien_thoai} ${r.vat_tu_gan_nhat}`)
        if (!hay.includes(kw)) return false
      }
      return true
    })
    const dir = sortAsc ? 1 : -1
    list = [...list].sort((a, b) => {
      const va = a[sortField] ?? '', vb = b[sortField] ?? ''
      if (sortField === 'so_lan_lay') return (Number(va) - Number(vb)) * dir
      return String(va).localeCompare(String(vb), 'vi') * dir
    })
    return list
  }, [rows, q, fPhan, fGiai, onlyChuaKhop, sortField, sortAsc])

  const paged = usePaged(filtered, 'cskh')
  const sortBy = (f: string) => { if (sortField === f) setSortAsc(a => !a); else { setSortField(f); setSortAsc(true) } }
  const Th = ({ f, label, align = 'left', w = '' }: { f: string; label: string; align?: string; w?: string }) => (
    <th onClick={() => sortBy(f)} className={`px-3 py-2.5 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 whitespace-nowrap text-${align} ${w} ${sortField === f ? 'text-blue-600 bg-blue-50/60' : ''}`}>
      <div className={`flex items-center gap-1 ${align === 'center' ? 'justify-center' : ''}`}>{label}{sortField === f && (sortAsc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}</div>
    </th>
  )

  const counts = useMemo(() => {
    const c = { dang_dung: 0, nguy_co: 0, da_mat: 0, chua_khop: 0 }
    for (const r of rows) { c[r.phan_loai as 'dang_dung']++; if (!r.khop_diem_may) c.chua_khop++ }
    return c
  }, [rows])

  const delMay = async (r: any, e?: any) => {
    e?.stopPropagation?.()
    if (!(await confirm(`Xóa máy ${r.ma_may} khỏi danh sách chăm sóc?`, { danger: true, confirmLabel: 'Xóa' }))) return
    try {
      const res = await fetch(`/api/admin/cskh?id=${r.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      showNotification('success', 'Đã xóa khỏi danh sách')
      load()
    } catch (err: any) { showNotification('error', err.message || 'Lỗi xóa') }
  }

  return (
    <div className="space-y-4">
      {confirmNode}
      <ListFrame paged={paged} unit="máy" toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm mã máy / khách / SĐT / vật tư…" className="h-9 pl-9 bg-white" />
          </div>
          <select value={fPhan} onChange={e => setFPhan(e.target.value as any)} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700">
            <option value="all">Phân loại: Tất cả ({rows.length})</option>
            <option value="dang_dung">Đang dùng ({counts.dang_dung})</option>
            <option value="nguy_co">Nguy cơ ({counts.nguy_co})</option>
            <option value="da_mat">Đã mất ({counts.da_mat})</option>
          </select>
          <select value={fGiai} onChange={e => setFGiai(e.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700">
            <option value="all">Giai đoạn: Tất cả</option>
            {GIAI_KEYS.map(k => <option key={k} value={k}>{GIAI[k].label}</option>)}
          </select>
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={onlyChuaKhop} onChange={e => setOnlyChuaKhop(e.target.checked)} className="w-4 h-4 accent-amber-600" />
            Chưa khớp điểm máy {counts.chua_khop > 0 && <span className="text-amber-600 font-semibold">({counts.chua_khop})</span>}
          </label>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={() => setAddOpen(true)} className="h-9 px-3 gap-1.5 text-xs"><Plus className="w-4 h-4" /> Thêm máy</Button>
            {isAdmin && <Button variant="outline" onClick={() => setImportOpen(true)} className="h-9 px-3 gap-1.5 text-xs"><Upload className="w-4 h-4" /> Import</Button>}
            <Button variant="outline" onClick={load} disabled={loading} title="Tải lại" className="h-9 px-3 gap-1.5 text-xs"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Tải lại</Button>
          </div>
        </div>
      }>
        <table className="w-full text-left text-xs text-slate-600">
          <thead className="bg-slate-50 text-slate-500 t2 font-semibold uppercase border-b border-slate-200 select-none">
            <tr>
              <Th f="ma_may" label="Mã máy" />
              <Th f="ten_khach_hang" label="Khách hàng" />
              <Th f="model" label="Model" />
              <Th f="vat_tu_gan_nhat" label="Vật tư gần nhất" />
              <Th f="lan_cuoi" label="Lần cuối" align="center" />
              <Th f="so_lan_lay" label="Lần" align="center" />
              <Th f="phan_loai" label="Phân loại" />
              <Th f="giai_doan" label="Giai đoạn" />
              <Th f="hen" label="Hẹn" align="center" />
              <th className="px-3 py-2.5 text-center">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={10} className="text-center py-10 text-slate-400"><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1.5 text-blue-600" />Đang tải…</td></tr>
            ) : paged.pageItems.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-10 text-slate-400 italic">{rows.length === 0 ? 'Chưa có dữ liệu. Bấm Import để nạp danh sách.' : 'Không khớp bộ lọc.'}</td></tr>
            ) : paged.pageItems.map(r => {
              const p = PHAN[r.phan_loai] || PHAN.dang_dung
              const henQuaHan = r.hen && r.hen < todayVN()
              return (
                <tr key={r.id} onClick={() => setSel(r)} className={`cursor-pointer hover:bg-blue-50/40 ${!r.khop_diem_may ? 'bg-amber-50/40' : ''}`}>
                  <td className="px-3 py-2 font-mono whitespace-nowrap">{r.ma_may}{!r.khop_diem_may && <AlertTriangle className="inline w-3.5 h-3.5 text-amber-500 ml-1" aria-label="chưa khớp điểm máy" />}</td>
                  <td className="px-3 py-2 max-w-[240px]">
                    <div className="truncate font-medium text-slate-700">{r.ten_khach_hang || '—'}{!r.khop_diem_may && <span className="text-[10px] text-amber-600 ml-1">(Excel)</span>}</div>
                    <div className="truncate text-[11px] text-slate-400">{r.dia_chi || ''}{r.ten_cum ? `${r.dia_chi ? ' · ' : ''}Cụm: ${r.ten_cum}` : ''}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.model || '—'}</td>
                  <td className="px-3 py-2 max-w-[160px] truncate">{r.vat_tu_gan_nhat || '—'}</td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">{fmtThang(r.lan_cuoi)}</td>
                  <td className="px-3 py-2 text-center">{r.so_lan_lay || 0}</td>
                  <td className="px-3 py-2"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${p.chip}`}><span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />{p.label}</span></td>
                  <td className={`px-3 py-2 whitespace-nowrap ${(GIAI[r.giai_doan] || GIAI.chua_lien_he).cls}`}>{(GIAI[r.giai_doan] || GIAI.chua_lien_he).label}</td>
                  <td className={`px-3 py-2 text-center whitespace-nowrap ${henQuaHan ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>{r.hen ? (henQuaHan ? 'quá hạn' : fmtDate(r.hen)) : '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-2.5">
                      <button onClick={e => { e.stopPropagation(); setSel(r) }} title="Ghi chăm sóc" className="text-blue-600 hover:text-blue-800"><Headset className="w-4 h-4" /></button>
                      {isAdmin && <button onClick={e => delMay(r, e)} title="Xóa khỏi danh sách" className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </ListFrame>

      {sel && <ProfileModal row={sel} role={role} onClose={() => setSel(null)} onChanged={load} showNotification={showNotification} confirm={confirm} />}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onDone={load} showNotification={showNotification} />}
      {addOpen && <AddModal onClose={() => setAddOpen(false)} onDone={load} showNotification={showNotification} />}
    </div>
  )
}

// ===== Hồ sơ máy =====
function ProfileModal({ row, role, onClose, onChanged, showNotification, confirm }: any) {
  const isAdmin = role === 'admin'
  const [detail, setDetail] = useState<{ logs: any[]; lichsu: any[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ ngay: todayVN(), kenh: 'Điện thoại', noi_dung: '', ket_qua: '', viec_tiep: '', ngay_hen: '' })
  const p = PHAN[row.phan_loai] || PHAN.dang_dung

  const loadDetail = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/cskh/log?ma_may=${encodeURIComponent(row.ma_may)}`)
      const j = await r.json()
      if (r.ok) setDetail({ logs: j.logs || [], lichsu: j.lichsu || [] })
    } catch { /* bỏ qua */ }
  }, [row.ma_may])
  useEffect(() => { loadDetail() }, [loadDetail])

  const put = async (patch: any) => {
    try {
      const r = await fetch('/api/admin/cskh', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, ...patch }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      onChanged()
    } catch (e: any) { showNotification('error', e.message || 'Lỗi lưu') }
  }
  const saveLog = async () => {
    if (!form.noi_dung.trim() && !form.ket_qua.trim()) { showNotification('error', 'Nhập nội dung chăm sóc'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/admin/cskh/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ma_may: row.ma_may, ...form }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      showNotification('success', 'Đã ghi chăm sóc')
      setForm({ ngay: todayVN(), kenh: 'Điện thoại', noi_dung: '', ket_qua: '', viec_tiep: '', ngay_hen: '' })
      await loadDetail(); onChanged()
    } catch (e: any) { showNotification('error', e.message || 'Lỗi ghi') } finally { setBusy(false) }
  }
  const delLog = async (id: number) => {
    if (!(await confirm('Xóa dòng nhật ký này?', { danger: true, confirmLabel: 'Xóa' }))) return
    try {
      const r = await fetch(`/api/admin/cskh/log?id=${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.json()).error)
      await loadDetail(); onChanged()
    } catch (e: any) { showNotification('error', e.message || 'Lỗi xóa') }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <button onClick={onClose} className="absolute top-3 right-3 z-10 text-slate-400 hover:text-slate-600" title="Đóng"><X className="w-5 h-5" /></button>
        <div className="flex items-start justify-between gap-3 p-4 pr-10 border-b border-slate-100 rounded-t-2xl flex-wrap shrink-0">
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-800 truncate">{row.ten_khach_hang || '(chưa rõ khách)'}{!row.khop_diem_may && <span className="text-xs text-amber-600 ml-1.5 font-normal">⚠ chưa khớp điểm máy</span>}</div>
            <div className="text-xs text-slate-500">Máy <b className="font-mono">{row.ma_may}</b>{row.model ? ` · ${row.model}` : ''}{row.ten_cum ? ` · Cụm: ${row.ten_cum}` : ''}</div>
            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3 flex-wrap">
              {row.dia_chi && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{row.dia_chi}</span>}
              {row.nguoi_lien_he && <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{row.nguoi_lien_he}</span>}
              {row.dien_thoai && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{row.dien_thoai}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && (
              <select value={row.phan_loai_tay ? row.phan_loai : 'auto'} onChange={e => put({ phan_loai: e.target.value })} className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs">
                <option value="auto">Phân loại: Tự suy ({p.label})</option>
                <option value="dang_dung">Đang dùng</option>
                <option value="nguy_co">Nguy cơ</option>
                <option value="da_mat">Đã mất</option>
              </select>
            )}
            <select value={row.giai_doan} onChange={e => put({ giai_doan: e.target.value })} className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs">
              {GIAI_KEYS.map(k => <option key={k} value={k}>{GIAI[k].label}</option>)}
            </select>
          </div>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[110px] bg-slate-50 rounded-lg px-3 py-2"><div className="text-[10px] text-slate-400 uppercase">Lần cuối lấy</div><div className="text-sm font-semibold">{fmtThang(row.lan_cuoi)}</div></div>
            <div className="flex-1 min-w-[110px] bg-slate-50 rounded-lg px-3 py-2"><div className="text-[10px] text-slate-400 uppercase">Số lần lấy</div><div className="text-sm font-semibold">{row.so_lan_lay || 0} lần</div></div>
            <div className="flex-1 min-w-[110px] bg-slate-50 rounded-lg px-3 py-2"><div className="text-[10px] text-slate-400 uppercase">Phân loại</div><div className={`text-sm font-semibold ${row.phan_loai === 'da_mat' ? 'text-red-600' : row.phan_loai === 'nguy_co' ? 'text-amber-700' : 'text-emerald-700'}`}>{p.label}</div></div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1"><History className="w-3.5 h-3.5" /> Lịch sử lấy hàng</div>
              <div className="border border-slate-100 rounded-lg divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {!detail ? <div className="p-3 text-xs text-slate-400">Đang tải…</div>
                  : detail.lichsu.length === 0 ? <div className="p-3 text-xs text-slate-400 italic">Chưa có lịch sử.</div>
                    : detail.lichsu.map((h, i) => (
                      <div key={i} className="flex justify-between gap-2 px-3 py-1.5 text-xs">
                        <span className="font-mono text-slate-500 shrink-0">{fmtThang(h.thang)}</span>
                        <span className="text-slate-600 text-right truncate">{h.vat_tu || '—'}</span>
                      </div>
                    ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-600 mb-1.5">Nhật ký chăm sóc</div>
              <div className="border border-slate-100 rounded-lg divide-y divide-slate-100 max-h-56 overflow-y-auto mb-2">
                {!detail ? <div className="p-3 text-xs text-slate-400">Đang tải…</div>
                  : detail.logs.length === 0 ? <div className="p-3 text-xs text-slate-400 italic">Chưa có lượt chăm sóc.</div>
                    : detail.logs.map(l => (
                      <div key={l.id} className="px-3 py-2 text-xs group">
                        <div className="flex justify-between items-center text-[10px] text-slate-400">
                          <span>{l.kenh || '—'} · {fmtDate(l.ngay)}{l.nguoi_ten ? ` · ${l.nguoi_ten}` : ''}</span>
                          <div className="flex items-center gap-2">
                            {l.ngay_hen && <span className="text-blue-600">→ hẹn {fmtDate(l.ngay_hen)}</span>}
                            <button onClick={() => delLog(l.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                        {l.noi_dung && <div className="text-slate-700 mt-0.5">{l.noi_dung}</div>}
                        {l.ket_qua && <div className="text-slate-500">Kết quả: {l.ket_qua}</div>}
                        {l.viec_tiep && <div className="text-slate-500">Việc tiếp: {l.viec_tiep}</div>}
                      </div>
                    ))}
              </div>
            </div>
          </div>

          {(
            <div className="bg-slate-50 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-600">Ghi lượt chăm sóc mới</div>
              <div className="flex flex-wrap gap-2">
                <label className="text-xs text-slate-500 flex items-center gap-1.5">Ngày<DateField value={form.ngay} onChange={v => setForm(f => ({ ...f, ngay: v }))} className="h-8 w-32 text-xs" /></label>
                <select value={form.kenh} onChange={e => setForm(f => ({ ...f, kenh: e.target.value }))} className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs">
                  {KENH.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <label className="text-xs text-slate-500 flex items-center gap-1.5">Hẹn lại<DateField value={form.ngay_hen} onChange={v => setForm(f => ({ ...f, ngay_hen: v }))} className="h-8 w-32 text-xs" /></label>
              </div>
              <Input value={form.noi_dung} onChange={e => setForm(f => ({ ...f, noi_dung: e.target.value }))} placeholder="Nội dung trao đổi…" className="h-8 text-xs bg-white" />
              <div className="flex gap-2">
                <Input value={form.ket_qua} onChange={e => setForm(f => ({ ...f, ket_qua: e.target.value }))} placeholder="Kết quả…" className="h-8 text-xs bg-white" />
                <Input value={form.viec_tiep} onChange={e => setForm(f => ({ ...f, viec_tiep: e.target.value }))} placeholder="Việc tiếp…" className="h-8 text-xs bg-white" />
              </div>
              <div className="flex justify-end">
                <Button onClick={saveLog} disabled={busy} className="h-8 px-4 gap-1.5 text-xs"><Plus className="w-4 h-4" /> Lưu lượt chăm sóc</Button>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end p-4 border-t border-slate-100 shrink-0">
          <Button variant="outline" onClick={onClose} className="h-9 px-5 text-xs">Đóng</Button>
        </div>
      </div>
    </div>
  )
}

// ===== Import (dán → Kiểm tra → Import) =====
const PHONE_RE = /0\d[\d.\s]{7,13}\d/
function cParseLienHe(raw: string) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim()
  const pm = s.match(PHONE_RE)
  const dien_thoai = pm ? pm[0].replace(/[^\d]/g, '') : ''
  const segs = s.split(/\s*[-–—]\s*/).map(x => x.trim()).filter(Boolean)
  const vat_tu = (segs[0] || s).slice(0, 120)
  const nameSeg = segs.find(x => PHONE_RE.test(x)) || (segs.length > 1 ? segs[segs.length - 1] : '')
  const nguoi = nameSeg.replace(new RegExp(PHONE_RE, 'g'), '').replace(/b[áa]o gi[áa][^-]*/i, '').replace(/[.\-\s]+$/, '').replace(/^[.\-\s]+/, '').trim()
  return { dien_thoai, nguoi: nguoi.slice(0, 60), vat_tu }
}
function cNormThang(v: any): string {
  const s = String(v || '').trim()
  let m = s.match(/(\d{4})[-/.](\d{1,2})/); if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}`
  m = s.match(/(\d{1,2})[-/.](\d{4})/); if (m) return `${m[2]}-${String(m[1]).padStart(2, '0')}`
  const d = new Date(s); if (!isNaN(d.getTime())) return d.toISOString().slice(0, 7)
  return ''
}

function ImportModal({ onClose, onDone, showNotification }: any) {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<any[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any | null>(null)

  const kiemTra = () => {
    setResult(null)
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (!lines.length) { showNotification('error', 'Dán dữ liệu vào ô trên'); return }
    const out: any[] = []
    for (const ln of lines) {
      const c = ln.split('\t')
      const ma = (c[0] || '').trim()
      if (/^mã\s*máy/i.test(ma)) continue  // bỏ dòng tiêu đề
      const ten = (c[1] || '').trim(), model = (c[2] || '').trim(), lienhe = (c[3] || '').trim(), thangRaw = (c[4] || '').trim()
      const thang = cNormThang(thangRaw)
      const pl = cParseLienHe(lienhe)
      let status: 'ok' | 'warn' | 'err' = 'ok', note = ''
      if (!ma) { status = 'err'; note = 'Thiếu mã máy' }
      else if (!thang) { status = 'warn'; note = 'Không đọc được tháng → chỉ cập nhật, không thêm lượt' }
      out.push({ ma, ten, model, lienhe, thangRaw, thang, ...pl, status, note })
    }
    if (!out.length) { showNotification('error', 'Không nhận được dòng nào (cần cột đầu là Mã máy)'); return }
    setPreview(out)
  }

  const doImport = async () => {
    const ok = (preview || []).filter(r => r.status !== 'err')
    if (!ok.length) { showNotification('error', 'Không có dòng hợp lệ để import'); return }
    setBusy(true)
    try {
      const rows = ok.map(r => ({ ma_may: r.ma, ten: r.ten, model: r.model, lienhe: r.lienhe, thang: r.thangRaw }))
      const r = await fetch('/api/admin/cskh/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      setResult(j)
      showNotification('success', `Import xong: ${j.may} máy, +${j.lichsu_them} lượt`)
      onDone()
    } catch (e: any) { showNotification('error', e.message || 'Lỗi import') } finally { setBusy(false) }
  }

  const stat = useMemo(() => {
    const p = preview || []
    const err = p.filter(r => r.status === 'err').length
    const warn = p.filter(r => r.status === 'warn').length
    const may = new Set(p.filter(r => r.status !== 'err').map(r => r.ma)).size
    return { tong: p.length, hople: p.length - err, err, warn, may }
  }, [preview])

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="font-semibold text-slate-800">Import danh sách lấy hàng</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          <p className="text-xs text-slate-500">Copy từ Excel rồi dán vào ô dưới. Thứ tự cột: <b>Mã máy</b> · Tên KH · Model · <b>Vật tư + Người liên hệ</b> · <b>Thời điểm lấy hàng</b>. Chỉ cần đúng cột 1, 4, 5 (tên/model tra tự động theo mã máy). Dòng tiêu đề tự bỏ qua. Bấm <b>Kiểm tra</b> để xem trước rồi <b>Import</b>.</p>
          <textarea value={text} onChange={e => { setText(e.target.value); setPreview(null); setResult(null) }} placeholder="35750&#9;CỤC CNTT…&#9;bizhub 550i&#9;01 hộp mực&#9;2024-07" rows={6} className="w-full text-xs font-mono border border-slate-200 rounded-lg p-2.5 bg-white outline-none focus:border-blue-500" />

          {preview && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="text-slate-600"><b className="text-slate-800">{stat.tong}</b> dòng</span>
                <span className="text-emerald-700"><b>{stat.hople}</b> hợp lệ</span>
                {stat.warn > 0 && <span className="text-amber-700"><b>{stat.warn}</b> thiếu tháng</span>}
                {stat.err > 0 && <span className="text-red-600"><b>{stat.err}</b> lỗi (bỏ qua)</span>}
                <span className="text-slate-500">→ <b className="text-slate-700">{stat.may}</b> máy</span>
              </div>
              <div className="border border-slate-200 rounded-lg overflow-auto max-h-64">
                <table className="w-full text-[11px] text-slate-600">
                  <thead className="bg-slate-50 text-slate-500 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left">#</th>
                      <th className="px-2 py-1.5 text-left">Mã máy</th>
                      <th className="px-2 py-1.5 text-center">Tháng</th>
                      <th className="px-2 py-1.5 text-left">Vật tư (tách)</th>
                      <th className="px-2 py-1.5 text-left">SĐT</th>
                      <th className="px-2 py-1.5 text-left">Người LH</th>
                      <th className="px-2 py-1.5 text-left">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.slice(0, 300).map((r, i) => (
                      <tr key={i} className={r.status === 'err' ? 'bg-red-50/60' : r.status === 'warn' ? 'bg-amber-50/50' : ''}>
                        <td className="px-2 py-1 text-slate-400">{i + 1}</td>
                        <td className="px-2 py-1 font-mono whitespace-nowrap">{r.ma || <span className="text-red-500 italic">—</span>}</td>
                        <td className="px-2 py-1 text-center whitespace-nowrap">{fmtThang(r.thang)}</td>
                        <td className="px-2 py-1 max-w-[150px] truncate" title={r.vat_tu}>{r.vat_tu || '—'}</td>
                        <td className="px-2 py-1 whitespace-nowrap">{r.dien_thoai || '—'}</td>
                        <td className="px-2 py-1 max-w-[110px] truncate" title={r.nguoi}>{r.nguoi || '—'}</td>
                        <td className={`px-2 py-1 ${r.status === 'err' ? 'text-red-600' : 'text-amber-600'}`}>{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 300 && <div className="text-[10px] text-slate-400 px-2 py-1 bg-slate-50">…và {preview.length - 300} dòng nữa (preview 300 dòng đầu, import vẫn đủ).</div>}
              </div>
            </div>
          )}

          {result && (
            <div className="text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-emerald-800">
              ✓ Đã import {result.may} máy · +{result.lichsu_them} lượt mới · khớp điểm máy: <b>{result.khop}</b> · chưa khớp: <b className={result.chua_khop ? 'text-amber-700' : ''}>{result.chua_khop}</b>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-slate-100">
          <Button variant="outline" onClick={onClose} className="h-9 text-xs">Đóng</Button>
          <Button variant="outline" onClick={kiemTra} disabled={busy} className="h-9 px-4 gap-1.5 text-xs">Kiểm tra</Button>
          <Button onClick={doImport} disabled={busy || !preview || stat.hople === 0 || !!result} className="h-9 px-4 gap-1.5 text-xs"><Upload className="w-4 h-4" /> {busy ? 'Đang import…' : `Import${preview ? ` (${stat.hople})` : ''}`}</Button>
        </div>
      </div>
    </div>
  )
}

// ===== Thêm máy tay =====
function AddModal({ onClose, onDone, showNotification }: any) {
  const [ma, setMa] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!ma.trim()) { showNotification('error', 'Nhập mã máy'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/admin/cskh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ma_may: ma.trim() }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      showNotification('success', 'Đã thêm máy')
      onDone(); onClose()
    } catch (e: any) { showNotification('error', e.message || 'Lỗi thêm') } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="font-semibold text-slate-800">Thêm máy vào CSKH</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block text-xs font-semibold text-slate-600">Mã máy
            <Input value={ma} onChange={e => setMa(e.target.value)} placeholder="VD: 35750" className="h-9 mt-1 bg-white" />
          </label>
          <p className="text-[11px] text-slate-400">Tên khách / model / địa chỉ sẽ tự tra từ điểm máy (nếu mã máy có trong app).</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} className="h-9 text-xs">Hủy</Button>
            <Button onClick={save} disabled={busy} className="h-9 px-4 gap-1.5 text-xs"><Plus className="w-4 h-4" /> Thêm</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
