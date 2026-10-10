'use client'
import { useState, useEffect, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import DateField from "@/components/DateField"
import { Search, Plus, X, Trash2, Clock, ChevronUp, ChevronDown, Phone, Users } from "lucide-react"

type Notify = (type: 'success' | 'error', msg: string) => void

const KENH = ['Điện thoại', 'Zalo', 'Email', 'Onsite', 'Khác']
const TT_TN: Record<string, { label: string, cls: string }> = {
  moi: { label: 'Mới', cls: 'bg-slate-100 text-slate-600' },
  dang_tiep_can: { label: 'Đang tiếp cận', cls: 'bg-amber-50 text-amber-700' },
  thanh_khach: { label: 'Thành khách', cls: 'bg-emerald-50 text-emerald-700' },
  khong_thanh: { label: 'Không thành', cls: 'bg-rose-50 text-rose-600' },
}
const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase()
const fmtDate = (s: any) => { const p = String(s || '').slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '' }
// Ẩn email nội bộ @sieuthanh.com.vn khỏi phần HIỂN THỊ (dữ liệu gốc giữ nguyên).
const cleanEmails = (s: any) => String(s ?? '').split(/[;,]/).map(x => x.trim()).filter(x => x && !/@sieuthanh\.com\.vn$/i.test(x)).join('; ')
const todayVN = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)

export default function CskhTool({ role = 'admin', showNotification }: { role?: string, showNotification: Notify }) {
  const isAdmin = role === 'admin'
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [loaiFilter, setLoaiFilter] = useState<'all' | 'cum' | 'tiem_nang'>('all')
  const [sortField, setSortField] = useState('hen')
  const [sortAsc, setSortAsc] = useState(true)
  const [sel, setSel] = useState<any | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/cskh'); const j = await r.json()
      if (r.ok) setRows(j.data || []); else showNotification('error', j.error || 'Lỗi tải danh sách CSKH')
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setLoading(false) }
  }, [showNotification])
  useEffect(() => { load() }, [load])

  const today = todayVN()
  const handleSort = (f: string) => { if (sortField === f) setSortAsc(p => !p); else { setSortField(f); setSortAsc(true) } }
  const list = useMemo(() => {
    const kw = norm(q).trim()
    const cmp = (a: any, b: any) => String(a ?? '').localeCompare(String(b ?? ''), 'vi', { numeric: true, sensitivity: 'base' })
    let arr = rows.filter(r => {
      if (loaiFilter !== 'all' && r.loai !== loaiFilter) return false
      if (kw && !norm(`${r.ten_khach_hang} ${r.dien_thoai} ${r.dia_chi} ${r.email}`).includes(kw)) return false
      return true
    })
    arr = [...arr].sort((a, b) => {
      let c = 0
      if (sortField === 'ten') c = cmp(a.ten_khach_hang, b.ten_khach_hang)
      else if (sortField === 'loai') c = cmp(a.loai, b.loai)
      else if (sortField === 'lan_cham') c = cmp(a.lan_cham || '', b.lan_cham || '')
      else if (sortField === 'so_lan') c = (a.so_lan || 0) - (b.so_lan || 0)
      else if (sortField === 'hen') { // null xuống cuối bất kể chiều
        if (!a.hen && !b.hen) c = 0; else if (!a.hen) return 1; else if (!b.hen) return -1; else c = cmp(a.hen, b.hen)
      }
      if (c === 0) c = cmp(a.ten_khach_hang, b.ten_khach_hang)
      return sortAsc ? c : -c
    })
    return arr
  }, [rows, q, loaiFilter, sortField, sortAsc])

  const sortTh = (field: string, label: string, extra = '') => (
    <th onClick={() => handleSort(field)} className={`px-2.5 py-2 cursor-pointer select-none transition-colors hover:bg-slate-100 ${extra} ${sortField === field ? 'text-blue-600 bg-blue-50/60' : ''}`}>
      <span className={`inline-flex items-center gap-1 ${extra.includes('text-right') ? 'justify-end' : extra.includes('text-center') ? 'justify-center' : ''}`}>{label}{sortField === field && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</span>
    </th>
  )
  const henCls = (hen: string | null) => !hen ? '' : hen < today ? 'text-rose-600 font-semibold' : hen === today ? 'text-amber-600 font-semibold' : 'text-slate-600'

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><Users className="w-4 h-4 text-blue-600" /> Chăm sóc khách hàng</h3>
          <p className="text-[11px] text-slate-500">Khách cụm kỹ thuật + khách tiềm năng. Ghi nhật ký chăm sóc, đặt việc hẹn để không bỏ sót.</p>
        </div>
        {isAdmin && <Button onClick={() => setAddOpen(true)} className="ml-auto h-9 gap-1.5 text-xs"><Plus className="w-4 h-4" /> Thêm khách tiềm năng</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs"><Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" /><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm tên / SĐT / địa chỉ…" className="h-9 pl-9 bg-white" /></div>
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs">
          {([['all', 'Tất cả'], ['cum', 'Khách cụm'], ['tiem_nang', 'Tiềm năng']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setLoaiFilter(v)} className={`px-3 h-9 font-semibold border-l first:border-l-0 border-slate-200 ${loaiFilter === v ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{l}</button>
          ))}
        </div>
        <span className="text-xs text-slate-500 ml-auto">{list.length} khách</span>
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-left text-xs text-slate-600">
          <thead className="bg-slate-50 text-slate-500 text-[11px] font-semibold uppercase border-b border-slate-200 select-none">
            <tr>
              {sortTh('ten', 'Khách hàng')}
              {sortTh('loai', 'Loại', 'text-center')}
              <th className="px-2.5 py-2">Liên hệ</th>
              {sortTh('lan_cham', 'Chăm sóc gần nhất', 'text-center')}
              {sortTh('hen', 'Hẹn kế tiếp', 'text-center')}
              {sortTh('so_lan', 'Số lần', 'text-center')}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Đang tải…</td></tr>
              : list.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Không có khách khớp.</td></tr>
                : list.map(r => (
                  <tr key={r.key} onClick={() => setSel(r)} className="hover:bg-blue-50/50 cursor-pointer">
                    <td className="px-2.5 py-1.5"><div className="font-medium text-slate-800">{r.ten_khach_hang}</div>{r.dia_chi && <div className="text-[10px] text-slate-400 truncate max-w-[280px]">{r.dia_chi}</div>}</td>
                    <td className="px-2.5 py-1.5 text-center">
                      {r.loai === 'cum'
                        ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">Cụm</span>
                        : <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TT_TN[r.trang_thai]?.cls || 'bg-slate-100 text-slate-600'}`}>{TT_TN[r.trang_thai]?.label || 'Tiềm năng'}</span>}
                    </td>
                    <td className="px-2.5 py-1.5 text-[11px] align-top"><div className="max-w-[220px] break-words leading-snug">{[r.dien_thoai, cleanEmails(r.email)].filter(Boolean).join(' · ') || <span className="text-slate-300">—</span>}</div></td>
                    <td className="px-2.5 py-1.5 text-center">{r.lan_cham ? fmtDate(r.lan_cham) : <span className="text-slate-300">Chưa</span>}</td>
                    <td className={`px-2.5 py-1.5 text-center ${henCls(r.hen)}`}>{r.hen ? fmtDate(r.hen) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-2.5 py-1.5 text-center">{r.so_lan || 0}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {sel && <ProfileModal row={sel} isAdmin={isAdmin} onClose={() => setSel(null)} onChanged={load} showNotification={showNotification} />}
      {addOpen && <AddTiemNangModal onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load() }} showNotification={showNotification} />}
    </div>
  )
}

// ===== Hồ sơ khách: thông tin + nhật ký chăm sóc + ghi log + (tiềm năng) sửa/pipeline =====
function ProfileModal({ row, isAdmin, onClose, onChanged, showNotification }: { row: any, isAdmin: boolean, onClose: () => void, onChanged: () => void, showNotification: Notify }) {
  const isTN = row.loai === 'tiem_nang'
  const [logs, setLogs] = useState<any[]>([])
  const [loadingLog, setLoadingLog] = useState(true)
  const emptyLog = { ngay: todayVN(), kenh: 'Điện thoại', noi_dung: '', ket_qua: '', viec_tiep: '', ngay_hen: '' }
  const [f, setF] = useState(emptyLog)
  const [saving, setSaving] = useState(false)
  // Sửa khách tiềm năng
  const [edit, setEdit] = useState({ ten_khach_hang: row.ten_khach_hang || '', nguoi_lien_he: row.nguoi_lien_he || '', dien_thoai: row.dien_thoai || '', email: row.email || '', dia_chi: row.dia_chi || '', nguon: row.nguon || '', trang_thai: row.trang_thai || 'moi', ghi_chu: row.ghi_chu || '' })
  const [savingEdit, setSavingEdit] = useState(false)

  const fetchLogs = useCallback(async () => {
    setLoadingLog(true)
    try {
      const url = isTN ? `/api/admin/cskh/log?tn=${row.id}` : `/api/admin/cskh/log?cum=${encodeURIComponent(row.ma_khach_cum)}`
      const r = await fetch(url); const j = await r.json()
      if (r.ok) setLogs(j.data || [])
    } catch { } finally { setLoadingLog(false) }
  }, [isTN, row])
  useEffect(() => { fetchLogs() }, [fetchLogs])

  const saveLog = async () => {
    if (!f.noi_dung.trim() && !f.ket_qua.trim() && !f.viec_tiep.trim()) { showNotification('error', 'Nhập nội dung / kết quả / việc tiếp.'); return }
    setSaving(true)
    try {
      const body: any = { ...f, ...(isTN ? { tiem_nang_id: row.id } : { ma_khach_cum: row.ma_khach_cum }) }
      const r = await fetch('/api/admin/cskh/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json()
      if (!r.ok) { showNotification('error', j.error || 'Lỗi lưu'); return }
      showNotification('success', 'Đã ghi nhật ký chăm sóc.')
      setF(emptyLog); fetchLogs(); onChanged()
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setSaving(false) }
  }
  const delLog = async (id: number) => {
    if (!window.confirm('Xóa dòng nhật ký này?')) return
    try { const r = await fetch(`/api/admin/cskh/log?id=${id}`, { method: 'DELETE' }); if (r.ok) { fetchLogs(); onChanged() } } catch { }
  }
  const saveEdit = async () => {
    if (!edit.ten_khach_hang.trim()) { showNotification('error', 'Nhập tên khách'); return }
    setSavingEdit(true)
    try {
      const r = await fetch('/api/admin/cskh', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, ...edit }) })
      const j = await r.json()
      if (!r.ok) { showNotification('error', j.error || 'Lỗi lưu'); return }
      showNotification('success', 'Đã lưu thông tin khách.'); onChanged()
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setSavingEdit(false) }
  }
  const delTN = async () => {
    if (!window.confirm(`Ẩn khách tiềm năng "${row.ten_khach_hang}"?`)) return
    try { const r = await fetch(`/api/admin/cskh?id=${row.id}`, { method: 'DELETE' }); if (r.ok) { showNotification('success', 'Đã ẩn khách.'); onChanged(); onClose() } } catch { }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div>
            <h3 className="font-bold text-slate-800">{row.ten_khach_hang}</h3>
            <p className="text-xs text-slate-500">{isTN ? 'Khách tiềm năng' : 'Khách cụm kỹ thuật'}{row.dia_chi ? ` · ${row.dia_chi}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto overflow-x-hidden flex-1 min-h-0">
          {/* Thông tin khách tiềm năng (sửa được) */}
          {isTN && (
            <section className="bg-slate-50/70 border border-slate-200 rounded-lg p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase">Thông tin khách tiềm năng</span>
                {isAdmin && <button onClick={delTN} className="text-rose-600 hover:text-rose-700 text-xs inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Ẩn khách</button>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-12 gap-2.5 text-xs">
                <div className="sm:col-span-5"><label className="block text-slate-600 font-semibold mb-1">Tên khách *</label><Input value={edit.ten_khach_hang} onChange={e => setEdit({ ...edit, ten_khach_hang: e.target.value })} className="h-8 bg-white" /></div>
                <div className="sm:col-span-4"><label className="block text-slate-600 font-semibold mb-1">Người liên hệ</label><Input value={edit.nguoi_lien_he} onChange={e => setEdit({ ...edit, nguoi_lien_he: e.target.value })} className="h-8 bg-white" /></div>
                <div className="sm:col-span-3"><label className="block text-slate-600 font-semibold mb-1">Điện thoại/Zalo</label><Input value={edit.dien_thoai} onChange={e => setEdit({ ...edit, dien_thoai: e.target.value })} className="h-8 bg-white" /></div>
                <div className="sm:col-span-5"><label className="block text-slate-600 font-semibold mb-1">Email</label><Input value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value })} className="h-8 bg-white" /></div>
                <div className="sm:col-span-7"><label className="block text-slate-600 font-semibold mb-1">Địa chỉ</label><Input value={edit.dia_chi} onChange={e => setEdit({ ...edit, dia_chi: e.target.value })} className="h-8 bg-white" /></div>
                <div className="sm:col-span-4"><label className="block text-slate-600 font-semibold mb-1">Nguồn</label><Input value={edit.nguon} onChange={e => setEdit({ ...edit, nguon: e.target.value })} placeholder="giới thiệu / tự tìm / sự kiện…" className="h-8 bg-white" /></div>
                <div className="sm:col-span-4"><label className="block text-slate-600 font-semibold mb-1">Trạng thái</label>
                  <select value={edit.trang_thai} onChange={e => setEdit({ ...edit, trang_thai: e.target.value })} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs">
                    {Object.entries(TT_TN).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-4 flex items-end"><Button onClick={saveEdit} disabled={savingEdit} className="h-8 w-full text-xs">{savingEdit ? 'Đang lưu…' : 'Lưu thông tin'}</Button></div>
                <div className="sm:col-span-12"><label className="block text-slate-600 font-semibold mb-1">Ghi chú</label><Input value={edit.ghi_chu} onChange={e => setEdit({ ...edit, ghi_chu: e.target.value })} className="h-8 bg-white" /></div>
              </div>
            </section>
          )}
          {!isTN && cleanEmails(row.email) && (
            <section className="text-xs text-slate-600 flex flex-wrap gap-x-5 gap-y-1">
              <span><Phone className="w-3 h-3 inline -mt-0.5 mr-1 text-slate-400" />{cleanEmails(row.email)}</span>
            </section>
          )}

          {/* Ghi nhật ký chăm sóc mới */}
          <section className="border border-blue-200 rounded-lg p-3 space-y-2.5 bg-blue-50/30">
            <span className="text-[11px] font-semibold text-blue-700 uppercase">Ghi nhật ký chăm sóc</span>
            <div className="grid grid-cols-2 sm:grid-cols-12 gap-2.5 text-xs">
              <div className="sm:col-span-3"><label className="block text-slate-600 font-semibold mb-1">Ngày</label><DateField value={f.ngay} onChange={v => setF({ ...f, ngay: v })} heightClass="h-8" className="w-full" /></div>
              <div className="sm:col-span-3"><label className="block text-slate-600 font-semibold mb-1">Kênh</label>
                <select value={f.kenh} onChange={e => setF({ ...f, kenh: e.target.value })} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs">
                  {KENH.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div className="sm:col-span-6"><label className="block text-slate-600 font-semibold mb-1">Nội dung trao đổi</label><Input value={f.noi_dung} onChange={e => setF({ ...f, noi_dung: e.target.value })} className="h-8 bg-white" /></div>
              <div className="sm:col-span-4"><label className="block text-slate-600 font-semibold mb-1">Kết quả</label><Input value={f.ket_qua} onChange={e => setF({ ...f, ket_qua: e.target.value })} className="h-8 bg-white" /></div>
              <div className="sm:col-span-4"><label className="block text-slate-600 font-semibold mb-1">Việc cần làm tiếp</label><Input value={f.viec_tiep} onChange={e => setF({ ...f, viec_tiep: e.target.value })} className="h-8 bg-white" /></div>
              <div className="sm:col-span-4"><label className="block text-slate-600 font-semibold mb-1">Hẹn ngày</label><DateField value={f.ngay_hen} onChange={v => setF({ ...f, ngay_hen: v })} heightClass="h-8" className="w-full" /></div>
            </div>
            <div className="flex justify-end"><Button onClick={saveLog} disabled={saving} className="h-8 text-xs">{saving ? 'Đang lưu…' : '+ Ghi chăm sóc'}</Button></div>
          </section>

          {/* Lịch sử chăm sóc */}
          <section>
            <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1"><Clock className="w-3 h-3" /> Lịch sử chăm sóc ({logs.length})</span>
            {loadingLog ? <p className="text-xs text-slate-400 py-3">Đang tải…</p>
              : logs.length === 0 ? <p className="text-xs text-slate-400 py-3">Chưa có lần chăm sóc nào.</p>
                : <div className="mt-2 space-y-2">
                  {logs.map(l => (
                    <div key={l.id} className="border border-slate-200 rounded-lg p-2.5 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-700">{fmtDate(l.ngay)}</span>
                        {l.kenh && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{l.kenh}</span>}
                        <span className="text-slate-400">· {l.nguoi_ten || '—'}</span>
                        {l.ngay_hen && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 ml-1">Hẹn {fmtDate(l.ngay_hen)}</span>}
                        <button onClick={() => delLog(l.id)} className="ml-auto text-slate-300 hover:text-rose-600" title="Xóa"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      {l.noi_dung && <div className="mt-1 text-slate-700"><b>Nội dung:</b> {l.noi_dung}</div>}
                      {l.ket_qua && <div className="text-slate-600"><b>Kết quả:</b> {l.ket_qua}</div>}
                      {l.viec_tiep && <div className="text-blue-700"><b>Việc tiếp:</b> {l.viec_tiep}</div>}
                    </div>
                  ))}
                </div>}
          </section>
        </div>
      </div>
    </div>
  )
}

// ===== Thêm khách tiềm năng =====
function AddTiemNangModal({ onClose, onSaved, showNotification }: { onClose: () => void, onSaved: () => void, showNotification: Notify }) {
  const [f, setF] = useState({ ten_khach_hang: '', nguoi_lien_he: '', dien_thoai: '', email: '', dia_chi: '', nguon: '', ghi_chu: '' })
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!f.ten_khach_hang.trim()) { showNotification('error', 'Nhập tên khách'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/admin/cskh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
      const j = await r.json()
      if (!r.ok) { showNotification('error', j.error || 'Lỗi lưu'); return }
      showNotification('success', 'Đã thêm khách tiềm năng.'); onSaved()
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Thêm khách tiềm năng</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-3 text-xs">
          <div className="col-span-2"><label className="block text-slate-600 font-semibold mb-1">Tên khách *</label><Input value={f.ten_khach_hang} onChange={e => setF({ ...f, ten_khach_hang: e.target.value })} className="h-9 bg-white" /></div>
          <div><label className="block text-slate-600 font-semibold mb-1">Người liên hệ</label><Input value={f.nguoi_lien_he} onChange={e => setF({ ...f, nguoi_lien_he: e.target.value })} className="h-9 bg-white" /></div>
          <div><label className="block text-slate-600 font-semibold mb-1">Điện thoại/Zalo</label><Input value={f.dien_thoai} onChange={e => setF({ ...f, dien_thoai: e.target.value })} className="h-9 bg-white" /></div>
          <div><label className="block text-slate-600 font-semibold mb-1">Email</label><Input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} className="h-9 bg-white" /></div>
          <div><label className="block text-slate-600 font-semibold mb-1">Nguồn</label><Input value={f.nguon} onChange={e => setF({ ...f, nguon: e.target.value })} placeholder="giới thiệu / tự tìm…" className="h-9 bg-white" /></div>
          <div className="col-span-2"><label className="block text-slate-600 font-semibold mb-1">Địa chỉ</label><Input value={f.dia_chi} onChange={e => setF({ ...f, dia_chi: e.target.value })} className="h-9 bg-white" /></div>
          <div className="col-span-2"><label className="block text-slate-600 font-semibold mb-1">Ghi chú</label><Input value={f.ghi_chu} onChange={e => setF({ ...f, ghi_chu: e.target.value })} className="h-9 bg-white" /></div>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="h-9 text-xs">Hủy</Button>
          <Button onClick={save} disabled={saving} className="h-9 text-xs">{saving ? 'Đang lưu…' : 'Thêm khách'}</Button>
        </div>
      </div>
    </div>
  )
}
