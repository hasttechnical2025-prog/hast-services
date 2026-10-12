'use client'
import { useState, useEffect, useMemo } from 'react'
import { Users, Boxes, Package, Plus, Search, PenSquare, Trash2, X, FileSpreadsheet, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ConfirmDialog'
import { StatCard, StatRow, BoxLoading } from '@/ui'

// Port NGUYÊN KhachCumTool + DoiChieuMinvoiceModal từ admin (y hệt). Gọi lại /api/admin/khach-cum,
// /api/admin/doi-chieu-khach.
function DoiChieuMinvoiceModal({ onClose, showNotification, isAdmin }: { onClose: () => void, showNotification: (type: 'success' | 'error', msg: string) => void, isAdmin: boolean }) {
  const [scope, setScope] = useState<'both' | 'cum' | 'kd'>('both')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<any>(null)
  const [applying, setApplying] = useState('')
  const apply = async (x: any, field: 'ten' | 'dia_chi' | 'email' | 'mst', value: string) => {
    setApplying(`${x.key}|${field}`)
    try {
      const r = await fetch('/api/admin/doi-chieu-khach', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: x.source, key: x.key, field, value }) })
      const j = await r.json()
      if (!r.ok) { showNotification('error', j.error || 'Lỗi áp'); return }
      showNotification('success', 'Đã áp minVoice vào app.')
      setRes((prev: any) => {
        if (!prev) return prev
        const lech = prev.lech.map((it: any) => {
          if (it !== x) return it
          const n = { ...it }
          if (field === 'ten') { n.ten_app = value; n.ten_lech = false }
          if (field === 'dia_chi') { n.dia_chi_app = value; n.dia_chi_lech = false }
          if (field === 'email') { n.email_app = value; n.email_thieu = [] }
          if (field === 'mst') { n.mst_app = value; n.mst_lech = false }
          return n
        }).filter((it: any) => it.ten_lech || it.dia_chi_lech || it.mst_lech || (it.email_thieu && it.email_thieu.length))
        return { ...prev, lech }
      })
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setApplying('') }
  }
  const ApBtn = ({ x, field, value }: { x: any, field: 'ten' | 'dia_chi' | 'email' | 'mst', value: string }) => isAdmin
    ? <button onClick={() => apply(x, field, value)} disabled={applying === `${x.key}|${field}`} className="mt-1 h-6 px-2 rounded text-[10px] font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">{applying === `${x.key}|${field}` ? '...' : 'Áp minVoice'}</button>
    : null
  const stripH = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim()
  const parse = (): { ten: string, dia_chi: string, mst: string, email: string }[] | null => {
    const lines = text.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim())
    if (lines.length < 2) return null
    const header = lines[0].split('\t').map(stripH)
    const find = (...keys: string[]) => header.findIndex(h => keys.some(k => h.includes(k)))
    const iTen = find('doi tuong', 'ten', 'khach'), iDc = find('dia chi'), iMst = find('ma so thue', 'mst'), iEmail = find('email')
    if (iTen < 0) return null
    return lines.slice(1).map(l => { const c = l.split('\t'); return { ten: (c[iTen] || '').trim(), dia_chi: iDc >= 0 ? (c[iDc] || '').trim() : '', mst: iMst >= 0 ? (c[iMst] || '').trim() : '', email: iEmail >= 0 ? (c[iEmail] || '').trim() : '' } }).filter(r => r.ten)
  }
  const run = async () => {
    const rows = parse()
    if (!rows || !rows.length) { showNotification('error', 'Dán dữ liệu KÈM dòng tiêu đề (có cột Tên Đối Tượng...). Chưa đọc được.'); return }
    setBusy(true); setRes(null)
    try {
      const r = await fetch('/api/admin/doi-chieu-khach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows, scope }) })
      const j = await r.json()
      if (!r.ok) { showNotification('error', j.error || 'Lỗi đối chiếu'); return }
      setRes(j.data)
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setBusy(false) }
  }
  const srcBadge = (s: string) => <span className={`text-[9px] font-semibold px-1 py-0.5 rounded ${s === 'KT' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700'}`}>{s}</span>
  const cmpTxt = (a: any, b: any) => String(a ?? '').localeCompare(String(b ?? ''), 'vi', { numeric: true, sensitivity: 'base' })
  const [sl, setSl] = useState('source'); const [sla, setSla] = useState(true)
  const [st, setSt] = useState('ten'); const [sta, setSta] = useState(true)
  const sortByL = (f: string) => { sl === f ? setSla(p => !p) : (setSl(f), setSla(true)) }
  const sortByT = (f: string) => { st === f ? setSta(p => !p) : (setSt(f), setSta(true)) }
  const lechSorted = res ? [...res.lech].sort((a: any, b: any) => { let c = 0; if (sl === 'ten') c = cmpTxt(a.ten_mv, b.ten_mv); else if (sl === 'dia_chi') c = cmpTxt(a.dia_chi_mv, b.dia_chi_mv); else c = cmpTxt(a.source, b.source) || cmpTxt(a.mst, b.mst); if (c === 0) c = cmpTxt(a.ten_mv, b.ten_mv); return sla ? c : -c }) : []
  const thieuSorted = res ? [...res.thieu].sort((a: any, b: any) => { let c = 0; if (st === 'mst') c = cmpTxt(a.mst, b.mst); else if (st === 'dia_chi') c = cmpTxt(a.dia_chi, b.dia_chi); else c = cmpTxt(a.ten, b.ten); if (c === 0) c = cmpTxt(a.ten, b.ten); return sta ? c : -c }) : []
  const thL = (f: string, label: string) => <th onClick={() => sortByL(f)} className={`px-2 py-1.5 cursor-pointer select-none transition-colors hover:bg-amber-100 ${sl === f ? 'text-blue-700' : ''}`}><span className="inline-flex items-center gap-1">{label}{sl === f && (sla ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</span></th>
  const thT = (f: string, label: string) => <th onClick={() => sortByT(f)} className={`px-2 py-1.5 cursor-pointer select-none transition-colors hover:bg-rose-100 ${st === f ? 'text-blue-700' : ''}`}><span className="inline-flex items-center gap-1">{label}{st === f && (sta ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</span></th>
  return (
    <div className="fixed inset-0 bg-slate-900/60 z-[70] flex items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl my-6 flex flex-col max-h-[92vh] overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Đối chiếu khách minVoice ↔ app</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-3 flex-1 text-xs">
          <p className="text-[11px] text-slate-500 leading-relaxed">Copy từ Excel minVoice (gồm <b>dòng tiêu đề</b>: Tên Đối Tượng · Địa Chỉ · Mã Số Thuế · Email) rồi dán vào đây. minVoice là <b>chuẩn</b> → báo chỗ <b>lệch</b> & <b>chưa có</b> trong app (chỉ đọc, không ghi đè).</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-500">Đối chiếu với:</span>
            {([['both', 'Cả hai'], ['cum', 'Khách kỹ thuật'], ['kd', 'Khách kinh doanh']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setScope(k)} className={`h-8 px-3 rounded-lg text-xs font-semibold border ${scope === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}>{l}</button>
            ))}
          </div>
          <textarea value={text} onChange={e => { setText(e.target.value); setRes(null) }} rows={6} placeholder={"Dán ở đây (kèm dòng tiêu đề)…\nSTT\tMã DVKT\tTên Đối Tượng\tĐịa Chỉ\tMã Số Thuế\tEmail"} className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-200" />
          <div className="flex justify-end"><Button onClick={run} disabled={busy} className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">{busy ? 'Đang đối chiếu…' : 'Đối chiếu'}</Button></div>

          {res && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-semibold">Tổng: {res.tong}</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">Khớp đủ: {res.khop}</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">Lệch: {res.lech.length}</span>
                <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold">Chưa có trong app: {res.thieu.length}</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-400 border border-slate-200">Đã quét {res.so_ban_ghi} bản ghi app</span>
              </div>

              {res.lech.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-amber-700 mb-1">Lệch thông tin (minVoice ≠ app)</p>
                  <div className="border border-amber-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-left text-[11px] text-slate-600">
                      <thead className="bg-amber-50 text-amber-800 sticky top-0 select-none"><tr>{thL('source', 'Nguồn · MST')}{thL('ten', 'Tên')}{thL('dia_chi', 'Địa chỉ')}<th className="px-2 py-1.5">Email thiếu</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {lechSorted.map((x: any, i: number) => (
                          <tr key={i} className="align-top">
                            <td className="px-2 py-1.5 whitespace-nowrap">{srcBadge(x.source)} <span className="font-mono">{x.mst || '—'}</span>{x.mst_lech && <div className="text-rose-600 font-mono">app: {x.mst_app || '(trống)'}<ApBtn x={x} field="mst" value={x.mst} /></div>}</td>
                            <td className="px-2 py-1.5">{x.ten_lech ? <div><span className="text-slate-800">{x.ten_mv}</span><div className="text-rose-600">app: {x.ten_app || '(trống)'}</div><ApBtn x={x} field="ten" value={x.ten_mv} /></div> : <span className="text-slate-500">{x.ten_mv}</span>}</td>
                            <td className="px-2 py-1.5">{x.dia_chi_lech ? <div className="text-slate-800">{x.dia_chi_mv || '(trống)'}<div className="text-rose-600">app: {x.dia_chi_app || '(trống)'}</div><ApBtn x={x} field="dia_chi" value={x.dia_chi_mv} /></div> : <span className="text-emerald-600">khớp</span>}</td>
                            <td className="px-2 py-1.5">{x.email_thieu?.length ? <div className="text-rose-600">{x.email_thieu.join(', ')}<ApBtn x={x} field="email" value={x.email_mv} /></div> : <span className="text-emerald-600">đủ</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {res.thieu.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-rose-700 mb-1">Chưa có trong app (cần tạo/gán MST)</p>
                  <div className="border border-rose-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-left text-[11px] text-slate-600">
                      <thead className="bg-rose-50 text-rose-800 sticky top-0 select-none"><tr>{thT('ten', 'Tên')}{thT('mst', 'MST')}{thT('dia_chi', 'Địa chỉ')}</tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {thieuSorted.map((x: any, i: number) => (
                          <tr key={i}><td className="px-2 py-1.5">{x.ten}</td><td className="px-2 py-1.5 font-mono">{x.mst || '—'}</td><td className="px-2 py-1.5 text-slate-500 truncate max-w-[280px]">{x.dia_chi || '—'}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {res.lech.length === 0 && res.thieu.length === 0 && <p className="text-center text-emerald-600 py-4 font-semibold">Tất cả khớp — không có gì lệch. 🎉</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function KhachCumTool({ customers, onUpdateSuccess, showNotification, currentUserRole }: { customers: any[], onUpdateSuccess: () => void, showNotification: (type: 'success' | 'error', msg: string) => void, currentUserRole: string }) {
  const { confirm, confirmNode } = useConfirm()
  const [clusters, setClusters] = useState<{ ma_khach_hang: string, ten_khach_hang: string, dia_chi: string, ma_so_thue?: string | null, email_ke_toan?: string | null, so_may: number, members: { id: string, ma_may: string, ten_khach_hang: string }[] }[]>([])
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [selMa, setSelMa] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [newMa, setNewMa] = useState(''), [newTen, setNewTen] = useState(''), [newDc, setNewDc] = useState('')
  const [editing, setEditing] = useState(false), [edMa, setEdMa] = useState(''), [edTen, setEdTen] = useState(''), [edDc, setEdDc] = useState('')
  const [newMst, setNewMst] = useState(''), [newEmail, setNewEmail] = useState('')
  const [edMst, setEdMst] = useState(''), [edEmail, setEdEmail] = useState('')
  const [cumSearch, setCumSearch] = useState(''), [maySearch, setMaySearch] = useState('')
  const [pickIds, setPickIds] = useState<string[]>([])

  const fetchClusters = async () => {
    try {
      const res = await fetch('/api/admin/khach-cum'); const j = await res.json()
      if (res.ok) { setClusters(j.data || []); setAssignedIds(new Set<string>(j.assignedIds || [])) }
      else showNotification('error', j.error)
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setLoading(false) }
  }
  useEffect(() => { fetchClusters() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const unassigned = useMemo(() => customers.filter(c => c.ma_may && !assignedIds.has(c.id)), [customers, assignedIds])
  const assignedCount = assignedIds.size

  const sel = clusters.find(c => c.ma_khach_hang === selMa) || null
  const selMembers = sel ? sel.members : []
  const q = maySearch.trim().toLowerCase()
  const mayResults = q
    ? unassigned.filter(c => `${c.ten_khach_hang || ''} ${c.ma_may || ''} ${c.model || ''}`.toLowerCase().includes(q)).slice(0, 50)
    : []
  const dupCluster = newMa.trim() ? clusters.find(c => c.ma_khach_hang === newMa.trim()) : null

  const call = async (method: string, body?: any, qs = '') => {
    setWorking(true)
    try {
      const res = await fetch('/api/admin/khach-cum' + qs, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { showNotification('error', j.error || 'Lỗi'); return false }
      return true
    } catch { showNotification('error', 'Lỗi kết nối!'); return false } finally { setWorking(false) }
  }

  const addCluster = async () => {
    const ma = newMa.trim(), ten = newTen.trim()
    if (!ma || !ten) return showNotification('error', 'Nhập mã và tên khách hàng')
    if (dupCluster) return showNotification('error', `Mã ${ma} đã dùng cho cụm: ${dupCluster.ten_khach_hang}`)
    if (await call('POST', { ma_khach_hang: ma, ten_khach_hang: ten, dia_chi: newDc.trim(), ma_so_thue: newMst.trim(), email_ke_toan: newEmail.trim() })) {
      showNotification('success', 'Đã tạo cụm.'); setNewMa(''); setNewTen(''); setNewDc(''); setNewMst(''); setNewEmail(''); setSelMa(ma); await fetchClusters()
    }
  }
  const saveEdit = async () => {
    if (!sel || !edTen.trim()) return showNotification('error', 'Tên không được để trống')
    const maMoi = edMa.trim()
    if (!maMoi) return showNotification('error', 'Mã khách hàng không được để trống')
    if (await call('PUT', { ma_khach_hang: sel.ma_khach_hang, ma_moi: maMoi, ten_khach_hang: edTen.trim(), dia_chi: edDc.trim(), ma_so_thue: edMst.trim(), email_ke_toan: edEmail.trim() })) {
      setEditing(false); if (maMoi !== sel.ma_khach_hang) setSelMa(maMoi); await fetchClusters(); onUpdateSuccess()
    }
  }
  const delCluster = async (ma: string) => {
    if (!(await confirm(`Xóa cụm ${ma}? Các máy trong cụm sẽ trở về "lẻ" (không mất máy, không mất phiếu).`, { confirmLabel: 'Xóa cụm', danger: true }))) return
    if (await call('DELETE', undefined, `?ma=${encodeURIComponent(ma)}`)) {
      showNotification('success', 'Đã xóa cụm.'); if (selMa === ma) setSelMa(null); await fetchClusters(); onUpdateSuccess()
    }
  }
  const assignMay = async () => {
    if (!selMa || pickIds.length === 0) return
    if (await call('PATCH', { ma_khach_cum: selMa, ids: pickIds })) {
      showNotification('success', `Đã gán ${pickIds.length} máy vào cụm.`); setPickIds([]); setMaySearch(''); await fetchClusters(); onUpdateSuccess()
    }
  }
  const removeMay = async (id: string) => {
    if (await call('PATCH', { ma_khach_cum: null, ids: [id] })) { await fetchClusters(); onUpdateSuccess() }
  }
  const togglePick = (id: string) => setPickIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  const cumList = clusters.filter(c => !cumSearch.trim() || `${c.ma_khach_hang} ${c.ten_khach_hang}`.toLowerCase().includes(cumSearch.trim().toLowerCase()))
  const [doiChieuOpen, setDoiChieuOpen] = useState(false)

  return (
    <div className="space-y-6">
      {confirmNode}
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setDoiChieuOpen(true)} className="gap-1.5 h-9 text-xs"><FileSpreadsheet className="w-4 h-4" /> Đối chiếu minVoice</Button>
      </div>
      {doiChieuOpen && <DoiChieuMinvoiceModal onClose={() => setDoiChieuOpen(false)} showNotification={showNotification} isAdmin={currentUserRole === 'admin'} />}
      <StatRow>
        <StatCard label="Khách cụm" value={clusters.length.toLocaleString('vi-VN')} sub="một khách · nhiều máy" icon={Users} tone="blue" />
        <StatCard label="Máy đã gán cụm" value={assignedCount.toLocaleString('vi-VN')} sub="thuộc một cụm" icon={Boxes} tone="emerald" />
        <StatCard label="Máy chưa gán (lẻ)" value={unassigned.length.toLocaleString('vi-VN')} sub="coi như 1 khách - 1 máy" icon={Package} tone="amber" />
      </StatRow>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CỘT TRÁI: danh sách cụm + tạo cụm */}
        <div className="border border-slate-200 rounded-lg p-5 bg-slate-50/50 space-y-4">
          <h3 className="text-base font-semibold text-slate-700">Danh sách khách cụm</h3>
          <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tạo cụm mới</p>
            <div className="flex gap-2">
              <Input placeholder="Mã KH (số)" className={`bg-white w-32 shrink-0 ${dupCluster ? 'border-amber-400 focus:ring-amber-400' : ''}`} value={newMa} onChange={e => setNewMa(e.target.value)} />
              <Input placeholder="Tên khách hàng" className="bg-white" value={newTen} onChange={e => setNewTen(e.target.value)} />
            </div>
            {dupCluster && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">⚠ Mã <b>{dupCluster.ma_khach_hang}</b> đã dùng cho cụm: <b>{dupCluster.ten_khach_hang}</b>. Chọn mã khác.</p>
            )}
            <Input placeholder="Địa chỉ (xuất hóa đơn)" className="bg-white" value={newDc} onChange={e => setNewDc(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Mã số thuế" className="bg-white" value={newMst} onChange={e => setNewMst(e.target.value)} />
              <Input placeholder="Email kế toán" className="bg-white" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
            </div>
            <Button onClick={addCluster} disabled={working || !!dupCluster} className="gap-1 w-full"><Plus className="w-4 h-4" /> Tạo cụm</Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Tìm mã / tên cụm..." className="pl-9 pr-7 bg-white h-9 text-xs" value={cumSearch} onChange={e => setCumSearch(e.target.value)} />
            {cumSearch && <button type="button" onClick={() => setCumSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-semibold" title="Xóa tìm kiếm">✕</button>}
          </div>

          <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
            {loading ? <BoxLoading className="py-6" />
              : cumList.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">Chưa có cụm nào. Tạo ở trên.</p>
                : cumList.map(c => (
                  <button key={c.ma_khach_hang} onClick={() => { setSelMa(c.ma_khach_hang); setEditing(false); setPickIds([]); setMaySearch('') }}
                    className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 flex items-center gap-2 ${selMa === c.ma_khach_hang ? 'bg-blue-50/70' : ''}`}>
                    <span className="text-xs font-mono text-slate-400 shrink-0">{c.ma_khach_hang}</span>
                    <span className="flex-1 text-sm font-medium text-slate-800 truncate">{c.ten_khach_hang}</span>
                    <span className="text-xs text-slate-500 shrink-0 whitespace-nowrap">{c.so_may} máy</span>
                  </button>
                ))}
          </div>
        </div>

        {/* CỘT PHẢI: chi tiết cụm đang chọn */}
        <div className="border border-slate-200 rounded-lg p-5 bg-slate-50/50 space-y-4">
          {!sel ? (
            <div className="text-sm text-slate-400 text-center py-16">Chọn một cụm bên trái để xem &amp; gán máy.</div>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  {editing ? (
                    <div className="space-y-2">
                      <Input className="bg-white w-40" value={edMa} onChange={e => setEdMa(e.target.value)} placeholder="Mã KH (số)" />
                      <Input className="bg-white" value={edTen} onChange={e => setEdTen(e.target.value)} placeholder="Tên khách hàng" />
                      <Input className="bg-white" value={edDc} onChange={e => setEdDc(e.target.value)} placeholder="Địa chỉ" />
                      <div className="grid grid-cols-2 gap-2">
                        <Input className="bg-white" value={edMst} onChange={e => setEdMst(e.target.value)} placeholder="Mã số thuế" />
                        <Input className="bg-white" value={edEmail} onChange={e => setEdEmail(e.target.value)} placeholder="Email kế toán" />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={saveEdit} disabled={working} className="h-8 text-xs px-3">Lưu</Button>
                        <Button variant="outline" onClick={() => setEditing(false)} className="h-8 text-xs px-3">Hủy</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-400">{sel.ma_khach_hang}</span>
                        <h3 className="text-base font-semibold text-slate-800 truncate">{sel.ten_khach_hang}</h3>
                      </div>
                      {sel.dia_chi && <p className="text-sm text-slate-500 mt-0.5">{sel.dia_chi}</p>}
                      <div className="flex gap-3 mt-1.5 flex-wrap">
                        {sel.ma_so_thue && <p className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">MST: {sel.ma_so_thue}</p>}
                        {sel.email_ke_toan && <p className="text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Email: {sel.email_ke_toan}</p>}
                      </div>
                    </>
                  )}
                </div>
                {!editing && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => { setEditing(true); setEdMa(sel.ma_khach_hang); setEdTen(sel.ten_khach_hang); setEdDc(sel.dia_chi || ''); setEdMst(sel.ma_so_thue || ''); setEdEmail(sel.email_ke_toan || '') }} className="text-blue-500 hover:text-blue-700 p-1"><PenSquare className="w-4 h-4" /></button>
                    <button onClick={() => delCluster(sel.ma_khach_hang)} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              </div>

              {/* Máy trong cụm */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Máy trong cụm ({selMembers.length})</p>
                <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-52 overflow-y-auto">
                  {selMembers.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">Chưa có máy. Thêm ở dưới.</p>
                    : selMembers.map(m => (
                      <div key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <span className="text-xs font-mono text-slate-400 shrink-0">{m.ma_may || '—'}</span>
                        <span className="flex-1 text-slate-700 truncate">{m.ten_khach_hang}</span>
                        <button onClick={() => removeMay(m.id)} disabled={working} title="Gỡ khỏi cụm" className="text-slate-400 hover:text-red-600 shrink-0"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                </div>
              </div>

              {/* Thêm máy (từ danh sách máy chưa gán) */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Thêm máy vào cụm (chỉ hiện máy chưa thuộc cụm nào)</p>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input placeholder="Tìm theo tên / mã máy / model..." className="pl-9 pr-7 bg-white h-9 text-xs" value={maySearch} onChange={e => setMaySearch(e.target.value)} />
                  {maySearch && <button type="button" onClick={() => setMaySearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-semibold" title="Xóa tìm kiếm">✕</button>}
                </div>
                {q && (
                  <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-52 overflow-y-auto">
                    {mayResults.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">Không có máy lẻ khớp.</p>
                      : mayResults.map(c => (
                        <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">
                          <input type="checkbox" checked={pickIds.includes(c.id)} onChange={() => togglePick(c.id)} className="w-4 h-4 accent-blue-600" />
                          <span className="text-xs font-mono text-slate-400 shrink-0">{c.ma_may || '—'}</span>
                          <span className="flex-1 text-slate-700 truncate">{c.ten_khach_hang}</span>
                        </label>
                      ))}
                  </div>
                )}
                {pickIds.length > 0 && (
                  <Button onClick={assignMay} disabled={working} className="gap-1 w-full mt-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> Gán {pickIds.length} máy vào cụm</Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
