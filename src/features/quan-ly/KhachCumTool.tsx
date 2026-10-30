'use client'
import { useState, useEffect, useMemo } from 'react'
import { Users, Boxes, Package, Plus, Search, PenSquare, Trash2, X, FileSpreadsheet, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ConfirmDialog'
import { StatCard, StatRow, BoxLoading, usePaged, ListFrame } from '@/ui'

// Port NGUYÊN KhachCumTool + DoiChieuMinvoiceModal từ admin (y hệt). Gọi lại /api/admin/khach-cum,
// /api/admin/doi-chieu-khach.
function DoiChieuMinvoiceModal({ onClose, showNotification, isAdmin }: { onClose: () => void, showNotification: (type: 'success' | 'error', msg: string) => void, isAdmin: boolean }) {
  const [scope, setScope] = useState<'both' | 'cum' | 'kd'>('both')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<any>(null)
  const [applying, setApplying] = useState('')
  const [bulkQhns, setBulkQhns] = useState(false)
  // Lọc dòng còn lệch (dùng chung cho apply đơn + bulk).
  const stillLech = (it: any) => it.ten_lech || it.dia_chi_lech || it.mst_lech || (it.email_thieu && it.email_thieu.length) || it.qhns_lech
  const apply = async (x: any, field: 'ten' | 'dia_chi' | 'email' | 'mst' | 'qhns', value: string) => {
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
          if (field === 'qhns') { n.qhns_app = value; n.qhns_lech = false }
          return n
        }).filter(stillLech)
        return { ...prev, lech }
      })
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setApplying('') }
  }
  // Áp HÀNG LOẠT QHNS: gom mọi dòng đang lệch QHNS (cụm KT) -> 1 request bulk.
  const qhnsLechItems = res ? res.lech.filter((x: any) => x.qhns_lech) : []
  const applyAllQhns = async () => {
    if (!qhnsLechItems.length) return
    setBulkQhns(true)
    try {
      const items = qhnsLechItems.map((x: any) => ({ key: x.key, value: x.qhns_mv }))
      const r = await fetch('/api/admin/doi-chieu-khach', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bulk: 'qhns', items }) })
      const j = await r.json()
      if (!r.ok) { showNotification('error', j.error || 'Lỗi áp'); return }
      showNotification('success', `Đã áp Mã QHNS cho ${j.count ?? items.length} cụm.`)
      const keys = new Set(items.map((i: any) => i.key))
      setRes((prev: any) => {
        if (!prev) return prev
        const lech = prev.lech.map((it: any) => keys.has(it.key) && it.qhns_lech ? { ...it, qhns_app: it.qhns_mv, qhns_lech: false } : it).filter(stillLech)
        return { ...prev, lech }
      })
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setBulkQhns(false) }
  }
  const ApBtn = ({ x, field, value }: { x: any, field: 'ten' | 'dia_chi' | 'email' | 'mst' | 'qhns', value: string }) => isAdmin
    ? <button onClick={() => apply(x, field, value)} disabled={applying === `${x.key}|${field}`} className="mt-1 h-6 px-2 rounded t3 font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">{applying === `${x.key}|${field}` ? '...' : 'Áp minVoice'}</button>
    : null
  const stripH = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim()
  const parse = (): { ten: string, dia_chi: string, mst: string, email: string, qhns: string }[] | null => {
    const lines = text.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim())
    if (lines.length < 2) return null
    const header = lines[0].split('\t').map(stripH)
    const find = (...keys: string[]) => header.findIndex(h => keys.some(k => h.includes(k)))
    const iTen = find('doi tuong', 'ten', 'khach'), iDc = find('dia chi'), iMst = find('ma so thue', 'mst'), iEmail = find('email')
    const iQhns = find('quan he ngan sach', 'qhns', 'ngan sach') // "Mã đơn vị QHNS" / "quan hệ ngân sách"
    if (iTen < 0) return null
    return lines.slice(1).map(l => { const c = l.split('\t'); return { ten: (c[iTen] || '').trim(), dia_chi: iDc >= 0 ? (c[iDc] || '').trim() : '', mst: iMst >= 0 ? (c[iMst] || '').trim() : '', email: iEmail >= 0 ? (c[iEmail] || '').trim() : '', qhns: iQhns >= 0 ? (c[iQhns] || '').trim() : '' } }).filter(r => r.ten)
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
    <div className="fixed inset-0 bg-slate-900/60 z-[70] flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl my-6 flex flex-col max-h-[92vh] overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Đối chiếu khách minVoice ↔ app</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-3 flex-1 text-xs">
          <p className="t2 text-slate-500 leading-relaxed">Copy từ Excel minVoice (gồm <b>dòng tiêu đề</b>: Tên Đối Tượng · Địa Chỉ · Mã Số Thuế · Email · Mã đơn vị QHNS) rồi dán vào đây. minVoice là <b>chuẩn</b> → báo chỗ <b>lệch</b> & <b>chưa có</b> trong app. <b>Mã QHNS</b> chỉ đối chiếu cho khách <b>cụm (KT)</b>; có thể bấm <b>Áp tất cả QHNS</b> để điền hàng loạt.</p>
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
              <div className="flex flex-wrap gap-2 t2">
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-semibold">Tổng: {res.tong}</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">Khớp đủ: {res.khop}</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">Lệch: {res.lech.length}</span>
                <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold">Chưa có trong app: {res.thieu.length}</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-400 border border-slate-200">Đã quét {res.so_ban_ghi} bản ghi app</span>
              </div>

              {res.lech.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <p className="t2 font-semibold text-amber-700">Lệch thông tin (minVoice ≠ app)</p>
                    {isAdmin && qhnsLechItems.length > 0 && (
                      <button onClick={applyAllQhns} disabled={bulkQhns} className="h-7 px-2.5 rounded-lg t3 font-semibold bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 shrink-0" title="Áp Mã QHNS từ minVoice cho tất cả cụm đang lệch">
                        {bulkQhns ? 'Đang áp…' : `Áp tất cả QHNS (${qhnsLechItems.length})`}
                      </button>
                    )}
                  </div>
                  <div className="border border-amber-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-left t2 text-slate-600">
                      <thead className="bg-amber-50 text-amber-800 sticky top-0 select-none"><tr>{thL('source', 'Nguồn · MST')}{thL('ten', 'Tên')}{thL('dia_chi', 'Địa chỉ')}<th className="px-2 py-1.5">Email thiếu</th><th className="px-2 py-1.5">Mã QHNS</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {lechSorted.map((x: any, i: number) => (
                          <tr key={i} className="align-top">
                            <td className="px-2 py-1.5 whitespace-nowrap">{srcBadge(x.source)} <span className="font-mono">{x.mst || '—'}</span>{x.mst_lech && <div className="text-rose-600 font-mono">app: {x.mst_app || '(trống)'}<ApBtn x={x} field="mst" value={x.mst} /></div>}</td>
                            <td className="px-2 py-1.5">{x.ten_lech ? <div><span className="text-slate-800">{x.ten_mv}</span><div className="text-rose-600">app: {x.ten_app || '(trống)'}</div><ApBtn x={x} field="ten" value={x.ten_mv} /></div> : <span className="text-slate-500">{x.ten_mv}</span>}</td>
                            <td className="px-2 py-1.5">{x.dia_chi_lech ? <div className="text-slate-800">{x.dia_chi_mv || '(trống)'}<div className="text-rose-600">app: {x.dia_chi_app || '(trống)'}</div><ApBtn x={x} field="dia_chi" value={x.dia_chi_mv} /></div> : <span className="text-emerald-600">khớp</span>}</td>
                            <td className="px-2 py-1.5">{x.email_thieu?.length ? <div className="text-rose-600">{x.email_thieu.join(', ')}<ApBtn x={x} field="email" value={x.email_mv} /></div> : <span className="text-emerald-600">đủ</span>}</td>
                            <td className="px-2 py-1.5">{x.qhns_lech ? <div className="text-slate-800 font-mono">{x.qhns_mv}<div className="text-rose-600">app: {x.qhns_app || '(trống)'}</div><ApBtn x={x} field="qhns" value={x.qhns_mv} /></div> : (x.source === 'KT' ? <span className="text-emerald-600">khớp</span> : <span className="text-slate-300">—</span>)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {res.thieu.length > 0 && (
                <div>
                  <p className="t2 font-semibold text-rose-700 mb-1">Chưa có trong app (cần tạo/gán MST)</p>
                  <div className="border border-rose-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-left t2 text-slate-600">
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
  const [clusters, setClusters] = useState<{ ma_khach_hang: string, ten_khach_hang: string, dia_chi: string, ma_so_thue?: string | null, ma_qhns?: string | null, email_ke_toan?: string | null, so_may: number, members: { id: string, ma_may: string, ten_khach_hang: string }[] }[]>([])
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [selMa, setSelMa] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [newMa, setNewMa] = useState(''), [newTen, setNewTen] = useState(''), [newDc, setNewDc] = useState('')
  const [edMa, setEdMa] = useState(''), [edTen, setEdTen] = useState(''), [edDc, setEdDc] = useState('')
  const [newMst, setNewMst] = useState(''), [newEmail, setNewEmail] = useState(''), [newQhns, setNewQhns] = useState('')
  const [edMst, setEdMst] = useState(''), [edEmail, setEdEmail] = useState(''), [edQhns, setEdQhns] = useState('')
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
    const dc = newDc.trim(), mst = newMst.trim(), email = newEmail.trim(), qhns = newQhns.trim()
    if (await call('POST', { ma_khach_hang: ma, ten_khach_hang: ten, dia_chi: dc, ma_so_thue: mst, ma_qhns: qhns, email_ke_toan: email })) {
      showNotification('success', 'Đã tạo cụm. Thêm máy vào cụm bên dưới.')
      setNewMa(''); setNewTen(''); setNewDc(''); setNewMst(''); setNewEmail(''); setNewQhns(''); setCreateOpen(false); await fetchClusters(); onUpdateSuccess()
      // Mở luôn modal Chỉnh sửa cụm vừa tạo -> user thêm máy ngay, không phải mở lại.
      setSelMa(ma); setEdMa(ma); setEdTen(ten); setEdDc(dc); setEdMst(mst); setEdEmail(email); setEdQhns(qhns); setPickIds([]); setMaySearch('')
    }
  }
  const saveEdit = async () => {
    if (!sel || !edTen.trim()) return showNotification('error', 'Tên không được để trống')
    const maMoi = edMa.trim()
    if (!maMoi) return showNotification('error', 'Mã khách hàng không được để trống')
    if (await call('PUT', { ma_khach_hang: sel.ma_khach_hang, ma_moi: maMoi, ten_khach_hang: edTen.trim(), dia_chi: edDc.trim(), ma_so_thue: edMst.trim(), ma_qhns: edQhns.trim(), email_ke_toan: edEmail.trim() })) {
      showNotification('success', 'Đã lưu thông tin cụm.'); setSelMa(null); await fetchClusters(); onUpdateSuccess()
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
  const [createOpen, setCreateOpen] = useState(false)
  const [sortField, setSortField] = useState<'ma' | 'ten' | 'dia_chi' | 'email' | 'so_may'>('ten')
  const [sortAsc, setSortAsc] = useState(true)
  const handleSort = (f: typeof sortField) => { sortField === f ? setSortAsc(p => !p) : (setSortField(f), setSortAsc(true)) }
  const cmpVi = (a: any, b: any) => String(a ?? '').localeCompare(String(b ?? ''), 'vi', { numeric: true, sensitivity: 'base' })
  const sortedCumList = useMemo(() => {
    const arr = [...cumList]
    arr.sort((a, b) => {
      let c = 0
      if (sortField === 'ma') c = cmpVi(a.ma_khach_hang, b.ma_khach_hang)
      else if (sortField === 'ten') c = cmpVi(a.ten_khach_hang, b.ten_khach_hang)
      else if (sortField === 'dia_chi') c = cmpVi(a.dia_chi, b.dia_chi)
      else if (sortField === 'email') c = cmpVi(a.email_ke_toan, b.email_ke_toan)
      else if (sortField === 'so_may') c = (Number(a.so_may) || 0) - (Number(b.so_may) || 0)
      if (c === 0) c = cmpVi(a.ten_khach_hang, b.ten_khach_hang)
      return sortAsc ? c : -c
    })
    return arr
  }, [cumList, sortField, sortAsc])
  const paged = usePaged(sortedCumList)
  const openCreate = () => { setNewMa(''); setNewTen(''); setNewDc(''); setNewMst(''); setNewEmail(''); setCreateOpen(true) }
  const openEdit = (c: typeof clusters[number]) => { setSelMa(c.ma_khach_hang); setEdMa(c.ma_khach_hang); setEdTen(c.ten_khach_hang); setEdDc(c.dia_chi || ''); setEdMst(c.ma_so_thue || ''); setEdQhns(c.ma_qhns || ''); setEdEmail(c.email_ke_toan || ''); setPickIds([]); setMaySearch('') }
  const thCum = (f: typeof sortField, label: string, w: string) => (
    <th onClick={() => handleSort(f)} className={`px-3 py-2.5 text-left cursor-pointer select-none transition-colors hover:bg-slate-100 ${w} ${sortField === f ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
      <span className="inline-flex items-center gap-1 align-middle">{label}{sortField === f && (sortAsc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}</span>
    </th>
  )

  return (
    <div className="space-y-6">
      {confirmNode}
      {doiChieuOpen && <DoiChieuMinvoiceModal onClose={() => setDoiChieuOpen(false)} showNotification={showNotification} isAdmin={currentUserRole === 'admin'} />}
      <StatRow>
        <StatCard label="Khách cụm" value={clusters.length.toLocaleString('vi-VN')} sub="một khách · nhiều máy" icon={Users} tone="blue" />
        <StatCard label="Máy đã gán cụm" value={assignedCount.toLocaleString('vi-VN')} sub="thuộc một cụm" icon={Boxes} tone="emerald" />
        <StatCard label="Máy chưa gán (lẻ)" value={unassigned.length.toLocaleString('vi-VN')} sub="coi như 1 khách - 1 máy" icon={Package} tone="amber" />
      </StatRow>

      <ListFrame paged={paged} unit="cụm" toolbar={
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Tìm mã / tên cụm..." className="pl-9 pr-7 bg-white h-9 text-xs" value={cumSearch} onChange={e => setCumSearch(e.target.value)} />
            {cumSearch && <button type="button" onClick={() => setCumSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-semibold" title="Xóa tìm kiếm">✕</button>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={openCreate} className="gap-1 h-9 text-xs shrink-0"><Plus className="w-4 h-4" /> Tạo cụm mới</Button>
            <Button variant="outline" onClick={() => setDoiChieuOpen(true)} className="gap-1.5 h-9 text-xs shrink-0"><FileSpreadsheet className="w-4 h-4" /> Đối chiếu minVoice</Button>
          </div>
        </div>
      }>
        <table className="w-full table-fixed text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200">
            <tr>
              {thCum('ma', 'Mã khách', 'w-[13%]')}
              {thCum('ten', 'Tên khách', 'w-[22%]')}
              {thCum('dia_chi', 'Địa chỉ hóa đơn', 'w-[27%]')}
              {thCum('email', 'Email hóa đơn', 'w-[20%]')}
              {thCum('so_may', 'Số máy', 'w-[9%]')}
              <th className="px-3 py-2.5 text-center w-[9%]">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center"><BoxLoading label="Đang tải khách cụm..." /></td></tr>
            ) : sortedCumList.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">{clusters.length === 0 ? 'Chưa có cụm nào. Bấm "Tạo cụm mới".' : 'Không khớp tìm kiếm.'}</td></tr>
            ) : paged.pageItems.map(c => (
              <tr key={c.ma_khach_hang} className="hover:bg-slate-50 align-top">
                <td className="px-3 py-2.5 font-mono text-xs text-slate-500 break-words">{c.ma_khach_hang}</td>
                <td className="px-3 py-2.5 font-medium text-slate-800 break-words">{c.ten_khach_hang}</td>
                <td className="px-3 py-2.5 text-slate-600 break-words">{c.dia_chi || <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2.5 text-xs text-slate-500 break-words">{c.email_ke_toan || <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2.5 text-center"><span className="inline-block min-w-[24px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">{c.so_may}</span></td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-center gap-1.5">
                    <button onClick={() => openEdit(c)} title="Chỉnh sửa cụm" className="text-blue-500 hover:text-blue-700 p-1.5 bg-blue-50 hover:bg-blue-100 rounded-md transition"><PenSquare className="w-4 h-4" /></button>
                    <button onClick={() => delCluster(c.ma_khach_hang)} title="Xóa cụm" className="text-red-500 hover:text-red-700 p-1.5 bg-red-50 hover:bg-red-100 rounded-md transition"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ListFrame>

      {/* MODAL TẠO CỤM MỚI */}
      {createOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><Plus className="w-5 h-5 text-blue-600" /> Tạo cụm khách mới</h3>
              <button onClick={() => setCreateOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>
            <div className="overflow-y-auto p-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Mã khách (số) *</label>
                  <Input placeholder="VD: 10992" className={`bg-white h-9 font-mono ${dupCluster ? 'border-amber-400 focus:ring-amber-400' : ''}`} value={newMa} onChange={e => setNewMa(e.target.value)} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-600">Tên khách hàng *</label>
                  <Input placeholder="Tên khách cụm" className="bg-white h-9" value={newTen} onChange={e => setNewTen(e.target.value)} />
                </div>
              </div>
              {dupCluster && (
                <p className="t2 text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">⚠ Mã <b>{dupCluster.ma_khach_hang}</b> đã dùng cho cụm: <b>{dupCluster.ten_khach_hang}</b>. Chọn mã khác.</p>
              )}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Địa chỉ <span className="font-normal text-slate-400">(xuất hóa đơn)</span></label>
                <Input placeholder="Địa chỉ hóa đơn" className="bg-white h-9" value={newDc} onChange={e => setNewDc(e.target.value)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Mã số thuế</label>
                  <Input placeholder="MST" className="bg-white h-9 font-mono" value={newMst} onChange={e => setNewMst(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600" title="Mã đơn vị quan hệ ngân sách (chỉ đơn vị hưởng ngân sách NN)">Mã QHNS</label>
                  <Input placeholder="— nếu có —" className="bg-white h-9 font-mono" value={newQhns} onChange={e => setNewQhns(e.target.value)} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-600">Email kế toán</label>
                  <Input placeholder="Email nhận hóa đơn" className="bg-white h-9" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="bg-slate-50 px-5 py-3 flex justify-end gap-2 border-t border-slate-100 shrink-0">
              <Button variant="outline" onClick={() => setCreateOpen(false)} className="h-9 text-xs">Hủy</Button>
              <Button onClick={addCluster} disabled={working || !!dupCluster} className="h-9 text-xs gap-1"><Plus className="w-4 h-4" /> Tạo cụm</Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CHỈNH SỬA CỤM */}
      {selMa && sel && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><PenSquare className="w-5 h-5 text-blue-600" /> Chỉnh sửa cụm <span className="font-mono text-sm text-slate-400">{sel.ma_khach_hang}</span></h3>
              <button onClick={() => setSelMa(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>
            <div className="overflow-y-auto p-5 space-y-5">

              <section className="space-y-3">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1.5 flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-slate-400" /> Thông tin cụm</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">Mã khách (số)</label>
                    <Input className="bg-white h-9 font-mono" value={edMa} onChange={e => setEdMa(e.target.value)} />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-600">Tên khách hàng</label>
                    <Input className="bg-white h-9" value={edTen} onChange={e => setEdTen(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Địa chỉ <span className="font-normal text-slate-400">(xuất hóa đơn)</span></label>
                  <Input className="bg-white h-9" value={edDc} onChange={e => setEdDc(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">Mã số thuế</label>
                    <Input className="bg-white h-9 font-mono" value={edMst} onChange={e => setEdMst(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600" title="Mã đơn vị quan hệ ngân sách (chỉ đơn vị hưởng ngân sách NN)">Mã QHNS</label>
                    <Input placeholder="— nếu có —" className="bg-white h-9 font-mono" value={edQhns} onChange={e => setEdQhns(e.target.value)} />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-600">Email kế toán</label>
                    <Input className="bg-white h-9" value={edEmail} onChange={e => setEdEmail(e.target.value)} />
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1.5 flex items-center gap-1.5"><Boxes className="w-3.5 h-3.5 text-slate-400" /> Máy trong cụm ({selMembers.length})</div>
                <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-52 overflow-y-auto">
                  {selMembers.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">Chưa có máy. Thêm ở dưới.</p>
                    : selMembers.map(m => (
                      <div key={m.id} className="flex items-start gap-2 px-3 py-2 text-sm">
                        <span className="text-xs font-mono text-slate-400 shrink-0 pt-0.5">{m.ma_may || '—'}</span>
                        <span className="flex-1 text-slate-700 break-words min-w-0">{m.ten_khach_hang}</span>
                        <button onClick={() => removeMay(m.id)} disabled={working} title="Gỡ khỏi cụm" className="text-slate-400 hover:text-red-600 shrink-0"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                </div>
              </section>

              <section className="space-y-2">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1.5 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5 text-slate-400" /> Thêm máy vào cụm <span className="normal-case tracking-normal font-normal text-slate-400">— chỉ máy lẻ chưa thuộc cụm</span></div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input placeholder="Tìm theo tên / mã máy / model..." className="pl-9 pr-7 bg-white h-9 text-xs" value={maySearch} onChange={e => setMaySearch(e.target.value)} />
                  {maySearch && <button type="button" onClick={() => setMaySearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-semibold" title="Xóa tìm kiếm">✕</button>}
                </div>
                {q && (
                  <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-52 overflow-y-auto">
                    {mayResults.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">Không có máy lẻ khớp.</p>
                      : mayResults.map(c => (
                        <label key={c.id} className="flex items-start gap-2 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">
                          <input type="checkbox" checked={pickIds.includes(c.id)} onChange={() => togglePick(c.id)} className="w-4 h-4 accent-blue-600 mt-0.5 shrink-0" />
                          <span className="text-xs font-mono text-slate-400 shrink-0 pt-0.5">{c.ma_may || '—'}</span>
                          <span className="flex-1 text-slate-700 break-words min-w-0">{c.ten_khach_hang}</span>
                        </label>
                      ))}
                  </div>
                )}
                {pickIds.length > 0 && (
                  <Button onClick={assignMay} disabled={working} className="gap-1 w-full bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> Gán {pickIds.length} máy vào cụm</Button>
                )}
              </section>
            </div>
            <div className="bg-slate-50 px-5 py-3 flex items-center justify-between gap-2 border-t border-slate-100 shrink-0">
              <Button variant="outline" onClick={() => delCluster(sel.ma_khach_hang)} className="h-9 text-xs gap-1.5 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400"><Trash2 className="w-4 h-4" /> Xóa cụm</Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setSelMa(null)} className="h-9 text-xs">Đóng</Button>
                <Button onClick={saveEdit} disabled={working} className="h-9 text-xs">Lưu thông tin</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
