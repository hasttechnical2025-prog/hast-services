'use client'
import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Công cụ Nhập/Xuất Excel (.xlsx) dùng chung — port NGUYÊN từ admin.
export type ExcelCol = { header: string; key: string; toCsv?: (v: any) => string; parse?: (raw: string) => any }

export function ExcelTool({ columns, rows, filename, endpoint, payloadKey, requiredKeys, unit, onSuccess, showNotification }: {
  columns: ExcelCol[]; rows: any[]; filename: string; endpoint: string; payloadKey: string;
  requiredKeys: string[]; unit: string; onSuccess: () => void; showNotification: (type: 'success' | 'error', msg: string) => void
}) {
  const [parsed, setParsed] = useState<any[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const cellText = (r: any, c: ExcelCol) => c.toCsv ? c.toCsv(r[c.key]) : (r[c.key] ?? '')
  const exportVal = (r: any, c: ExcelCol) => c.toCsv ? c.toCsv(r[c.key]) : (r[c.key] == null ? '' : r[c.key])
  const cellToStr = (v: any): string => {
    if (v == null) return ''
    if (v instanceof Date) return `${String(v.getDate()).padStart(2, '0')}/${String(v.getMonth() + 1).padStart(2, '0')}/${v.getFullYear()}`
    if (typeof v === 'object') {
      if ('text' in v) return String((v as any).text)
      if ('result' in v) return String((v as any).result)
      if ('richText' in v) return (v as any).richText.map((t: any) => t.text).join('')
      return ''
    }
    return String(v)
  }

  const exportExcel = async () => {
    setBusy(true)
    try {
      const mod: any = await import('exceljs')
      const ExcelJS = mod.default ?? mod
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Data')
      const head = ws.addRow(columns.map(c => c.header)); head.font = { bold: true }
      for (const r of rows) ws.addRow(columns.map(c => exportVal(r, c)))
      columns.forEach((c, i) => { ws.getColumn(i + 1).width = Math.max(12, c.header.length + 4) })
      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob); const a = document.createElement('a')
      a.href = url; a.download = `${filename}-${new Date().toISOString().split('T')[0]}.xlsx`; a.click(); URL.revokeObjectURL(url)
    } catch { showNotification('error', 'Không tạo được file Excel.') }
    finally { setBusy(false) }
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setBusy(true)
    try {
      const mod: any = await import('exceljs')
      const ExcelJS = mod.default ?? mod
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await file.arrayBuffer())
      const ws = wb.worksheets[0]
      if (!ws) { showNotification('error', 'File Excel không có dữ liệu.'); setParsed(null); return }
      const grid: string[][] = []
      ws.eachRow({ includeEmpty: false }, (row: any) => {
        const vals = row.values as any[]
        grid.push(columns.map((_, i) => cellToStr(vals[i + 1])))
      })
      if (grid.length < 2) { showNotification('error', 'File Excel trống hoặc chỉ có dòng tiêu đề.'); setParsed(null); return }
      const headers = grid[0].map(h => h.trim().toLowerCase())
      const colIdx = columns.map(c => headers.indexOf(c.header.toLowerCase()))
      const recs: any[] = []
      for (let i = 1; i < grid.length; i++) {
        const line = grid[i]
        if (!line.some(c => c.trim() !== '')) continue
        const obj: any = {}
        columns.forEach((c, ci) => {
          const raw = ((colIdx[ci] >= 0 ? line[colIdx[ci]] : line[ci]) ?? '').trim()
          obj[c.key] = c.parse ? c.parse(raw) : (raw || null)
        })
        if (requiredKeys.every(k => obj[k] != null && String(obj[k]).trim() !== '')) recs.push(obj)
      }
      if (recs.length === 0) { showNotification('error', 'Không có dòng hợp lệ (thiếu cột bắt buộc).'); setParsed(null); return }
      setParsed(recs)
    } catch { showNotification('error', 'Không đọc được file Excel.') }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const doImport = async () => {
    if (!parsed) return
    setImporting(true)
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [payloadKey]: parsed }) })
      if (res.ok) { const d = await res.json(); showNotification('success', `Đã import ${d.count} ${unit}.` + (d.geocoded ? ` Tự tính KM cho ${d.geocoded} dòng.` : '')); setParsed(null); onSuccess() }
      else { const err = await res.json(); showNotification('error', 'Lỗi import: ' + err.error) }
    } catch { showNotification('error', 'Lỗi kết nối khi import.') }
    finally { setImporting(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={exportExcel} disabled={busy} className="gap-2"><Download className="w-4 h-4" /> Xuất Excel ({rows.length})</Button>
        <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onFile} className="hidden" />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy} className="gap-2"><Upload className="w-4 h-4" /> Nhập từ Excel</Button>
      </div>
      {parsed && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-slate-600">Đã đọc <b>{parsed.length}</b> dòng hợp lệ.</span>
            <Button onClick={doImport} disabled={importing} className="bg-emerald-600 hover:bg-emerald-700 h-9">{importing ? 'Đang nhập...' : `Xác nhận nhập ${parsed.length} ${unit}`}</Button>
            <button onClick={() => setParsed(null)} className="text-xs text-slate-500 hover:underline">Hủy</button>
          </div>
          <div className="border border-slate-200 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-100 text-slate-600 font-medium sticky top-0 border-b border-slate-200">
                <tr>{columns.map(c => <th key={c.key} className="px-3 py-2">{c.header}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parsed.slice(0, 50).map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">{columns.map(c => <td key={c.key} className="px-3 py-2">{cellText(r, c)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.length > 50 && <p className="text-xs text-slate-400">Xem trước 50/{parsed.length} dòng đầu.</p>}
        </div>
      )}
    </div>
  )
}
