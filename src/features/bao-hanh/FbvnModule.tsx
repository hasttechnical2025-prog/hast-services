'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useToast, SearchInput, ClearFilters } from '@/ui'
import { useConfirm } from '@/components/ConfirmDialog'
import DateField from '@/components/DateField'
import { useShared } from '@/features/_shell/SharedDataProvider'
import { onAirFromFob, isExpired, bhStatus, BH_STATUS_META } from '@/lib/bao-hanh'
import { Plus, Upload, FileDown, Download, FileText, ClipboardList, Pencil, Trash2, Search, ShieldCheck, AlertTriangle, X } from 'lucide-react'

type Tab = 'so' | 'plinvoice' | 'dmhang' | 'cauhinh'
const fmtVN = (iso: any) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : '' }
const dl = (id: string) => { const a = document.createElement('a'); a.href = id; a.click() }
// Tải CSV (BOM UTF-8) cho Excel đọc tiếng Việt đúng.
function downloadCSV(name: string, rows: string[][]) {
  const body = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url)
}
// Bóc dán Excel (TSV/CSV): tách dòng, mỗi dòng tách bằng TAB (ưu tiên) hoặc dấu phẩy.
function parsePaste(text: string): string[][] {
  return text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean)
    .map(l => (l.includes('\t') ? l.split('\t') : l.split(',')).map(c => c.replace(/^"|"$/g, '').trim()))
}

const lbl = 'block text-xs font-medium text-slate-500 mb-1'
const inp = 'w-full h-9 px-2.5 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white'

export function FbvnModule() {
  const [tab, setTab] = useState<Tab>('so')
  const { notify, toastNode } = useToast()
  const { confirm, confirmNode } = useConfirm()
  const { users, customers } = useShared()
  const ktvOptions = useMemo(() => (users || []).filter((u: any) => u.role === 'ktv' && u.active !== false).map((u: any) => u.full_name).filter(Boolean), [users])

  const [list, setList] = useState<any[]>([])
  const [plinvoice, setPlinvoice] = useState<any[]>([])
  const [dmhang, setDmhang] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, b, c] = await Promise.all([
        fetch('/api/admin/bao-hanh/fbvn').then(r => r.json()),
        fetch('/api/admin/bao-hanh/plinvoice').then(r => r.json()),
        fetch('/api/admin/bao-hanh/dmhang').then(r => r.json()),
      ])
      setList(a.data || []); setPlinvoice(b.data || []); setDmhang(c.data || [])
    } catch { notify('error', 'Lỗi tải dữ liệu') } finally { setLoading(false) }
  }, [notify])
  useEffect(() => { load() }, [load])

  const TABS: { k: Tab; label: string }[] = [
    { k: 'so', label: 'Sổ bảo hành' }, { k: 'plinvoice', label: 'PL-Invoice' },
    { k: 'dmhang', label: 'DM Hàng' }, { k: 'cauhinh', label: 'Cấu hình' },
  ]

  return (
    <div className="space-y-3">
      {/* Thanh tab con STICKY kiểu UNDERLINE trên NỀN XÁM (chuẩn chung v2, [[ui-tab-chau-kieu-a]]). */}
      <div className="sticky top-0 z-20 -mx-2 px-2 pt-1 bg-slate-200/95 backdrop-blur">
        <div className="bg-slate-200 -mx-2 px-2 flex gap-1 border-b border-slate-200 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition ${tab === t.k ? 'border-blue-600 text-blue-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'so' && <SoTab list={list} loading={loading} plinvoice={plinvoice} dmhang={dmhang} ktvOptions={ktvOptions} customers={customers} notify={notify} confirm={confirm} reload={load} />}
      {tab === 'plinvoice' && <PlInvoiceTab rows={plinvoice} notify={notify} confirm={confirm} reload={load} />}
      {tab === 'dmhang' && <DmHangTab rows={dmhang} notify={notify} confirm={confirm} reload={load} />}
      {tab === 'cauhinh' && <CauHinhTab />}
      {toastNode}{confirmNode}
    </div>
  )
}

// ─────────────────────────────── SỔ BẢO HÀNH ───────────────────────────────
function SoTab({ list, loading, plinvoice, dmhang, ktvOptions, customers, notify, confirm, reload }: any) {
  const [q, setQ] = useState('')
  const [fYear, setFYear] = useState('')
  const [fKtv, setFKtv] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: 'id', dir: -1 })
  const [editing, setEditing] = useState<any | null>(null)

  const years = useMemo(() => Array.from(new Set((list as any[]).map(r => String(r.ngay || '').slice(0, 4)).filter(Boolean))).sort().reverse(), [list])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let rows = (list as any[]).filter(r => {
      if (fYear && String(r.ngay || '').slice(0, 4) !== fYear) return false
      if (fKtv && r.ktv !== fKtv) return false
      if (fStatus && bhStatus(r) !== fStatus) return false
      if (needle) {
        const hay = `${r.serial || ''} ${r.product_code || ''} ${r.ten_claim || ''} ${r.model || ''} ${r.customer || ''} ${r.so_form_a || ''} ${r.fbvn_claim_no || ''}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
    const { k, dir } = sort
    rows = [...rows].sort((a, b) => {
      const va = a[k] ?? '', vb = b[k] ?? ''
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir
    })
    return rows
  }, [list, q, fYear, fKtv, fStatus, sort])

  const toggleSort = (k: string) => setSort(s => s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: 1 })
  const th = (k: string, label: string, cls = '') => (
    <th onClick={() => toggleSort(k)} className={`px-2.5 py-2 font-medium cursor-pointer select-none hover:text-blue-600 whitespace-nowrap ${cls}`}>
      {label}{sort.k === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  )

  const del = async (r: any) => {
    if (!(await confirm(`Xóa ca bảo hành (serial ${r.serial || '-'})?`, { confirmLabel: 'Xóa', danger: true }))) return
    const res = await fetch(`/api/admin/bao-hanh/fbvn?id=${r.id}`, { method: 'DELETE' })
    if (res.ok) { notify('success', 'Đã xóa'); reload() } else notify('error', 'Lỗi xóa')
  }
  const exportCSV = () => {
    const head = ['Số Form A', 'Ngày', 'KTV', 'Serial', 'Model', 'Mã VT', 'Tên claim', 'FOB', 'On-air', 'Tình trạng', 'Trạng thái', 'Số claim FBVN', 'Khách']
    const rows = filtered.map((r: any) => [r.so_form_a || '', fmtVN(r.ngay), r.ktv || '', r.serial || '', r.model || '', r.product_code || '', r.ten_claim || '', fmtVN(r.fob_date), fmtVN(r.on_air), r.contents || '', BH_STATUS_META[bhStatus(r)].label, r.fbvn_claim_no || '', r.customer || ''])
    downloadCSV('so-bao-hanh-fbvn.csv', [head, ...rows])
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center mb-2 px-1">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <SearchInput value={q} onChange={setQ} placeholder="Tìm serial, mã VT, khách, số…" />
        </div>
        <select value={fYear} onChange={e => setFYear(e.target.value)} className="h-9 px-2 rounded-md border border-slate-200 text-sm bg-white"><option value="">Mọi năm</option>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
        <select value={fKtv} onChange={e => setFKtv(e.target.value)} className="h-9 px-2 rounded-md border border-slate-200 text-sm bg-white"><option value="">Mọi KTV</option>{ktvOptions.map((k: string) => <option key={k} value={k}>{k}</option>)}</select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="h-9 px-2 rounded-md border border-slate-200 text-sm bg-white"><option value="">Mọi trạng thái</option>{Object.entries(BH_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <ClearFilters show={!!(q || fYear || fKtv || fStatus)} onClear={() => { setQ(''); setFYear(''); setFKtv(''); setFStatus('') }} />
        <div className="flex-1" />
        <button onClick={() => setEditing({})} className="h-9 px-3 rounded-md bg-blue-600 text-white text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-blue-700"><Plus className="w-4 h-4" />Thêm ca</button>
        <button onClick={exportCSV} className="h-9 px-3 rounded-md border border-slate-300 text-sm font-medium text-slate-700 inline-flex items-center gap-1.5 hover:bg-slate-50"><Download className="w-4 h-4" />CSV</button>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 px-1 mb-2">
        {Object.entries(BH_STATUS_META).map(([k, v]) => <span key={k} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: v.dot }} />{v.label}</span>)}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-slate-500 border-b border-slate-200">
            {th('so_form_a', 'Số')}{th('ngay', 'Ngày')}{th('ktv', 'KTV')}{th('serial', 'Serial')}{th('model', 'Model')}{th('product_code', 'Vật tư')}{th('on_air', 'On-air')}
            <th className="px-2.5 py-2 font-medium">Trạng thái</th>{th('customer', 'Khách')}<th className="px-2.5 py-2"></th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={10} className="text-center py-8 text-slate-400">Đang tải…</td></tr>
              : filtered.length === 0 ? <tr><td colSpan={10} className="text-center py-8 text-slate-400">Chưa có ca nào.</td></tr>
                : filtered.map((r: any) => {
                  const st = bhStatus(r); const meta = BH_STATUS_META[st]
                  const td = `px-2.5 py-1.5 ${meta.done ? 'text-slate-400 line-through' : 'text-slate-700'}`
                  return (
                    <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50" style={{ borderLeft: `3px solid ${meta.dot}` }}>
                      <td className={`${td} font-mono whitespace-nowrap`}>{r.so_form_a || '—'}</td>
                      <td className={td}>{fmtVN(r.ngay)}</td><td className={td}>{r.ktv || ''}</td>
                      <td className={`${td} font-mono`}>{r.serial || ''}</td><td className={td}>{r.model || ''}</td>
                      <td className={td}>{r.product_code || ''}<span className="text-slate-400"> {r.ten_claim ? `· ${r.ten_claim}` : ''}</span></td>
                      <td className={td}>{fmtVN(r.on_air)}</td>
                      <td className="px-2.5 py-1.5"><span className="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span></td>
                      <td className={td}>{r.customer || ''}</td>
                      <td className="px-2.5 py-1.5 whitespace-nowrap text-slate-500">
                        {r.co_claim && <button title="Xuất Form (A)" onClick={() => dl(`/api/admin/bao-hanh/form-a?id=${r.id}`)} className="hover:text-blue-600 mr-2"><FileText className="w-4 h-4 inline" /></button>}
                        {r.co_ban_giao && <button title="Xuất BB Bàn giao" onClick={() => dl(`/api/admin/bao-hanh/bb?id=${r.id}`)} className="hover:text-blue-600 mr-2"><ClipboardList className="w-4 h-4 inline" /></button>}
                        <button title="Sửa" onClick={() => setEditing(r)} className="hover:text-blue-600 mr-2"><Pencil className="w-4 h-4 inline" /></button>
                        <button title="Xóa" onClick={() => del(r)} className="hover:text-rose-600"><Trash2 className="w-4 h-4 inline" /></button>
                      </td>
                    </tr>
                  )
                })}
          </tbody>
        </table>
      </div>

      {editing && <FbvnForm initial={editing} list={list} plinvoice={plinvoice} dmhang={dmhang} ktvOptions={ktvOptions} customers={customers} notify={notify} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
    </div>
  )
}

// ─────────────────────────────── FORM 1 CA ───────────────────────────────
function FbvnForm({ initial, list, plinvoice, dmhang, ktvOptions, customers, notify, onClose, onSaved }: any) {
  const [f, setF] = useState<any>(() => ({
    co_claim: true, co_ban_giao: true, judg_goods: true, att_invoice: true, att_faulty: true, att_po: true,
    huong_giai_quyet: 'Trả hàng bảo hành', ...initial,
  }))
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))

  const serialTrim = String(f.serial || '').trim()
  // Serial LÀ khóa tra cứu: đổi serial → tự điền (hoặc XÓA) item_no/model/fob/invoice/do từ PL-Invoice.
  const onSerialChange = (serial: string) => {
    const hit = (plinvoice as any[]).find(p => String(p.serial) === serial.trim())
    setF((p: any) => ({ ...p, serial, item_no: hit?.item_no || '', model: hit?.model || '', fob_date: hit?.fob_date || '', invoice_no: hit?.invoice_no || '', do_no: hit?.do_no || '' }))
  }
  // Serial đã nhập nhưng KHÔNG có trong PL-Invoice → cảnh báo (không auto điền được máy).
  const serialNotFound = !!serialTrim && !(plinvoice as any[]).some(p => String(p.serial) === serialTrim)
  // Serial ĐÃ có ca bảo hành khác trong Sổ → cảnh báo trùng.
  const dupCases = useMemo(() => serialTrim ? (list as any[] || []).filter(r => String(r.serial) === serialTrim && r.id !== f.id) : [], [list, serialTrim, f.id])
  // Chọn mã vật tư → điền tên claim (từ DM Hàng).
  const lookupMa = (ma: string) => {
    const hit = (dmhang as any[]).find(d => String(d.ma_hang) === String(ma).trim())
    if (hit) setF((p: any) => ({ ...p, ten_claim: hit.ten_hang || p.ten_claim }))
  }
  const layKhach = (ten: string) => {
    const hit = (customers as any[]).find(c => c.ten_khach_hang === ten)
    if (hit) setF((p: any) => ({ ...p, customer: hit.ten_khach_hang, dia_chi: hit.dia_chi || hit.vi_tri_dat_may || p.dia_chi }))
  }

  const onAir = useMemo(() => onAirFromFob(f.fob_date), [f.fob_date])
  const expired = f.co_claim && onAir && isExpired(onAir)

  const save = async () => {
    if (expired) { notify(`Máy đã hết hạn bảo hành (On-air ${fmtVN(onAir)}) — không lập claim được. Bỏ tick "Claim hãng" nếu chỉ bàn giao.`, 'error'); return }
    setSaving(true)
    try {
      const method = f.id ? 'PUT' : 'POST'
      const res = await fetch('/api/admin/bao-hanh/fbvn', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
      const j = await res.json()
      if (!res.ok) { notify('error', j.error || 'Lỗi lưu'); return }
      notify('success', 'Đã lưu'); onSaved()
    } catch { notify('error', 'Lỗi lưu') } finally { setSaving(false) }
  }
  // Xuất Word: lưu trước rồi tải (đảm bảo bản ghi mới nhất + có số).
  const exportDoc = async (kind: 'form-a' | 'bb') => {
    if (expired && kind === 'form-a') { notify('error', 'Máy hết hạn BH — không xuất Form (A).'); return }
    setSaving(true)
    try {
      const method = f.id ? 'PUT' : 'POST'
      const res = await fetch('/api/admin/bao-hanh/fbvn', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
      const j = await res.json()
      if (!res.ok) { notify('error', j.error || 'Lỗi lưu'); return }
      const id = f.id || j.id
      dl(`/api/admin/bao-hanh/${kind}?id=${id}`)
      onSaved()
    } catch { notify('error', 'Lỗi') } finally { setSaving(false) }
  }

  const Chk = ({ k, label }: { k: string; label: string }) => (
    <label className="flex items-center gap-2 text-sm text-slate-700 py-0.5"><input type="checkbox" checked={!!f[k]} onChange={e => set(k, e.target.checked)} />{label}</label>
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="bg-slate-50 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-xl" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-white rounded-t-xl shrink-0">
          <div className="font-semibold text-slate-800">{f.id ? 'Sửa ca bảo hành' : 'Thêm ca bảo hành'}{f.so_form_a ? ` · ${f.so_form_a}` : ''}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="flex gap-4 items-center">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={!!f.co_claim} onChange={e => set('co_claim', e.target.checked)} /> ① Claim hãng (Form A)</label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={!!f.co_ban_giao} onChange={e => set('co_ban_giao', e.target.checked)} /> ② Bàn giao khách (BB)</label>
          </div>

          {f.co_claim && (
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="text-sm font-semibold text-blue-700">① Claim hãng → Form (A)</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><label className={lbl}>Ngày lập</label><DateField value={f.ngay || ''} onChange={v => set('ngay', v)} heightClass="h-9" className="w-full" /></div>
                <div><label className={lbl}>KTV (CE)</label><select value={f.ktv || ''} onChange={e => set('ktv', e.target.value)} className={inp}><option value="">—</option>{ktvOptions.map((k: string) => <option key={k} value={k}>{k}</option>)}</select></div>
                <div><label className={lbl}>Serial</label><input list="pl-serials" className={inp} value={f.serial || ''} onChange={e => onSerialChange(e.target.value)} placeholder="Tra PL-Invoice" />
                  <datalist id="pl-serials">{(plinvoice as any[]).slice(0, 500).map(p => <option key={p.id} value={p.serial}>{p.model}</option>)}</datalist></div>
                <div><label className={lbl}>Mã máy <span className="text-slate-300">(tự điền)</span></label><input readOnly tabIndex={-1} title="Tự điền từ PL-Invoice theo Serial" className={`${inp} bg-slate-100 text-slate-500 cursor-not-allowed`} value={f.item_no || ''} /></div>
                <div className="md:col-span-2"><label className={lbl}>Model <span className="text-slate-300">(tự điền)</span></label><input readOnly tabIndex={-1} className={`${inp} bg-slate-100 text-slate-500 cursor-not-allowed`} value={f.model || ''} /></div>
                <div><label className={lbl}>Invoice No <span className="text-slate-300">(tự điền)</span></label><input readOnly tabIndex={-1} className={`${inp} bg-slate-100 text-slate-500 cursor-not-allowed`} value={f.invoice_no || ''} /></div>
                <div><label className={lbl}>DO / PL <span className="text-slate-300">(tự điền)</span></label><input readOnly tabIndex={-1} className={`${inp} bg-slate-100 text-slate-500 cursor-not-allowed`} value={f.do_no || ''} /></div>
                <div><label className={lbl}>FOB Date <span className="text-slate-300">(tự điền)</span></label><input readOnly tabIndex={-1} className={`${inp} bg-slate-100 text-slate-500 cursor-not-allowed`} value={fmtVN(f.fob_date)} /></div>
                <div className="md:col-span-3 flex items-end">
                  {onAir ? (
                    <div className={`flex items-center gap-2 text-sm rounded-md px-3 h-9 border w-full ${expired ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-emerald-50 border-emerald-300 text-emerald-800'}`}>
                      {expired ? <AlertTriangle className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                      {expired ? `Hết bảo hành — On-air ${fmtVN(onAir)} (chặn lập claim)` : `Còn bảo hành — On-air ${fmtVN(onAir)}`}
                    </div>
                  ) : <div className="text-xs text-slate-400 h-9 flex items-end pb-2">On-air tự tính khi có FOB Date</div>}
                </div>
              </div>
              {serialNotFound && (
                <div className="flex items-start gap-2 text-sm rounded-md px-3 py-2 bg-amber-50 border border-amber-300 text-amber-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Serial <b>{serialTrim}</b> chưa có trong PL-Invoice — chưa tự điền được máy/FOB. Hãy thêm vào tab <b>PL-Invoice</b> trước (hoặc kiểm tra lại serial).</span>
                </div>
              )}
              {dupCases.length > 0 && (
                <div className="flex items-start gap-2 text-sm rounded-md px-3 py-2 bg-rose-50 border border-rose-300 text-rose-700">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Serial <b>{serialTrim}</b> đã có <b>{dupCases.length}</b> ca bảo hành: {dupCases.slice(0, 5).map((r: any) => `${r.so_form_a || '(chưa số)'}${r.ngay ? ' · ' + fmtVN(r.ngay) : ''}`).join(' ; ')}{dupCases.length > 5 ? '…' : ''}. Kiểm tra kẻo trùng.</span>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><label className={lbl}>Mã vật tư</label><input list="dm-ma" className={inp} value={f.product_code || ''} onChange={e => { set('product_code', e.target.value); lookupMa(e.target.value) }} />
                  <datalist id="dm-ma">{(dmhang as any[]).map(d => <option key={d.id} value={d.ma_hang}>{d.ten_hang}</option>)}</datalist></div>
                <div className="md:col-span-2"><label className={lbl}>Tên claim</label><input className={inp} value={f.ten_claim || ''} onChange={e => set('ten_claim', e.target.value)} /></div>
                <div><label className={lbl}>ĐVT</label><input className={inp} value={f.don_vi || ''} onChange={e => set('don_vi', e.target.value)} placeholder="piece" /></div>
                <div><label className={lbl}>Ngày hỏng</label><DateField value={f.defect_date || ''} onChange={v => set('defect_date', v)} heightClass="h-9" className="w-full" /></div>
                <div className="md:col-span-3"><label className={lbl}>Tình trạng (Contents)</label><input className={inp} value={f.contents || ''} onChange={e => set('contents', e.target.value)} /></div>
                <div className="md:col-span-4"><label className={lbl}>Nguyên nhân (Possible cause)</label><input className={inp} value={f.possible_cause || ''} onChange={e => set('possible_cause', e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><div className={lbl}>Judgment (CE)</div><Chk k="judg_install" label="Installation Confirmation" /><Chk k="judg_tech" label="Technical Evaluation by CE" /><Chk k="judg_goods" label="Goods Confirmation" /><Chk k="judg_info" label="Technical Information" /></div>
                <div><div className={lbl}>Attached material</div><Chk k="att_invoice" label="Commercial Invoice (Copy)" /><Chk k="att_faulty" label="Faulty Goods" /><Chk k="att_po" label="P/O (Copy)" /><Chk k="att_mhc" label="Machine history card" /><Chk k="att_sample" label="Faulty Copy Sample" /><Chk k="att_license" label="License for Software" /></div>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <div className={lbl}>Tiến trình</div>
                <div className="flex flex-wrap gap-4 items-center text-sm">
                  <Chk k="claim_sent" label="Đã gửi hãng" />
                  <span className="inline-flex items-center gap-2">Số claim FBVN <input className="h-8 px-2 rounded-md border border-slate-200 text-sm w-40" value={f.fbvn_claim_no || ''} onChange={e => set('fbvn_claim_no', e.target.value)} placeholder="hãng cấp sau…" /></span>
                  <Chk k="goods_received" label="Hàng về" />
                  <span className="inline-flex items-center gap-2 text-slate-500">ngày <DateField value={f.goods_received_date || ''} onChange={v => set('goods_received_date', v)} heightClass="h-8" className="w-32" /></span>
                  <Chk k="back_to_customer" label="Đã trả khách" />
                </div>
              </div>
            </div>
          )}

          {f.co_ban_giao && (
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="text-sm font-semibold text-blue-700">② Bàn giao khách → BB Bàn giao{f.so_bb ? ` · ${f.so_bb}` : ''}</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="md:col-span-2"><label className={lbl}>Khách hàng</label><input list="kh-list" className={inp} value={f.customer || ''} onChange={e => { set('customer', e.target.value); layKhach(e.target.value) }} />
                  <datalist id="kh-list">{(customers as any[]).slice(0, 500).map((c: any) => <option key={c.id} value={c.ten_khach_hang} />)}</datalist></div>
                <div className="md:col-span-2"><label className={lbl}>Địa chỉ</label><input className={inp} value={f.dia_chi || ''} onChange={e => set('dia_chi', e.target.value)} /></div>
                <div><label className={lbl}>Người liên hệ</label><input className={inp} value={f.nguoi_lien_he || ''} onChange={e => set('nguoi_lien_he', e.target.value)} /></div>
                <div><label className={lbl}>Điện thoại</label><input className={inp} value={f.dien_thoai || ''} onChange={e => set('dien_thoai', e.target.value)} /></div>
                <div><label className={lbl}>Counter (số đếm)</label><input className={inp} value={f.counter || ''} onChange={e => set('counter', e.target.value)} /></div>
                <div><label className={lbl}>Ngày hẹn trả</label><DateField value={f.ngay_hen_tra || ''} onChange={v => set('ngay_hen_tra', v)} heightClass="h-9" className="w-full" /></div>
                <div className="md:col-span-2"><label className={lbl}>Hướng giải quyết</label><input className={inp} value={f.huong_giai_quyet || ''} onChange={e => set('huong_giai_quyet', e.target.value)} /></div>
                <div className="md:col-span-2"><label className={lbl}>Ghi chú</label><input className={inp} value={f.ghi_chu || ''} onChange={e => set('ghi_chu', e.target.value)} /></div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-5 py-3 border-t border-slate-200 bg-white rounded-b-xl shrink-0 flex-wrap">
          <button disabled={saving} onClick={save} className="h-9 px-4 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">{saving ? 'Đang lưu…' : 'Lưu'}</button>
          {f.co_claim && <button disabled={saving} onClick={() => exportDoc('form-a')} className="h-9 px-3 rounded-md border border-slate-300 text-sm font-medium text-slate-700 inline-flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-60"><FileText className="w-4 h-4" />Xuất Form (A)</button>}
          {f.co_ban_giao && <button disabled={saving} onClick={() => exportDoc('bb')} className="h-9 px-3 rounded-md border border-slate-300 text-sm font-medium text-slate-700 inline-flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-60"><ClipboardList className="w-4 h-4" />Xuất BB Bàn giao</button>}
          <button onClick={onClose} className="h-9 px-3 rounded-md border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50 ml-auto">Đóng</button>
        </div>
      </div>
    </div>
  )
}

// Ngày hợp lệ? (dd/mm/yyyy hoặc yyyy-mm-dd)
const dateOk = (s: string) => !s || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s.trim()) || /^\d{4}-\d{2}-\d{2}/.test(s.trim())

// ─────────────────────────────── PL-INVOICE ───────────────────────────────
function PlInvoiceTab({ rows, notify, confirm, reload }: any) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    return (rows as any[]).filter(r => !n || `${r.serial} ${r.model} ${r.invoice_no} ${r.do_no} ${r.item_no}`.toLowerCase().includes(n))
  }, [rows, q])
  const tpl = () => downloadCSV('mau-pl-invoice.csv', [['DO No.', 'Item No. (mã máy)', 'Serial', 'Model', 'Date of Invoice (FOB)', 'Invoice No'], ['60004721', 'TM100216', '250020', 'Apeos 7580 (D-B610)', '24/09/2026', '1C26TAS-1172']])
  // Parse + kiểm tra: trả { items (hợp lệ), issues (dòng lỗi + lý do) }.
  const parseRows = (text: string) => {
    const lines = parsePaste(text)
    const start = lines.length && /serial/i.test(lines[0].join(' ')) ? 1 : 0
    const have = new Set((rows as any[]).map(r => String(r.serial)))
    const seen = new Set<string>()
    const items: any[] = [], issues: { line: number; reason: string }[] = []
    lines.slice(start).forEach((c, i) => {
      const ln = i + start + 1
      const it = { do_no: c[0] || '', item_no: c[1] || '', serial: (c[2] || '').trim(), model: c[3] || '', fob_date: (c[4] || '').trim(), invoice_no: c[5] || '' }
      if (!it.serial) { issues.push({ line: ln, reason: 'thiếu Serial' }); return }
      if (!dateOk(it.fob_date)) { issues.push({ line: ln, reason: `ngày FOB sai: "${it.fob_date}"` }); return }
      const dup = have.has(it.serial) || seen.has(it.serial)
      seen.add(it.serial)
      items.push({ ...it, _dup: dup })
    })
    return { items, issues }
  }
  const onCommit = async (items: any[]) => {
    const res = await fetch('/api/admin/bao-hanh/plinvoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) })
    const j = await res.json()
    if (res.ok) { notify('success', `Đã nhập ${j.count} dòng`); reload() } else notify('error', j.error || 'Lỗi')
  }
  const del = async (r: any) => { if (!(await confirm('Xóa dòng này?', { confirmLabel: 'Xóa', danger: true }))) return; const res = await fetch(`/api/admin/bao-hanh/plinvoice?id=${r.id}`, { method: 'DELETE' }); if (res.ok) reload() }

  // Cột On-air (FOB+12th cuối tháng) + cờ "Hết BH" (đỏ) nếu quá hạn.
  const onAirCell = (r: any) => {
    const oa = onAirFromFob(r.fob_date); if (!oa) return <span className="text-slate-300">—</span>
    const ex = isExpired(oa)
    return <span className={ex ? 'text-rose-600 font-medium' : 'text-slate-600'}>{fmtVN(oa)}{ex && <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-rose-100 text-rose-700">Hết BH</span>}</span>
  }
  return <RefTable title="PL-Invoice (dữ liệu giao hàng FUJIFILM)" q={q} setQ={setQ} onTpl={tpl} parseRows={parseRows} onCommit={onCommit} unit="dòng"
    columns={[['do_no', 'DO No.'], ['item_no', 'Mã máy'], ['serial', 'Serial'], ['model', 'Model'], ['fob_date', 'FOB', fmtVN], ['on_air', 'On-air', undefined, onAirCell], ['invoice_no', 'Invoice No']]} rows={filtered} onDel={del} />
}

// ─────────────────────────────── DM HÀNG ───────────────────────────────
function DmHangTab({ rows, notify, confirm, reload }: any) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => { const n = q.trim().toLowerCase(); return (rows as any[]).filter(r => !n || `${r.ma_hang} ${r.ten_hang} ${r.model}`.toLowerCase().includes(n)) }, [rows, q])
  const tpl = () => downloadCSV('mau-dm-hang.csv', [['Mã hàng', 'Tên hàng', 'Model', 'Ghi chú'], ['930K06510', 'CIS', 'Apeos 4570/5570', '']])
  const parseRows = (text: string) => {
    const lines = parsePaste(text)
    const start = lines.length && /mã hàng|ma_hang|ma hang/i.test(lines[0].join(' ')) ? 1 : 0
    const have = new Set((rows as any[]).map(r => String(r.ma_hang)))
    const seen = new Set<string>()
    const items: any[] = [], issues: { line: number; reason: string }[] = []
    lines.slice(start).forEach((c, i) => {
      const ln = i + start + 1
      const it = { ma_hang: (c[0] || '').trim(), ten_hang: c[1] || '', model: c[2] || '', ghi_chu: c[3] || '' }
      if (!it.ma_hang) { issues.push({ line: ln, reason: 'thiếu Mã hàng' }); return }
      const dup = have.has(it.ma_hang) || seen.has(it.ma_hang)
      seen.add(it.ma_hang)
      items.push({ ...it, _dup: dup })
    })
    return { items, issues }
  }
  const onCommit = async (items: any[]) => {
    const res = await fetch('/api/admin/bao-hanh/dmhang', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) })
    const j = await res.json()
    if (res.ok) { notify('success', `Đã nhập ${j.count} mã`); reload() } else notify('error', j.error || 'Lỗi')
  }
  const del = async (r: any) => { if (!(await confirm('Xóa mã này?', { confirmLabel: 'Xóa', danger: true }))) return; const res = await fetch(`/api/admin/bao-hanh/dmhang?id=${r.id}`, { method: 'DELETE' }); if (res.ok) reload() }
  return <RefTable title="DM Hàng (mã vật tư claim của hãng)" q={q} setQ={setQ} onTpl={tpl} parseRows={parseRows} onCommit={onCommit} unit="mã"
    columns={[['ma_hang', 'Mã hàng'], ['ten_hang', 'Tên hàng'], ['model', 'Model'], ['ghi_chu', 'Ghi chú']]} rows={filtered} onDel={del} />
}

// Bảng tra cứu dùng chung (PL-Invoice + DM Hàng): tìm · tải mẫu · nhập Excel (dán → XEM TRƯỚC → ghi) · bảng · xóa.
function RefTable({ title, q, setQ, onTpl, parseRows, onCommit, unit, columns, rows, onDel }: any) {
  const [paste, setPaste] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [preview, setPreview] = useState<{ items: any[]; issues: { line: number; reason: string }[] } | null>(null)
  const [committing, setCommitting] = useState(false)
  const resetImport = () => { setPaste(''); setShowPaste(false); setPreview(null) }
  const dupCount = preview ? preview.items.filter((x: any) => x._dup).length : 0

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center mb-2 px-1">
        <div className="text-sm font-semibold text-slate-700 mr-2">{title}</div>
        <div className="max-w-xs flex-1 min-w-[160px]"><SearchInput value={q} onChange={setQ} placeholder="Tìm…" /></div>
        <div className="flex-1" />
        <button onClick={onTpl} className="h-9 px-3 rounded-md border border-slate-300 text-sm font-medium text-slate-700 inline-flex items-center gap-1.5 hover:bg-slate-50"><FileDown className="w-4 h-4" />Tải mẫu</button>
        <button onClick={() => { setShowPaste(s => !s); setPreview(null) }} className="h-9 px-3 rounded-md border border-slate-300 text-sm font-medium text-slate-700 inline-flex items-center gap-1.5 hover:bg-slate-50"><Upload className="w-4 h-4" />Nhập Excel</button>
      </div>
      {showPaste && (
        <div className="bg-white border border-slate-200 rounded-lg p-3 mb-2 mx-1">
          {!preview ? (
            <>
              <div className="text-xs text-slate-500 mb-1">Dán dữ liệu từ Excel (gồm hoặc không gồm dòng tiêu đề). Cột theo đúng thứ tự file mẫu.</div>
              <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={5} className="w-full border border-slate-200 rounded-md p-2 text-sm font-mono" placeholder="Dán vào đây…" />
              <div className="flex gap-2 mt-2">
                <button disabled={!paste.trim()} onClick={() => setPreview(parseRows(paste))} className="h-8 px-3 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"><Search className="w-3.5 h-3.5 inline mr-1" />Xem trước</button>
                <button onClick={resetImport} className="h-8 px-3 rounded-md border border-slate-300 text-sm text-slate-600">Hủy</button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 text-sm mb-2">
                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />{preview.items.length} dòng hợp lệ</span>
                {preview.issues.length > 0 && <span className="inline-flex items-center gap-1 text-rose-600 font-medium"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" />{preview.issues.length} dòng lỗi (bỏ qua)</span>}
                {dupCount > 0 && <span className="inline-flex items-center gap-1 text-amber-600 font-medium"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" />{dupCount} dòng trùng (vẫn nhập)</span>}
              </div>
              {preview.issues.length > 0 && (
                <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md p-2 mb-2 max-h-24 overflow-y-auto">
                  {preview.issues.slice(0, 30).map((is, i) => <div key={i}>Dòng {is.line}: {is.reason}</div>)}
                  {preview.issues.length > 30 && <div>… và {preview.issues.length - 30} dòng nữa</div>}
                </div>
              )}
              <div className="border border-slate-200 rounded-md overflow-auto max-h-64 mb-2">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50"><tr className="text-left text-slate-500">{columns.map((c: any) => <th key={c[0]} className="px-2 py-1.5 font-medium whitespace-nowrap">{c[1]}</th>)}</tr></thead>
                  <tbody>
                    {preview.items.slice(0, 100).map((it: any, i: number) => (
                      <tr key={i} className={`border-t border-slate-100 ${it._dup ? 'bg-amber-50' : ''}`}>
                        {columns.map((c: any) => <td key={c[0]} className="px-2 py-1 text-slate-700 whitespace-nowrap">{c[3] ? c[3](it) : c[2] ? c[2](it[c[0]]) : it[c[0]]}{c[0] === columns[0][0] && it._dup ? <span className="ml-1 text-amber-600 t3">trùng</span> : ''}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.items.length > 100 && <div className="text-xs text-slate-400 px-2 py-1">… xem trước 100/{preview.items.length} dòng</div>}
              </div>
              <div className="flex gap-2">
                <button disabled={committing || preview.items.length === 0} onClick={async () => { setCommitting(true); await onCommit(preview.items); setCommitting(false); resetImport() }}
                  className="h-8 px-3 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">{committing ? 'Đang nhập…' : `Nhập ${preview.items.length} ${unit}`}</button>
                <button disabled={committing} onClick={() => setPreview(null)} className="h-8 px-3 rounded-md border border-slate-300 text-sm text-slate-600">← Sửa lại</button>
                <button disabled={committing} onClick={resetImport} className="h-8 px-3 rounded-md border border-slate-300 text-sm text-slate-600">Hủy</button>
              </div>
            </>
          )}
        </div>
      )}
      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto mx-1">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-slate-500 border-b border-slate-200">{columns.map((c: any) => <th key={c[0]} className="px-2.5 py-2 font-medium">{c[1]}</th>)}<th className="px-2.5 py-2"></th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={columns.length + 1} className="text-center py-8 text-slate-400">Chưa có dữ liệu.</td></tr>
              : rows.map((r: any) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  {columns.map((c: any) => <td key={c[0]} className="px-2.5 py-1.5 text-slate-700">{c[3] ? c[3](r) : c[2] ? c[2](r[c[0]]) : r[c[0]]}</td>)}
                  <td className="px-2.5 py-1.5 text-right"><button title="Xóa" onClick={() => onDel(r)} className="text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4 inline" /></button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────── CẤU HÌNH ───────────────────────────────
function CauHinhTab() {
  const row = (k: string, v: string) => <div className="flex justify-between py-2 border-b border-slate-100 text-sm"><span className="text-slate-500">{k}</span><span className="font-medium text-slate-800">{v}</span></div>
  return (
    <div className="max-w-xl mx-1 bg-white border border-slate-200 rounded-lg p-5">
      <div className="text-sm font-semibold text-slate-700 mb-3">Cấu hình đại lý (đã nhúng cố định trong mẫu Word)</div>
      {row('Dealer', 'HANOI SIEU THANH JSC')}
      {row('Email (P.I.C)', 'trankien@sieuthanh.com.vn')}
      {row('Dealer Technical Manager', 'Tran Kien')}
      <p className="text-xs text-slate-400 mt-3">Ba giá trị này in cố định trên Form (A). Muốn đổi: sửa trực tiếp trong file mẫu <code>fbvn-form-a.docx</code> rồi dựng lại template.</p>
    </div>
  )
}
