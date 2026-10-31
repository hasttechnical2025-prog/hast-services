'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Upload, RefreshCw, Save, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TableLoading, usePaged, ListFrame, SearchInput } from '@/ui'

// Port NGUYÊN GiaNiemYetTool từ admin (y hệt), gọi lại /api/admin/gia-niem-yet.
export function GiaNiemYetTool({ showNotification, hangOptions }: { showNotification: (t: 'success' | 'error', m: string) => void, hangOptions: string[] }) {
  const [rows, setRows] = useState<any[]>([])
  const [cols, setCols] = useState<{ niem_yet: boolean; nhan_vien: boolean; quan_ly: boolean }>({ niem_yet: true, nhan_vien: false, quan_ly: false })
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState(''); const [qModel, setQModel] = useState(''); const [fHang, setFHang] = useState('')
  const [edits, setEdits] = useState<Record<string, { gia_niem_yet: string; gia_nhan_vien: string; gia_quan_ly: string }>>({})
  const [savingMa, setSavingMa] = useState<string | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [colMap, setColMap] = useState<string[]>(['gia_niem_yet', 'gia_nhan_vien', 'gia_quan_ly'])
  const [preview, setPreview] = useState<any[] | null>(null)
  const [importing, setImporting] = useState(false)
  const setBulk = (v: string) => { setBulkText(v); setPreview(null) }
  const maSet = useMemo(() => new Set(rows.map(r => String(r.ma_hang || '').toUpperCase())), [rows])
  const PRICE_OPTS: [string, string][] = [['', '— bỏ qua —'], ['gia_niem_yet', 'Giá niêm yết'], ['gia_nhan_vien', 'Giá nhân viên'], ['gia_quan_ly', 'Giá quản lý']]
  const PRICE_LABEL: Record<string, string> = { gia_niem_yet: 'Niêm yết', gia_nhan_vien: 'Nhân viên', gia_quan_ly: 'Quản lý' }

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/gia-niem-yet').then(r => r.ok ? r.json() : { data: [] }).then(j => {
      setRows(j.data || []); if (j.cols) setCols(j.cols); setCanEdit(!!j.canEdit)
      const m: any = {}
      ;(j.data || []).forEach((r: any) => { m[r.ma_hang] = { gia_niem_yet: r.gia_niem_yet != null ? String(r.gia_niem_yet) : '', gia_nhan_vien: r.gia_nhan_vien != null ? String(r.gia_nhan_vien) : '', gia_quan_ly: r.gia_quan_ly != null ? String(r.gia_quan_ly) : '' } })
      setEdits(m)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const doCheck = () => {
    const out = bulkText.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim()).map(l => {
      const c = l.split('\t').length > 1 ? l.split('\t') : l.split(/\s{2,}|;/)
      const ma = (c[0] || '').trim().toUpperCase()
      const prices: any = {}
      colMap.forEach((tgt, i) => { if (tgt) { const raw = String(c[i + 1] ?? '').replace(/\D/g, ''); if (raw !== '') prices[tgt] = Number(raw) } })
      let status: 'ok' | 'err' = 'ok'; let note = ''
      if (!ma) { status = 'err'; note = 'Thiếu mã' }
      else if (!maSet.has(ma)) { status = 'err'; note = 'Không có trong kho' }
      else if (Object.keys(prices).length === 0) { status = 'err'; note = 'Không có giá' }
      return { ma_hang: ma, prices, status, note }
    })
    if (out.length === 0) { showNotification('error', 'Chưa có dòng để kiểm tra'); return }
    setPreview(out)
  }
  const doImport = async () => {
    const items = (preview || []).filter(r => r.status === 'ok').map(r => ({ ma_hang: r.ma_hang, ...r.prices }))
    if (items.length === 0) { showNotification('error', 'Không có dòng hợp lệ để nhập'); return }
    setImporting(true)
    try {
      const res = await fetch('/api/admin/gia-niem-yet', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) })
      const j = await res.json()
      if (res.ok) { showNotification('success', `Đã nhập giá cho ${j.count} mã`); setBulkText(''); setPreview(null); setBulkOpen(false); load() }
      else showNotification('error', j.error || 'Lỗi import')
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setImporting(false) }
  }

  const fmt = (s: string) => { const d = String(s).replace(/\D/g, ''); return d ? Number(d).toLocaleString('vi-VN') : '' }
  const fmtNum = (n: any) => n == null ? '—' : Number(n).toLocaleString('vi-VN')
  // Sắp xếp cột (quy tắc: mọi bảng bấm tiêu đề để sort).
  const [sortField, setSortField] = useState<string>('ma_hang')
  const [sortAsc, setSortAsc] = useState<boolean>(true)
  const handleSort = (f: string) => { if (sortField === f) setSortAsc(p => !p); else { setSortField(f); setSortAsc(true) } }
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase(), km = qModel.trim().toLowerCase()
    const base = rows.filter(r => {
      if (kw && !`${r.ma_hang} ${r.ten_hang}`.toLowerCase().includes(kw)) return false
      if (km && !String(r.model || '').toLowerCase().includes(km)) return false
      if (fHang && String(r.hang || '') !== fHang) return false
      return true
    })
    const txt = (a: any, b: any) => String(a ?? '').localeCompare(String(b ?? ''), 'vi', { numeric: true, sensitivity: 'base' })
    const num = (a: any, b: any) => (Number(a) || 0) - (Number(b) || 0)
    base.sort((a, b) => {
      let c = 0
      if (sortField === 'ma_hang') c = txt(a.ma_hang, b.ma_hang)
      else if (sortField === 'ten_hang') c = txt(a.ten_hang, b.ten_hang)
      else if (sortField === 'model') c = txt(a.model, b.model)
      else if (sortField === 'hang') c = txt(a.hang, b.hang)
      else if (sortField === 'ton_kho') c = num(a.ton_kho, b.ton_kho)
      else if (sortField === 'gia_niem_yet') c = num(a.gia_niem_yet, b.gia_niem_yet)
      else if (sortField === 'gia_nhan_vien') c = num(a.gia_nhan_vien, b.gia_nhan_vien)
      else if (sortField === 'gia_quan_ly') c = num(a.gia_quan_ly, b.gia_quan_ly)
      if (c === 0) c = txt(a.ma_hang, b.ma_hang)
      return sortAsc ? c : -c
    })
    return base
  }, [rows, q, qModel, fHang, sortField, sortAsc])
  const paged = usePaged(filtered)

  const SortTh = ({ f, label, align = 'left' }: { f: string, label: string, align?: 'left' | 'center' | 'right' }) => (
    <th onClick={() => handleSort(f)} className={`px-2 py-2.5 cursor-pointer select-none transition-colors hover:bg-slate-100 ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'} ${sortField === f ? 'text-blue-600 bg-blue-50/60' : ''}`}>
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>{label}{sortField === f && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</span>
    </th>
  )

  const setE = (ma: string, k: string, v: string) => setEdits(p => ({ ...p, [ma]: { ...p[ma], [k]: v.replace(/\D/g, '') } }))
  const saveRow = async (ma: string) => {
    setSavingMa(ma)
    try {
      const e = edits[ma] || { gia_niem_yet: '', gia_nhan_vien: '', gia_quan_ly: '' }
      const body: any = { ma_hang: ma }
      if (cols.niem_yet) body.gia_niem_yet = e.gia_niem_yet
      if (cols.nhan_vien) body.gia_nhan_vien = e.gia_nhan_vien
      if (cols.quan_ly) body.gia_quan_ly = e.gia_quan_ly
      const res = await fetch('/api/admin/gia-niem-yet', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json()
      if (res.ok) { showNotification('success', `Đã lưu giá ${ma}`); setRows(prev => prev.map(r => r.ma_hang === ma ? { ...r, gia_niem_yet: cols.niem_yet ? (body.gia_niem_yet === '' ? null : Number(body.gia_niem_yet)) : r.gia_niem_yet, gia_nhan_vien: cols.nhan_vien ? (body.gia_nhan_vien === '' ? null : Number(body.gia_nhan_vien)) : r.gia_nhan_vien, gia_quan_ly: cols.quan_ly ? (body.gia_quan_ly === '' ? null : Number(body.gia_quan_ly)) : r.gia_quan_ly } : r)) }
      else showNotification('error', j.error || 'Lỗi lưu')
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setSavingMa(null) }
  }

  const toolbar = (
    <div className="flex flex-wrap gap-2.5 items-center">
      <SearchInput value={q} onChange={setQ} placeholder="Tìm mã / tên vật tư..." className="w-56" />
      <SearchInput value={qModel} onChange={setQModel} placeholder="Tìm model..." className="w-44" />
      <select value={fHang} onChange={e => setFHang(e.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700">
        <option value="">Tất cả hãng</option>
        {hangOptions.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      {!canEdit && <span className="self-center text-xs text-slate-400">chỉ tra cứu</span>}
      <div className="ml-auto flex items-center gap-2">
        {canEdit && <Button variant="outline" onClick={() => setBulkOpen(v => !v)} className="h-9 gap-1.5 text-sm"><Upload className="w-4 h-4" /> Nhập giá hàng loạt</Button>}
        <Button variant="outline" onClick={load} className="h-9 gap-1.5 text-sm"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Tải lại</Button>
      </div>
    </div>
  )

  const bulkPanel = canEdit && bulkOpen ? (
        <div className="bg-slate-50/80 p-3.5 rounded-lg border border-slate-200 space-y-2.5">
          <p className="text-xs text-slate-500">Dán từ Excel: <b>cột 1 = Mã hàng</b>, các cột sau là giá — chọn mỗi cột ứng với loại giá nào bên dưới. Chỉ cập nhật mã <b>đã có trong kho</b>; trùng thì ghi đè. Bấm <b>Kiểm tra</b> rồi <b>Nhập</b>.</p>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {[0, 1, 2].map(i => (
              <label key={i} className="flex items-center gap-1.5">
                <span className="text-slate-500">Cột {i + 2}:</span>
                <select value={colMap[i]} onChange={e => { const m = [...colMap]; m[i] = e.target.value; setColMap(m); setPreview(null) }} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs">
                  {PRICE_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            ))}
          </div>
          <textarea value={bulkText} onChange={e => setBulk(e.target.value)} rows={7}
            placeholder={"CT200401\t936000\t1123000\nCT200719\t1058000\t1270000"}
            className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-200" />
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => { setBulkText(''); setPreview(null); setBulkOpen(false) }} className="h-8 text-xs text-slate-500">Hủy</Button>
            <Button variant="outline" onClick={doCheck} className="h-8 text-xs">Kiểm tra</Button>
            <Button onClick={doImport} disabled={importing || !preview || preview.every(r => r.status === 'err')} className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white">{importing ? 'Đang nhập...' : 'Nhập'}</Button>
          </div>
          {preview && (() => {
            const ok = preview.filter(r => r.status === 'ok').length
            const er = preview.length - ok
            const cols2 = colMap.filter(Boolean)
            return (
              <div className="space-y-1.5">
                <div className="flex gap-2 t2">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">Cập nhật: {ok}</span>
                  <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold">Lỗi (bỏ qua): {er}</span>
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-left t2 text-slate-600">
                    <thead className="bg-slate-100 text-slate-500 uppercase sticky top-0"><tr><th className="px-2 py-1">Mã</th>{cols2.map(c => <th key={c} className="px-2 py-1 text-right">{PRICE_LABEL[c]}</th>)}<th className="px-2 py-1">Trạng thái</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.map((r, idx) => (
                        <tr key={idx} className={r.status === 'err' ? 'bg-rose-50/40' : ''}>
                          <td className="px-2 py-1 font-mono font-semibold text-slate-800">{r.ma_hang || <span className="text-rose-500 italic">(trống)</span>}</td>
                          {cols2.map(c => <td key={c} className="px-2 py-1 text-right">{r.prices[c] != null ? Number(r.prices[c]).toLocaleString('vi-VN') : ''}</td>)}
                          <td className="px-2 py-1">{r.status === 'ok' ? <span className="text-emerald-600">✓ Cập nhật</span> : <span className="text-rose-600">✕ {r.note}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}
        </div>
      ) : null

  return (
    <div className="space-y-4">
      <ListFrame toolbar={toolbar} aboveTable={bulkPanel} paged={paged} unit="vật tư">
          <table className="w-full text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-500 t2 font-semibold uppercase border-b border-slate-200">
              <tr>
                <SortTh f="ma_hang" label="Mã hàng" />
                <SortTh f="ten_hang" label="Tên vật tư" />
                <SortTh f="model" label="Model" />
                <SortTh f="hang" label="Hãng" />
                <SortTh f="ton_kho" label="Tồn" align="center" />
                {cols.niem_yet && <SortTh f="gia_niem_yet" label="Giá niêm yết" align="right" />}
                {cols.nhan_vien && <SortTh f="gia_nhan_vien" label="Giá NV" align="right" />}
                {cols.quan_ly && <SortTh f="gia_quan_ly" label="Giá QL" align="right" />}
                {canEdit && <th className="px-2 py-2.5 text-center w-9"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && rows.length === 0 ? (
                <TableLoading colSpan={9} label="Đang tải giá niêm yết..." />
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Không có vật tư nào.</td></tr>
              ) : paged.pageItems.map(r => {
                const e = edits[r.ma_hang] || { gia_niem_yet: '', gia_nhan_vien: '', gia_quan_ly: '' }
                return (
                  <tr key={r.ma_hang} className="hover:bg-slate-50">
                    <td className="px-2 py-2 font-mono font-semibold text-slate-800 whitespace-nowrap">{r.ma_hang}</td>
                    <td className="px-2 py-2">{r.ten_hang}</td>
                    <td className="px-2 py-2 text-[10px] text-slate-400 max-w-[120px] truncate" title={r.model || ''}>{r.model || '—'}</td>
                    <td className="px-2 py-2 text-slate-500 whitespace-nowrap">{r.hang || '—'}</td>
                    <td className="px-2 py-2 text-center">{r.ton_kho ?? 0}</td>
                    {cols.niem_yet && <td className="px-2 py-2 text-right">{canEdit ? <Input inputMode="numeric" value={fmt(e.gia_niem_yet)} onChange={ev => setE(r.ma_hang, 'gia_niem_yet', ev.target.value)} className="h-8 w-24 text-right text-xs px-1 ml-auto" /> : <span className="font-semibold text-slate-700">{fmtNum(r.gia_niem_yet)}</span>}</td>}
                    {cols.nhan_vien && <td className="px-2 py-2 text-right">{canEdit ? <Input inputMode="numeric" value={fmt(e.gia_nhan_vien)} onChange={ev => setE(r.ma_hang, 'gia_nhan_vien', ev.target.value)} className="h-8 w-24 text-right text-xs px-1 ml-auto" /> : <span className="font-semibold text-slate-700">{fmtNum(r.gia_nhan_vien)}</span>}</td>}
                    {cols.quan_ly && <td className="px-2 py-2 text-right">{canEdit ? <Input inputMode="numeric" value={fmt(e.gia_quan_ly)} onChange={ev => setE(r.ma_hang, 'gia_quan_ly', ev.target.value)} className="h-8 w-24 text-right text-xs px-1 ml-auto" /> : <span className="font-semibold text-slate-700">{fmtNum(r.gia_quan_ly)}</span>}</td>}
                    {canEdit && <td className="px-2 py-2 text-center"><button onClick={() => saveRow(r.ma_hang)} disabled={savingMa === r.ma_hang} title="Lưu giá dòng này" className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition disabled:opacity-50">{savingMa === r.ma_hang ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}</button></td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
      </ListFrame>
    </div>
  )
}
