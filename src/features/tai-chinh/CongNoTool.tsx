'use client'
import { useState, useEffect } from 'react'
import { Users, ClipboardList, Wallet, Search, CheckCircle2, FileSpreadsheet, RefreshCw, Save, Scissors, Upload, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import BaoGiaEditor, { type BaoGiaRow } from '@/components/BaoGiaEditor'
import { useRealtimeRefetch } from '@/lib/useRealtime'
import { CONGNO_TOPIC, JOBS_TOPIC, DATA_EVENT } from '@/lib/realtime'
import { StatCard, StatRow, BoxLoading } from '@/ui'

// Port NGUYÊN CongNoTool từ admin (y hệt): gom phiếu theo khách/cụm → báo giá (BaoGiaEditor)
// → đánh dấu / đẩy Kanban / tách hóa đơn / xuất-nhập Excel. Gọi lại /api/admin/cong-no.
export function CongNoTool({ showNotification }: { showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selIds, setSelIds] = useState<string[]>([])
  const [selPhieuIds, setSelPhieuIds] = useState<string[]>([])
  const [tpl, setTpl] = useState<Record<string, { ten?: string; gia?: number; dvt?: string }>>({})
  const [rows, setRows] = useState<BaoGiaRow[]>([])
  const [khTen, setKhTen] = useState('')
  const [khDiaChi, setKhDiaChi] = useState('')
  const [khSearch, setKhSearch] = useState('')
  const [working, setWorking] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitQty, setSplitQty] = useState<Record<string, number>>({})

  const fetchList = async () => {
    setLoading(true)
    try { const res = await fetch('/api/admin/cong-no'); const j = await res.json(); if (res.ok) setList(j.data || []); else showNotification('error', j.error) }
    catch { showNotification('error', 'Lỗi kết nối!') } finally { setLoading(false) }
  }
  useEffect(() => { fetchList() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const fetchTpl = async (scopeKey: string) => {
    try {
      const res = await fetch(`/api/admin/ten-hang-rieng?scope_key=${encodeURIComponent(scopeKey)}`)
      const j = await res.json()
      const m: Record<string, { ten?: string; gia?: number; dvt?: string }> = {}
      for (const r of (j.data || [])) m[r.ma_hang] = { ten: r.ten_hang ?? undefined, gia: r.don_gia == null ? undefined : Number(r.don_gia), dvt: r.don_vi_tinh ?? undefined }
      setTpl(m)
    } catch { setTpl({}) }
  }
  useRealtimeRefetch([CONGNO_TOPIC, JOBS_TOPIC], DATA_EVENT, () => fetchList())

  const byReport = (a: any, b: any) => String(a.report || '').localeCompare(String(b.report || ''), undefined, { numeric: true })
  const custs = Array.from(list.reduce((m: Map<string, any>, t: any) => {
    const kh = t.soct_khach_hang
    const cum = kh?.soct_khach_cum
    const k = cum ? `cum:${kh.ma_khach_cum}` : `may:${t.id_khach_hang}`
    if (!m.has(k)) m.set(k, { id: k, ten: cum ? (cum.ten_khach_hang || '—') : (kh?.ten_khach_hang || '—'), dia_chi: cum ? (cum.dia_chi || '') : (kh?.dia_chi || ''), isCum: !!cum, tickets: [] })
    m.get(k).tickets.push(t)
    return m
  }, new Map<string, any>()).values())
    .map((c: any) => ({ ...c, tickets: [...c.tickets].sort(byReport) }))
  const selCusts = custs.filter(c => selIds.includes(c.id))
  const selTickets = selCusts.flatMap(c => c.tickets)
  const chosenTickets = selTickets.filter((t: any) => selPhieuIds.includes(t.id))

  const buildRows = (tickets: any[]): BaoGiaRow[] => {
    const lines = tickets.flatMap((t: any) => (t.soct_chi_tiet_vat_tu || [])
      .filter((v: any) => !v.da_tra)
      .map((v: any) => ({
        maHang: v.ma_hang || '', ten: v.ten_hd || v.soct_kho_hang?.ten_hang || v.ma_hang || '',
        sl: Number(v.so_luong) || 0, gia: Number(v.don_gia) || 0, vat: Number(v.vat) || 0, dvt: v.don_vi_tinh || 'Cái',
        soPhieu: t.report || '', srcId: t.id as string, lineId: v.id as string,
      })))
    const m = new Map<string, any>()
    for (const l of lines) {
      const k = l.maHang || `ten:${l.ten}`
      if (!m.has(k)) m.set(k, { ten: l.ten, ten0: l.ten, dvt: l.dvt, sl: l.sl, gia: l.gia, vat: l.vat, gc: '', soPhieu: l.soPhieu, maHang: l.maHang, srcIds: [l.srcId], lineIds: [l.lineId], _reports: new Set([l.soPhieu]) })
      else { const e = m.get(k); e.sl += l.sl; if (!e.srcIds.includes(l.srcId)) e.srcIds.push(l.srcId); e.lineIds.push(l.lineId); e._reports.add(l.soPhieu); if (e.soPhieu !== l.soPhieu) e.soPhieu = 'nhiều' }
    }
    return [...m.values()].map((r: any) => { const { _reports, ...rest } = r; return { ...rest, soPhieuList: [..._reports].filter(Boolean).join(', ') } })
  }
  useEffect(() => { setRows(buildRows(chosenTickets)) }, [selIds, selPhieuIds]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggleSel = (c: any) => {
    setSelIds(prev => {
      if (prev[0] === c.id) { setKhTen(''); setKhDiaChi(''); setSelPhieuIds([]); setTpl({}); return [] }
      setKhTen(c.ten); setKhDiaChi(c.dia_chi); setSelPhieuIds(c.tickets.map((t: any) => t.id)); fetchTpl(c.id); return [c.id]
    })
  }
  const togglePhieu = (id: string) => setSelPhieuIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const fmtN = (x: any) => (Number(x) || 0).toLocaleString('vi-VN')

  const [exportingXlsx, setExportingXlsx] = useState(false)
  const exportBangKe = async () => {
    const src = new Set<string>(rows.flatMap((r: any) => r.srcIds || []))
    const tickets = selTickets.filter((t: any) => src.has(t.id))
    const lines = tickets.flatMap((t: any) => (t.soct_chi_tiet_vat_tu || [])
      .filter((v: any) => !v.da_tra)
      .map((v: any) => ({
        ngay: (t.ngay || '') as string,
        ten: v.ten_hd || v.soct_kho_hang?.ten_hang || v.ma_hang || '',
        maHang: v.ma_hang || '',
        soPhieu: t.report || '',
        model: t.soct_khach_hang?.model || '',
        sl: Number(v.so_luong) || 0,
        gia: Number(v.don_gia) || 0,
        vat: Number(v.vat) || 0,
      })))
    if (lines.length === 0) return showNotification('error', 'Không có dòng vật tư để xuất (đã trừ phiếu đã xóa / đã trả kho).')
    lines.sort((a: any, b: any) => a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : String(a.soPhieu).localeCompare(String(b.soPhieu), undefined, { numeric: true }))
    setExportingXlsx(true)
    try {
      const mod: any = await import('exceljs'); const ExcelJS = mod.default ?? mod
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Bảng kê lẻ')
      ws.addRow(['TT', 'Ngày', 'Tên hàng', 'Mã hàng', 'Số phiếu', 'Model', 'Số lượng', 'Đơn giá', 'Thành tiền trước thuế', 'Thuế VAT', 'Thành tiền (đã VAT)', 'Ghi chú'])
      const toDate = (s: string) => { const [y, m, d] = String(s).split('-').map(Number); return (y && m && d) ? new Date(Date.UTC(y, m - 1, d)) : null }
      let tongSau = 0
      lines.forEach((l: any, i: number) => {
        const truoc = l.sl * l.gia
        const vatTien = Math.round(truoc * l.vat / 100)
        const sau = truoc + vatTien
        tongSau += sau
        ws.addRow([i + 1, toDate(l.ngay), l.ten, l.maHang, l.soPhieu, l.model, l.sl, l.gia, truoc, vatTien, sau, ''])
      })
      const totalIdx = ws.rowCount + 1
      ws.addRow(['Tổng cộng:', '', '', '', '', '', '', '', '', '', tongSau, ''])
      ws.mergeCells(totalIdx, 1, totalIdx, 10)
      ws.getRow(totalIdx).font = { bold: true }
      ws.getCell(totalIdx, 1).alignment = { horizontal: 'right' }
      ws.getRow(1).font = { bold: true }
      ws.views = [{ state: 'frozen', ySplit: 1 }]
      ;[8, 9, 10, 11].forEach(c => { ws.getColumn(c).numFmt = '#,##0' })
      ws.getColumn(2).numFmt = 'dd/mm/yyyy'
      ;[5, 12, 34, 14, 10, 16, 8, 14, 18, 12, 18, 16].forEach((w, idx) => { ws.getColumn(idx + 1).width = w })
      const buf = await wb.xlsx.writeBuffer()
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a')
      const ascii = (khTen || 'khach').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'khach'
      a.href = url; a.download = `Bang-ke-cong-no_${ascii}_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click(); URL.revokeObjectURL(url)
      showNotification('success', `Đã xuất bảng kê công nợ (${lines.length} dòng).`)
    } catch { showNotification('error', 'Lỗi xuất Excel') } finally { setExportingXlsx(false) }
  }

  const setStatus = async (trang_thai_hd: string) => {
    const inRows = new Set<string>(rows.flatMap((r: any) => r.srcIds || []))
    const noVatTu = chosenTickets.filter((t: any) => !(t.soct_chi_tiet_vat_tu?.length)).map((t: any) => t.id)
    const ids = Array.from(new Set<string>([...inRows, ...noVatTu]))
    if (ids.length === 0) return showNotification('error', 'Không có phiếu nào trong bảng để cập nhật.')
    setWorking(true)
    try {
      const res = await fetch('/api/admin/cong-no', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, trang_thai_hd }) })
      if (res.ok) { showNotification('success', `Đã cập nhật ${ids.length} phiếu → ${trang_thai_hd}.`); setSelIds([]); setKhTen(''); setKhDiaChi(''); setSelPhieuIds([]); fetchList() }
      else { const j = await res.json(); showNotification('error', j.error) }
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setWorking(false) }
  }

  const pushKanban = async () => {
    const inRows = new Set<string>(rows.flatMap((r: any) => r.srcIds || []))
    const noVatTu = chosenTickets.filter((t: any) => !(t.soct_chi_tiet_vat_tu?.length)).map((t: any) => t.id)
    const ids = Array.from(new Set<string>([...inRows, ...noVatTu]))
    if (ids.length === 0) return showNotification('error', 'Chưa chọn phiếu nào để đẩy.')
    const line_edits = rows.flatMap((r: any) => (r.lineIds || []).map((lid: string) => ({
      line_id: lid, don_gia: Number(r.gia) || 0, vat: Number(r.vat) || 0, don_vi_tinh: (r.dvt || '').trim() || 'Cái',
      ...(String(r.ten || '').trim() !== String(r.ten0 || '').trim() ? { ten_hang_hd: String(r.ten || '').trim() || null } : {}),
    })))
    setWorking(true)
    try {
      const res = await fetch('/api/admin/cong-no', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, trang_thai_hd: 'Chờ xuất HĐ', line_edits }) })
      if (res.ok) { showNotification('success', `Đã đẩy ${ids.length} phiếu sang Kanban (cột 1) với dữ liệu đã chuẩn bị.`); setSelIds([]); setKhTen(''); setKhDiaChi(''); setSelPhieuIds([]); fetchList() }
      else { const j = await res.json(); showNotification('error', j.error) }
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setWorking(false) }
  }

  const hasTpl = Object.keys(tpl).length > 0
  const apMauKhach = () => {
    if (!hasTpl) return
    const n = rows.filter((r: any) => r.maHang && tpl[r.maHang]).length
    setRows(prev => prev.map((r: any) => {
      const t = r.maHang ? tpl[r.maHang] : undefined
      return t ? { ...r, ten: t.ten ?? r.ten, gia: t.gia ?? r.gia, dvt: t.dvt ?? r.dvt } : r
    }))
    showNotification('success', n > 0 ? `Đã áp mẫu cho ${n} mặt hàng.` : 'Không có mã nào khớp mẫu đã lưu.')
  }
  const luuMau = async () => {
    const scope = selIds[0]
    if (!scope) return
    const items = rows.filter((r: any) => r.maHang)
    if (items.length === 0) return showNotification('error', 'Không có mặt hàng có mã để lưu mẫu.')
    setWorking(true)
    try {
      let ok = 0
      for (const r of items) {
        const res = await fetch('/api/admin/ten-hang-rieng', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pham_vi: 'khach', scope_key: scope, ma_hang: r.maHang, ten_hang: r.ten, don_gia: r.gia, don_vi_tinh: r.dvt }),
        })
        if (res.ok) ok++
      }
      showNotification('success', `Đã lưu mẫu ${ok}/${items.length} mặt hàng cho khách này.`)
      await fetchTpl(scope)
    } catch { showNotification('error', 'Lỗi lưu mẫu.') } finally { setWorking(false) }
  }
  const [exportingPrep, setExportingPrep] = useState(false)
  const exportPrepExcel = async () => {
    if (rows.length === 0) return showNotification('error', 'Chưa có dòng nào để xuất.')
    setExportingPrep(true)
    try {
      const mod: any = await import('exceljs'); const ExcelJS = mod.default ?? mod
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('HangHoa')
      ws.addRow(['Mã hàng', 'Tên hàng', 'SL', 'ĐVT', 'Đơn giá', 'VAT (%)', 'Thành tiền (chưa VAT)'])
      for (const r of rows) ws.addRow([(r as any).maHang || '', r.ten, r.sl, r.dvt || 'Cái', r.gia, r.vat, (Number(r.sl) || 0) * (Number(r.gia) || 0)])
      ws.getRow(1).font = { bold: true }
      const HL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } } as const
      for (let rN = 1; rN <= ws.rowCount; rN++) { ws.getCell(rN, 2).fill = HL as any; ws.getCell(rN, 4).fill = HL as any }
      ws.getColumn(2).width = 42; ws.getColumn(4).width = 10
      const buf = await wb.xlsx.writeBuffer()
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a')
      const ascii = (khTen || 'khach').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'khach'
      a.href = url; a.download = `Cong-no-sua-gia_${ascii}.xlsx`; a.click(); URL.revokeObjectURL(url)
      showNotification('success', 'Đã xuất Excel để sửa giá.')
    } catch { showNotification('error', 'Lỗi xuất Excel') } finally { setExportingPrep(false) }
  }
  const importPrepExcel = async (file: File) => {
    try {
      const mod: any = await import('exceljs'); const ExcelJS = mod.default ?? mod
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer())
      const ws = wb.worksheets[0]
      if (!ws) return showNotification('error', 'File không có sheet dữ liệu.')
      const byMa = new Map<string, { ten?: string; dvt?: string; gia?: number; vat?: number }>()
      ws.eachRow((row: any, idx: number) => {
        if (idx === 1) return
        const ma = String(row.getCell(1).value ?? '').trim()
        if (!ma) return
        const ten = String(row.getCell(2).value ?? '').trim()
        const dvt = String(row.getCell(4).value ?? '').trim()
        const gia = Number(String(row.getCell(5).value ?? '').replace(/[^\d.-]/g, ''))
        const vat = Number(String(row.getCell(6).value ?? '').replace(/[^\d.-]/g, ''))
        byMa.set(ma, { ten: ten || undefined, dvt: dvt || undefined, gia: Number.isFinite(gia) ? gia : undefined, vat: Number.isFinite(vat) ? vat : undefined })
      })
      const n = rows.filter((r: any) => r.maHang && byMa.has(r.maHang)).length
      setRows(prev => prev.map((r: any) => {
        const u = r.maHang ? byMa.get(r.maHang) : undefined
        return u ? { ...r, ten: u.ten ?? r.ten, dvt: u.dvt ?? r.dvt, gia: u.gia ?? r.gia, vat: u.vat ?? r.vat } : r
      }))
      showNotification('success', n > 0 ? `Đã cập nhật ${n} mặt hàng từ Excel (SL giữ nguyên).` : 'Không có mã nào trong file khớp bảng.')
    } catch { showNotification('error', 'Lỗi đọc file Excel.') }
  }

  const rowSrcIds = new Set<string>(rows.flatMap((r: any) => r.srcIds || []))
  const splitTickets = selTickets
    .filter((t: any) => rowSrcIds.has(t.id))
    .map((t: any) => ({ t, lines: (t.soct_chi_tiet_vat_tu || []).filter((v: any) => !v.da_tra) }))
    .filter((x: any) => x.lines.length >= 1 && (x.lines.length >= 2 || x.lines.some((l: any) => (Number(l.so_luong) || 0) >= 2)))
    .sort((a: any, b: any) => byReport(a.t, b.t))
  const openSplit = () => {
    const init: Record<string, number> = {}
    for (const { lines } of splitTickets) for (const l of lines) init[l.id] = Number(l.so_luong) || 0
    setSplitQty(init); setSplitOpen(true)
  }
  const doSplit = async () => {
    const jobs = splitTickets.map(({ t, lines }: any) => {
      const linesReq = lines.map((l: any) => ({ line_id: l.id, keep_qty: Math.max(0, Math.min(Number(l.so_luong) || 0, splitQty[l.id] ?? (Number(l.so_luong) || 0))) }))
      const totalAll = lines.reduce((s: number, l: any) => s + (Number(l.so_luong) || 0), 0)
      const keptAll = linesReq.reduce((s: number, x: any) => s + x.keep_qty, 0)
      return { id: t.id, report: t.report, lines: linesReq, moved: totalAll - keptAll, kept: keptAll }
    }).filter((j: any) => j.moved > 0 && j.kept > 0)
    if (jobs.length === 0) return showNotification('error', 'Chưa có phiếu nào cần tách (giảm SL lên HĐ ở dòng muốn để lại, và giữ ≥1 để lên HĐ).')
    setWorking(true)
    try {
      let ok = 0
      for (const j of jobs) {
        const res = await fetch('/api/admin/cong-viec/tach-hoa-don', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id_goc: j.id, lines: j.lines }) })
        if (res.ok) ok++
        else { const e = await res.json(); showNotification('error', `Phiếu ${j.report}: ${e.error || 'lỗi tách'}`) }
      }
      if (ok > 0) showNotification('success', `Đã tách ${ok} phiếu. Phần còn lại nằm ở Công nợ (số phiếu -N).`)
      setSplitOpen(false); setSelIds([]); setKhTen(''); setKhDiaChi(''); fetchList()
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setWorking(false) }
  }

  const tongTien = list.reduce((s: number, t: any) => s + (t.soct_chi_tiet_vat_tu || []).reduce((a: number, v: any) => a + (Number(v.don_gia) || 0) * (Number(v.so_luong) || 0), 0), 0)

  return (
    <div className="space-y-6">
      <StatRow>
        <StatCard label="Khách có công nợ" value={custs.length.toLocaleString('vi-VN')} sub="chưa lên hóa đơn" icon={Users} tone="blue" />
        <StatCard label="Phiếu chưa HĐ" value={list.length.toLocaleString('vi-VN')} sub="có số phiếu" icon={ClipboardList} tone="amber" />
        <StatCard label="Tổng tiền (chưa VAT)" value={`${fmtN(tongTien)} đ`} sub="giá gốc vật tư" icon={Wallet} tone="indigo" />
      </StatRow>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-semibold text-slate-600">Chọn điểm máy / cụm (chọn 1 khách)</label>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">{selIds.length} chọn · {selTickets.length} phiếu</span>
          <div className="relative w-full sm:w-64 ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Tìm tên khách..." className="pl-9 pr-7 bg-white h-9" value={khSearch} onChange={e => setKhSearch(e.target.value)} />
            {khSearch && <button type="button" onClick={() => setKhSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-semibold" title="Xóa tìm kiếm">✕</button>}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg max-h-[500px] overflow-y-auto divide-y divide-slate-100">
          {custs.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Không có công nợ.</p>
          ) : custs.filter(c => !khSearch || c.ten.toLowerCase().includes(khSearch.trim().toLowerCase())).map(c => (
            <label key={c.id} className="flex items-start gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer text-sm">
              <input type="radio" name="congno-diemmay" checked={selIds[0] === c.id} onChange={() => {}} onClick={() => toggleSel(c)} className="w-4 h-4 accent-blue-600 mt-0.5 shrink-0" />
              <div className="w-56 sm:w-72 shrink-0">
                <span className="t1 font-medium text-slate-700 leading-snug">{c.ten}</span>
                {c.isCum && <span className="ml-1.5 px-1.5 py-[1px] t3 font-semibold bg-violet-50 text-violet-700 border border-violet-200 rounded whitespace-nowrap">cụm · {new Set(c.tickets.map((t: any) => t.id_khach_hang)).size} máy</span>}
              </div>
              <div className="flex-1 min-w-0 t2 text-slate-400 leading-relaxed">
                <span className="font-semibold text-slate-500">{c.tickets.length} phiếu</span>
                <span className="text-slate-300"> · </span>
                {c.tickets.map((t: any, idx: number) => (
                  <span key={t.id} className="whitespace-nowrap">
                    {idx > 0 && <span className="text-slate-300">, </span>}
                    <span className={t.trang_thai_hd === 'Đã báo giá' ? 'text-blue-600 font-semibold' : ''}>{t.report}</span>
                    {t.trang_thai_hd === 'Đã báo giá' && <span className="ml-1 px-1 py-[1px] text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded relative -top-0.5">Đã BG</span>}
                  </span>
                ))}
              </div>
            </label>
          ))}
        </div>
      </div>

      {loading ? (
        <BoxLoading label="Đang tải công nợ..." className="py-6" />
      ) : selCusts.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">Lựa chọn khách hàng để xuất công nợ hoặc lập báo giá</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {selTickets.length > 0 && (
            <div className="px-4 py-2 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500 mr-1">Chọn phiếu đẩy Kanban:</span>
              {selTickets.slice().sort(byReport).map((t: any) => {
                const on = selPhieuIds.includes(t.id)
                return (
                  <button key={t.id} onClick={() => togglePhieu(t.id)} className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded-full border transition ${on ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-slate-400 border-slate-200 line-through'}`} title={on ? 'Đang chọn — bấm để bỏ' : 'Đã bỏ — bấm để chọn lại'}>
                    <span className={`w-3 h-3 rounded-sm border flex items-center justify-center ${on ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'}`}>{on ? '✓' : ''}</span>
                    {t.report || t.id.slice(0, 6)}
                  </button>
                )
              })}
              <div className="ml-auto flex gap-1">
                <button onClick={() => setSelPhieuIds(selTickets.map((t: any) => t.id))} className="t2 text-blue-600 hover:underline px-1">Chọn tất</button>
                <button onClick={() => setSelPhieuIds([])} className="t2 text-slate-400 hover:underline px-1">Bỏ tất</button>
              </div>
            </div>
          )}
          <BaoGiaEditor
            rows={rows}
            onRowsChange={setRows}
            showSoPhieu
            slDisabled
            phieuChips={false}
            khachHang={khTen}
            onKhachHangChange={setKhTen}
            diaChi={khDiaChi}
            onDiaChiChange={setKhDiaChi}
            showNotification={showNotification}
            canExport={selCusts.length > 0}
            allowAddRow={false}
            emptyText="Chưa chọn phiếu nào (hoặc phiếu đã chọn không có vật tư). Tick phiếu ở trên."
            rightToolbarExtra={
              <Button variant="outline" onClick={exportBangKe} disabled={exportingXlsx || selCusts.length === 0} className="h-9 gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50" title="Xuất Excel bảng kê công nợ (itemized theo mẫu 'Bảng kê lẻ')">
                <FileSpreadsheet className={`w-4 h-4 ${exportingXlsx ? 'animate-pulse' : ''}`} /> Xuất bảng kê công nợ
              </Button>
            }
            footerExtra={
              <>
                <Button variant="outline" onClick={() => setStatus('Đã báo giá')} disabled={working} title="Đánh dấu đã báo giá" className="h-9 w-9 p-0"><CheckCircle2 className="w-4 h-4" /></Button>
                <Button onClick={pushKanban} disabled={working} className="h-9 bg-blue-600 hover:bg-blue-700">📤 Đẩy sang Kế toán (Kanban)</Button>
              </>
            }
            footerRow2={
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={apMauKhach} disabled={working || !hasTpl} title={hasTpl ? 'Điền tên/giá/ĐVT đã lưu cho khách này' : 'Khách này chưa có mẫu đã lưu'} className="h-9 gap-1.5"><RefreshCw className="w-4 h-4" /> Áp mẫu khách</Button>
                  <Button variant="outline" onClick={luuMau} disabled={working} title="Lưu tên/giá/ĐVT hiện tại thành mẫu cho khách này" className="h-9 gap-1.5"><Save className="w-4 h-4" /> Lưu mẫu</Button>
                </div>
                <div className="flex gap-2">
                  {splitTickets.length > 0 && (
                    <Button variant="outline" onClick={openSplit} disabled={working} className="h-9 gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50" title="Tách dòng lên HĐ: chọn dòng lên hóa đơn; dòng còn lại tách sang phiếu con ở lại Công nợ"><Scissors className="w-4 h-4" /> Tách dòng</Button>
                  )}
                  <label className={`inline-flex items-center h-9 gap-1.5 px-3 rounded-md border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer ${working ? 'opacity-50 pointer-events-none' : ''}`} title="Nhập Excel (sửa giá): khớp theo Mã hàng, cập nhật Tên/ĐVT/Đơn giá/VAT — KHÔNG đổi SL">
                    <Upload className="w-4 h-4" /> Nhập Excel
                    <input type="file" accept=".xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importPrepExcel(f); e.target.value = '' }} />
                  </label>
                  <Button variant="outline" onClick={exportPrepExcel} disabled={exportingPrep || rows.length === 0} className="h-9 gap-1.5" title="Xuất Excel (sửa giá): tải bảng ra để sửa hàng loạt rồi Nhập lại"><Download className={`w-4 h-4 ${exportingPrep ? 'animate-pulse' : ''}`} /> Xuất để sửa giá</Button>
                </div>
              </div>
            }
          />
        </div>
      )}

      {/* MODAL TÁCH HÓA ĐƠN */}
      {splitOpen && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5">✂ Tách dòng lên hóa đơn</h3>
              <button onClick={() => setSplitOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
            </div>
            <div className="p-4 overflow-y-auto space-y-4">
              <p className="text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded px-3 py-2">
                Nhập <b>SL lên HĐ</b> cho từng dòng (mặc định = đủ SL → lên hết). Phần <b>dư</b> (SL − lên HĐ) sẽ <b>tách sang phiếu con</b> (số phiếu <b>-N</b>), ở lại Công nợ để lên HĐ kỳ sau. Đặt <b>0</b> = tách cả dòng.
              </p>
              {splitTickets.map(({ t, lines }: any) => {
                const totalAll = lines.reduce((s: number, l: any) => s + (Number(l.so_luong) || 0), 0)
                const keptAll = lines.reduce((s: number, l: any) => s + Math.max(0, Math.min(Number(l.so_luong) || 0, splitQty[l.id] ?? (Number(l.so_luong) || 0))), 0)
                const movedAll = totalAll - keptAll
                return (
                  <div key={t.id} className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <span className="t1 font-semibold text-slate-700">Phiếu {t.report}</span>
                      <span className="t2 text-slate-500">Lên HĐ: SL {keptAll} · {movedAll > 0 ? <span className="text-amber-700 font-semibold">tách SL {movedAll}</span> : 'không tách'}</span>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {lines.map((l: any) => {
                        const ten = l.ten_hang_hd || l.soct_kho_hang?.ten_hang || l.ma_hang
                        const total = Number(l.so_luong) || 0
                        const keep = Math.max(0, Math.min(total, splitQty[l.id] ?? total))
                        const move = total - keep
                        return (
                          <div key={l.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                            <span className="flex-1 min-w-0 truncate text-slate-700" title={ten}>{ten}</span>
                            <span className="text-xs text-slate-400 shrink-0">SL {total}</span>
                            <label className="flex items-center gap-1 shrink-0">
                              <span className="t2 text-slate-500">lên HĐ</span>
                              <input type="number" min={0} max={total} value={keep} onChange={e => { const n = Math.max(0, Math.min(total, Math.floor(Number(e.target.value) || 0))); setSplitQty(prev => ({ ...prev, [l.id]: n })) }} className="w-16 h-8 px-2 rounded border border-slate-200 text-sm text-right bg-white" />
                            </label>
                            <span className={`t2 shrink-0 w-20 text-right ${move > 0 ? 'text-amber-700 font-semibold' : 'text-slate-300'}`}>{move > 0 ? `tách ${move}` : '—'}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSplitOpen(false)} disabled={working} className="h-9">Hủy</Button>
              <Button onClick={doSplit} disabled={working} className="h-9 bg-amber-600 hover:bg-amber-700">{working ? 'Đang tách...' : 'Xác nhận tách'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
