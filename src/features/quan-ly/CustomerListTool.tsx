'use client'
import { useState, useEffect, useMemo } from 'react'
import { Users, ClipboardCheck, Clock, AlertTriangle, Search, Plus, ChevronUp, ChevronDown, PenSquare, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import DateField from '@/components/DateField'
import { hdbtStatus } from '@/lib/hd-status'
import { LOAI_HD_BAO_TRI, fmtThang, moTaLichBaoTri, coBaoTriThang, parseThangBaoTri, formatThangBaoTri } from '@/lib/bao-tri'
import { usePaged, Pagination, useColView, ColumnMenu, StatCard, StatRow, type ColDef } from '@/ui'

// Port NGUYÊN CustomerListTool từ admin (y hệt). Gọi lại /api/admin/khach-hang.
const CUSTOMER_COLS: ColDef[] = [
  { key: 'ma_may', label: 'Mã máy', locked: true },
  { key: 'serial', label: 'Serial' },
  { key: 'ten', label: 'Tên khách hàng', locked: true },
  { key: 'model', label: 'Model' },
  { key: 'hang', label: 'Hãng' },
  { key: 'km', label: 'KM' },
  { key: 'loai_hd', label: 'Loại HĐ' },
  { key: 'het_han', label: 'Hết hạn hợp đồng' },
  { key: 'lich_bt', label: 'Lịch bảo trì' },
  { key: 'sua', label: 'Sửa', locked: true },
]

export function CustomerListTool({ customers, loaiHdOptions, hangOptions, hdbtCanhBaoThang, onUpdateSuccess, showNotification }: { customers: any[], loaiHdOptions: string[], hangOptions: string[], hdbtCanhBaoThang: number, onUpdateSuccess: () => void, showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const col = useColView('customers', CUSTOMER_COLS)
  const [search, setSearch] = useState("")
  const [hdFilter, setHdFilter] = useState("all")
  const [filterOpen, setFilterOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const [highlightCust, setHighlightCust] = useState("")

  const dupCust = editing && (editing.ma_may || "").trim()
    ? customers.find(c => c.ma_may && c.id !== editing.id && c.ma_may.toLowerCase() === editing.ma_may.trim().toLowerCase())
    : undefined
  const dupSerial = editing && (editing.serial || "").trim()
    ? customers.find(c => c.serial && c.id !== editing.id && c.serial.trim().toLowerCase() === editing.serial.trim().toLowerCase())
    : undefined

  const filterLabel = hdFilter === 'all' ? 'Tất cả'
    : hdFilter === 'has' ? 'Có hợp đồng'
    : hdFilter === 'expiring' ? `Sắp hết hạn (${hdbtCanhBaoThang} tháng)`
    : hdFilter === 'expired' ? 'Đã hết hạn'
    : hdFilter.startsWith('hd:') ? hdFilter.slice(3)
    : 'Tất cả'
  const selectFilter = (v: string) => { setHdFilter(v); setFilterOpen(false) }

  const q = search.trim().toLowerCase()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const limit = new Date(today); limit.setMonth(limit.getMonth() + hdbtCanhBaoThang)

  const filtered = customers.filter(c => {
    if (q && !(
      (c.ten_khach_hang || "").toLowerCase().includes(q) ||
      (c.ma_may || "").toLowerCase().includes(q) ||
      (c.serial || "").toLowerCase().includes(q) ||
      (c.dia_chi || "").toLowerCase().includes(q) ||
      (c.model || "").toLowerCase().includes(q) ||
      (c.loai_hd || "").toLowerCase().includes(q)
    )) return false
    if (hdFilter === 'all') return true
    if (hdFilter === 'has') return c.loai_hd === 'HĐBT' || c.loai_hd === 'MF'
    if (hdFilter.startsWith('hd:')) return c.loai_hd === hdFilter.slice(3)
    const exp = (c.ngay_het_han_hdbt && String(c.loai_hd || '').trim()) ? new Date(c.ngay_het_han_hdbt) : null
    if (hdFilter === 'expiring') return exp !== null && exp >= today && exp <= limit
    if (hdFilter === 'expired') return exp !== null && exp < today
    return true
  })

  const handleSave = async () => {
    if (!editing) return
    const isNew = !editing.id
    if (isNew && (!(editing.ten_khach_hang || "").trim() || !(editing.dia_chi || "").trim())) {
      showNotification('error', "Cần nhập Tên khách hàng và Địa chỉ."); return
    }
    setSaving(true)
    try {
      const payload = {
        ten_khach_hang: editing.ten_khach_hang,
        ma_may: editing.ma_may,
        serial: editing.serial,
        dia_chi: editing.dia_chi,
        vi_tri_dat_may: editing.vi_tri_dat_may || null,
        model: editing.model,
        hang: editing.hang,
        loai_hd: editing.loai_hd,
        ngay_het_han_hdbt: editing.ngay_het_han_hdbt,
        thang_bao_tri: editing.thang_bao_tri || null,
        bat_dau_tu_thang: editing.bat_dau_tu_thang || null,
        tam_dung_tu_thang: editing.tam_dung_tu_thang || null,
        ghi_chu_bao_tri: editing.ghi_chu_bao_tri || null,
        ma_so_thue: editing.ma_so_thue || null,
        email_ke_toan: editing.email_ke_toan || null,
      }
      const res = await fetch('/api/admin/khach-hang', {
        method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? payload : { id: editing.id, ...payload, km_mac_dinh: editing.km_mac_dinh }),
      })
      if (res.ok) { showNotification('success', isNew ? "Đã tạo khách hàng mới." : "Đã cập nhật khách hàng."); setEditing(null); onUpdateSuccess() }
      else { const err = await res.json(); showNotification('error', err.error) }
    } catch { showNotification('error', "Lỗi kết nối!") }
    finally { setSaving(false) }
  }

  const custStats = (() => {
    let hasHd = 0, expiring = 0, expired = 0
    for (const c of filtered) {
      if (c.loai_hd === 'HĐBT' || c.loai_hd === 'MF') hasHd++
      const exp = (c.ngay_het_han_hdbt && String(c.loai_hd || '').trim()) ? new Date(c.ngay_het_han_hdbt) : null
      if (exp) { if (exp < today) expired++; else if (exp <= limit) expiring++ }
    }
    return { total: filtered.length, hasHd, expiring, expired }
  })()

  const [sortField, setSortField] = useState<string>("ten")
  const [sortAsc, setSortAsc] = useState<boolean>(true)

  const handleSort = (field: string) => {
    if (sortField === field) setSortAsc(prev => !prev)
    else { setSortField(field); setSortAsc(field === 'het_han' ? false : true) }
  }

  const sortedList = useMemo(() => {
    const list = [...filtered]
    list.sort((a, b) => {
      let cmp = 0
      if (sortField === 'ma_may') cmp = String(a.ma_may || '').localeCompare(String(b.ma_may || ''), 'vi', { numeric: true, sensitivity: 'base' })
      else if (sortField === 'serial') cmp = String(a.serial || '').localeCompare(String(b.serial || ''), 'vi', { numeric: true, sensitivity: 'base' })
      else if (sortField === 'ten') cmp = String(a.ten_khach_hang || '').localeCompare(String(b.ten_khach_hang || ''), 'vi', { numeric: true, sensitivity: 'base' })
      else if (sortField === 'model') cmp = String(a.model || '').localeCompare(String(b.model || ''), 'vi', { numeric: true, sensitivity: 'base' })
      else if (sortField === 'hang') cmp = String(a.hang || '').localeCompare(String(b.hang || ''), 'vi', { numeric: true, sensitivity: 'base' })
      else if (sortField === 'km') cmp = (Number(a.km_mac_dinh) || 0) - (Number(b.km_mac_dinh) || 0)
      else if (sortField === 'loai_hd') cmp = String(a.loai_hd || '').localeCompare(String(b.loai_hd || ''), 'vi', { numeric: true, sensitivity: 'base' })
      else if (sortField === 'het_han') cmp = String(a.ngay_het_han_hdbt || '').localeCompare(String(b.ngay_het_han_hdbt || ''))
      else if (sortField === 'lich_bt') cmp = moTaLichBaoTri(a.thang_bao_tri).localeCompare(moTaLichBaoTri(b.thang_bao_tri), 'vi', { numeric: true, sensitivity: 'base' })
      if (cmp === 0) cmp = String(a.ma_may || '').localeCompare(String(b.ma_may || ''), 'vi', { numeric: true, sensitivity: 'base' })
      if (cmp === 0) cmp = String(a.id || '').localeCompare(String(b.id || ''))
      return sortAsc ? cmp : -cmp
    })
    return list
  }, [filtered, sortField, sortAsc])

  const paged = usePaged(sortedList)
  const [pendingScroll, setPendingScroll] = useState("")

  const viewRow = (id: string) => {
    setEditing(null)
    setSearch(""); setHdFilter("all")
    setHighlightCust(id)
    setPendingScroll(id)
  }
  useEffect(() => {
    if (!pendingScroll) return
    const el = document.getElementById('kh-' + pendingScroll)
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setPendingScroll(""); return }
    const idx = sortedList.findIndex(c => c.id === pendingScroll)
    if (idx >= 0) {
      const target = Math.floor(idx / paged.perPage) + 1
      if (paged.page !== target) paged.setPage(target)
    }
  }, [pendingScroll, paged.page, sortedList]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <StatRow>
        <StatCard label="Khách hàng" value={custStats.total.toLocaleString('vi-VN')} sub={`trên ${customers.length.toLocaleString('vi-VN')} tất cả`} icon={Users} tone="blue" />
        <StatCard label="Có hợp đồng" value={custStats.hasHd.toLocaleString('vi-VN')} sub="HĐBT / MF" icon={ClipboardCheck} tone="emerald" />
        <StatCard label="Sắp hết hạn" value={custStats.expiring.toLocaleString('vi-VN')} sub={`trong ${hdbtCanhBaoThang} tháng`} icon={Clock} tone="amber" />
        <StatCard label="Đã hết hạn" value={custStats.expired.toLocaleString('vi-VN')} sub="cần ký tiếp" icon={AlertTriangle} tone="rose" />
      </StatRow>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Tìm mã máy, serial, tên KH, địa chỉ, model, HĐ..." className="pl-9 pr-7 bg-white h-9 text-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-semibold" title="Xóa tìm kiếm">✕</button>}
          </div>
          <div className="relative shrink-0">
            <button type="button" onClick={() => setFilterOpen(o => !o)} className="h-9 px-3 rounded-md border border-slate-200 text-xs bg-white flex items-center gap-2 min-w-[13rem] justify-between hover:border-slate-300">
              <span className="truncate">{filterLabel}</span>
              <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {filterOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setFilterOpen(false)} />
                <div className="absolute z-40 mt-1 w-56 bg-white border border-slate-200 rounded-md shadow-lg py-1 text-sm">
                  <button type="button" onClick={() => selectFilter('all')} className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 ${hdFilter === 'all' ? 'text-blue-700 font-medium' : 'text-slate-700'}`}>Tất cả</button>
                  <button type="button" onClick={() => selectFilter('has')} className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 ${hdFilter === 'has' ? 'text-blue-700 font-medium' : 'text-slate-700'}`}>Có hợp đồng</button>
                  <button type="button" onClick={() => selectFilter('expiring')} className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 ${hdFilter === 'expiring' ? 'text-blue-700 font-medium' : 'text-slate-700'}`}>Sắp hết hạn ({hdbtCanhBaoThang} tháng)</button>
                  <button type="button" onClick={() => selectFilter('expired')} className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 ${hdFilter === 'expired' ? 'text-blue-700 font-medium' : 'text-slate-700'}`}>Đã hết hạn</button>
                  {loaiHdOptions.length > 0 && (
                    <div className="relative group border-t border-slate-100 mt-1 pt-1">
                      <div className="flex items-center justify-between px-3 py-1.5 text-slate-700 hover:bg-slate-50 cursor-default">
                        <span>Theo loại hợp đồng</span>
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                      </div>
                      <div className="hidden group-hover:block absolute left-full top-0 -mt-1 w-44 bg-white border border-slate-200 rounded-md shadow-lg py-1">
                        {loaiHdOptions.map(v => (
                          <button type="button" key={v} onClick={() => selectFilter(`hd:${v}`)} className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 ${hdFilter === `hd:${v}` ? 'text-blue-700 font-medium' : 'text-slate-700'}`}>{v}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500 whitespace-nowrap">
            {(q || hdFilter !== 'all') ? `${filtered.length} / ${customers.length}` : `Tổng: ${customers.length}`} khách hàng
          </span>
          <Button onClick={() => setEditing({ ten_khach_hang: "", ma_may: "", serial: "", model: "", hang: "", dia_chi: "", km_mac_dinh: "", loai_hd: "", ngay_het_han_hdbt: "", thang_bao_tri: "", bat_dau_tu_thang: "", tam_dung_tu_thang: "", ghi_chu_bao_tri: "", ma_so_thue: "", email_ke_toan: "" })} className="gap-1 bg-blue-600 hover:bg-blue-700 h-9 px-3 text-xs font-semibold whitespace-nowrap">
            <Plus className="w-4 h-4" /> Thêm mới
          </Button>
          <ColumnMenu view={col} />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200 shadow-sm">
            <tr>
              {col.show('ma_may') && <th onClick={() => handleSort('ma_may')} className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 ${sortField === 'ma_may' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}><div className="flex items-center gap-1">Mã máy{sortField === 'ma_may' && (sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div></th>}
              {col.show('serial') && <th onClick={() => handleSort('serial')} className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 ${sortField === 'serial' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}><div className="flex items-center gap-1">Serial{sortField === 'serial' && (sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div></th>}
              {col.show('ten') && <th onClick={() => handleSort('ten')} className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 ${sortField === 'ten' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}><div className="flex items-center gap-1">Khách hàng{sortField === 'ten' && (sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div></th>}
              {col.show('model') && <th onClick={() => handleSort('model')} className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 ${sortField === 'model' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}><div className="flex items-center gap-1">Model{sortField === 'model' && (sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div></th>}
              {col.show('hang') && <th onClick={() => handleSort('hang')} className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 ${sortField === 'hang' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}><div className="flex items-center gap-1">Hãng{sortField === 'hang' && (sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div></th>}
              {col.show('km') && <th onClick={() => handleSort('km')} className={`px-4 py-3 font-semibold text-center cursor-pointer select-none transition-colors hover:bg-slate-100 ${sortField === 'km' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}><div className="flex items-center justify-center gap-1">KM{sortField === 'km' && (sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div></th>}
              {col.show('loai_hd') && <th onClick={() => handleSort('loai_hd')} className={`px-4 py-3 font-semibold text-center cursor-pointer select-none transition-colors hover:bg-slate-100 ${sortField === 'loai_hd' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}><div className="flex items-center justify-center gap-1">Loại HĐ{sortField === 'loai_hd' && (sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div></th>}
              {col.show('het_han') && <th onClick={() => handleSort('het_han')} className={`px-4 py-3 font-semibold text-center cursor-pointer select-none transition-colors hover:bg-slate-100 ${sortField === 'het_han' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}><div className="flex items-center justify-center gap-1">Hết hạn hợp đồng{sortField === 'het_han' && (sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div></th>}
              {col.show('lich_bt') && <th onClick={() => handleSort('lich_bt')} className={`px-4 py-3 font-semibold text-center cursor-pointer select-none transition-colors hover:bg-slate-100 ${sortField === 'lich_bt' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}><div className="flex items-center justify-center gap-1">Lịch bảo trì{sortField === 'lich_bt' && (sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div></th>}
              {col.show('sua') && <th className="px-4 py-3 font-semibold text-center w-20">Thao tác</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {customers.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Chưa có khách hàng nào. Nhập dữ liệu ở mục bên dưới.</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Không tìm thấy khách hàng khớp từ khóa.</td></tr>
            ) : paged.pageItems.map((c) => {
              const hd = hdbtStatus(c.ngay_het_han_hdbt)
              return (
                <tr key={c.id} id={'kh-' + c.id} className={`transition-colors ${highlightCust === c.id ? 'bg-amber-100' : 'hover:bg-slate-50'}`}>
                  {col.show('ma_may') && <td className="px-4 py-3 font-mono font-medium text-slate-700">{c.ma_may || <span className="text-slate-400 italic">—</span>}</td>}
                  {col.show('serial') && <td className="px-4 py-3 font-mono text-slate-500">{c.serial || <span className="text-slate-400 italic">—</span>}</td>}
                  {col.show('ten') && <td className="px-4 py-3 font-medium text-slate-800">{c.ten_khach_hang}<div className="text-xs text-slate-400 font-normal truncate max-w-xs" title={c.dia_chi}>{c.dia_chi}</div></td>}
                  {col.show('model') && <td className="px-4 py-3">{c.model || <span className="text-slate-400 italic">—</span>}</td>}
                  {col.show('hang') && <td className="px-4 py-3">{c.hang || <span className="text-slate-400 italic">—</span>}</td>}
                  {col.show('km') && <td className="px-4 py-3 text-center whitespace-nowrap">{c.km_mac_dinh != null ? `${Number(c.km_mac_dinh).toLocaleString('vi-VN')}` : '—'}</td>}
                  {col.show('loai_hd') && <td className="px-4 py-3 text-center">{c.loai_hd || <span className="text-slate-300">—</span>}</td>}
                  {col.show('het_han') && <td className="px-4 py-3 text-center whitespace-nowrap">
                    {hd ? <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${hd.cls}`} title={hd.note}>{hd.label}</span> : <span className="text-slate-300">—</span>}
                  </td>}
                  {col.show('lich_bt') && <td className="px-4 py-3 text-center whitespace-nowrap">
                    {!LOAI_HD_BAO_TRI.includes(String(c.loai_hd || '').trim())
                      ? <span className="text-slate-300">—</span>
                      : c.tam_dung_tu_thang
                        ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold border bg-slate-100 text-slate-600 border-slate-200" title={c.ghi_chu_bao_tri || ''}>Tạm dừng từ {fmtThang(c.tam_dung_tu_thang)}</span>
                        : <span className="text-xs text-slate-600">
                            {moTaLichBaoTri(c.thang_bao_tri)}
                            {c.bat_dau_tu_thang && <span className="text-slate-400"> · từ {fmtThang(c.bat_dau_tu_thang)}</span>}
                          </span>}
                  </td>}
                  {col.show('sua') && <td className="px-4 py-3 text-center">
                    <button onClick={() => setEditing({ ...c, ngay_het_han_hdbt: c.ngay_het_han_hdbt || "" })} className="text-blue-500 hover:text-blue-700 p-1.5 bg-blue-50 hover:bg-blue-100 rounded-md transition"><PenSquare className="w-4 h-4" /></button>
                  </td>}
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
        <div className="px-4 pb-2">
          <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} perPage={paged.perPage} onPage={paged.setPage} />
        </div>
      </div>

      {/* Modal sửa khách hàng */}
      {editing && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-slate-800">{editing.id ? 'Sửa khách hàng' : 'Thêm khách hàng mới'}</h3>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>
            <div className="p-5 overflow-y-auto space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                <div className="space-y-4">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Khách hàng</div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">Tên khách hàng</label>
                    <Input value={editing.ten_khach_hang || ""} onChange={(e) => setEditing({ ...editing, ten_khach_hang: e.target.value })} className="bg-white" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">Địa chỉ <span className="font-normal text-slate-400">(hóa đơn)</span></label>
                    <Input value={editing.dia_chi || ""} onChange={(e) => setEditing({ ...editing, dia_chi: e.target.value })} className="bg-white" />
                    <label className="text-xs font-semibold text-slate-600 flex items-center gap-1 mt-2"><MapPin className="w-3 h-3 text-blue-500" /> Nơi đặt máy <span className="font-normal text-slate-400">(KTV đến — để trống nếu trùng địa chỉ)</span></label>
                    <Input value={editing.vi_tri_dat_may || ""} onChange={(e) => setEditing({ ...editing, vi_tri_dat_may: e.target.value })} placeholder="VD: Tầng 3, chi nhánh Nội Bài" className="bg-white" />
                  </div>
                  {(editing.ma_khach_cum && editing.soct_khach_cum) ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-600">Mã số thuế <span className="font-normal text-slate-400">(hóa đơn)</span></label>
                        <Input value={editing.soct_khach_cum.ma_so_thue || ""} readOnly className="bg-slate-50 font-mono text-slate-600" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-600">Email nhận HĐ</label>
                        <Input value={editing.soct_khach_cum.email_ke_toan || ""} readOnly className="bg-slate-50 text-slate-600" />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-600">Mã số thuế <span className="font-normal text-slate-400">(hóa đơn)</span></label>
                          <Input value={editing.ma_so_thue || ""} onChange={(e) => setEditing({ ...editing, ma_so_thue: e.target.value })} placeholder="MST của điểm máy này" className="bg-white font-mono" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-600">Email nhận HĐ</label>
                          <Input value={editing.email_ke_toan || ""} onChange={(e) => setEditing({ ...editing, email_ke_toan: e.target.value })} placeholder="Email kế toán (tùy chọn)" className="bg-white" />
                        </div>
                      </div>
                      <p className="t2 text-slate-400 -mt-1">Điểm máy CHƯA gán vào cụm khách → MST/Email này được dùng khi lên hóa đơn. Nếu đã gán cụm thì lấy theo cụm.</p>
                    </>
                  )}

                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1">Thông tin máy</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600">Mã máy</label>
                      <Input value={editing.ma_may || ""} onChange={(e) => setEditing({ ...editing, ma_may: e.target.value })} className={`bg-white ${dupCust ? 'border-amber-400 focus:ring-amber-400' : ''}`} />
                      {dupCust && (
                        <div className="text-xs text-amber-600 flex items-center gap-1 flex-wrap">
                          ⚠ Trùng mã của: {dupCust.ten_khach_hang}.
                          <button type="button" onClick={() => viewRow(dupCust.id)} className="underline font-medium">Xem dòng</button>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600">Serial máy</label>
                      <Input value={editing.serial || ""} onChange={(e) => setEditing({ ...editing, serial: e.target.value })} className={`bg-white ${dupSerial ? 'border-amber-400 focus:ring-amber-400' : ''}`} placeholder="Tùy chọn (nên có với máy thuê)" />
                      {dupSerial && (
                        <div className="text-xs text-amber-600 flex items-center gap-1 flex-wrap">
                          ⚠ Trùng serial của: {dupSerial.ten_khach_hang}.
                          <button type="button" onClick={() => viewRow(dupSerial.id)} className="underline font-medium">Xem dòng</button>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600">Model</label>
                      <Input value={editing.model || ""} onChange={(e) => setEditing({ ...editing, model: e.target.value })} className="bg-white" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600">Hãng máy</label>
                      <select className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white" value={editing.hang || ""} onChange={(e) => setEditing({ ...editing, hang: e.target.value })}>
                        <option value="">— Không —</option>
                        {hangOptions.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Hợp đồng</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600">Loại hợp đồng</label>
                      <select className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white" value={editing.loai_hd || ""} onChange={(e) => setEditing({ ...editing, loai_hd: e.target.value })}>
                        <option value="">— Không —</option>
                        {loaiHdOptions.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600">Khoảng cách (km)</label>
                      {editing.id
                        ? <Input type="number" step="0.1" value={editing.km_mac_dinh ?? ""} onChange={(e) => setEditing({ ...editing, km_mac_dinh: e.target.value })} className="bg-white" />
                        : <Input value="Tự tính từ địa chỉ" disabled className="bg-slate-50 text-slate-400" />}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">Ngày hết hạn hợp đồng</label>
                    <DateField value={editing.ngay_het_han_hdbt || ""} onChange={(v) => setEditing({ ...editing, ngay_het_han_hdbt: v })} />
                  </div>
                  <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-md px-3 py-2">
                    Khối <b>Lịch bảo trì</b> bên dưới chỉ áp dụng cho máy <b>HĐBT</b> hoặc <b>MF</b>. Loại HĐ khác sẽ được khóa.
                  </p>
                </div>
              </div>

              {(() => {
                const baoTriOn = ['HĐBT', 'MF'].includes((editing.loai_hd || '').trim())
                return (
                  <div className="border-t border-slate-100 pt-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Lịch bảo trì</div>
                      {!baoTriOn && <span className="t2 text-slate-400">— chỉ áp dụng cho HĐBT / MF</span>}
                    </div>
                    <div className={baoTriOn ? '' : 'opacity-50 pointer-events-none select-none'} aria-disabled={!baoTriOn}>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-600">
                          Các tháng phải bảo trì <span className="font-normal text-slate-400">— chọn đủ 12 tháng = hằng tháng</span>
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                            const on = coBaoTriThang(editing.thang_bao_tri, m)
                            return (
                              <button key={m} type="button" disabled={!baoTriOn}
                                onClick={() => {
                                  const cur = new Set(parseThangBaoTri(editing.thang_bao_tri).length
                                    ? parseThangBaoTri(editing.thang_bao_tri)
                                    : Array.from({ length: 12 }, (_, i) => i + 1))
                                  if (cur.has(m)) { if (cur.size === 1) return; cur.delete(m) } else cur.add(m)
                                  setEditing({ ...editing, thang_bao_tri: formatThangBaoTri(Array.from(cur)) })
                                }}
                                className={`w-10 h-8 rounded-md border text-xs font-semibold transition ${on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                              >T{m}</button>
                            )
                          })}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Đang đặt: <b className="text-slate-600">{moTaLichBaoTri(editing.thang_bao_tri)}</b></p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-600">Bắt đầu theo dõi từ tháng</label>
                          <input type="month" disabled={!baoTriOn} value={editing.bat_dau_tu_thang || ""} onChange={(e) => setEditing({ ...editing, bat_dau_tu_thang: e.target.value })}
                            className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
                          <p className="text-xs text-slate-400">Máy lắp giữa năm → chọn tháng lắp. Trống = đã có từ trước.</p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-600">Tạm dừng bảo trì từ tháng</label>
                          <input type="month" disabled={!baoTriOn} value={editing.tam_dung_tu_thang || ""} onChange={(e) => setEditing({ ...editing, tam_dung_tu_thang: e.target.value })}
                            className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
                          <p className="text-xs text-slate-400">Trống = đang theo dõi. Có giá trị = không đòi bảo trì từ tháng đó.</p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-600">Ghi chú bảo trì</label>
                          <Input value={editing.ghi_chu_bao_tri || ""} disabled={!baoTriOn} onChange={(e) => setEditing({ ...editing, ghi_chu_bao_tri: e.target.value })} placeholder="VD: khách bỏ máy, còn trong HĐ" className="bg-white disabled:bg-slate-50" />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="bg-slate-50 p-4 flex justify-end gap-2 border-t border-slate-100 shrink-0">
              <Button variant="outline" onClick={() => setEditing(null)}>Hủy</Button>
              <Button onClick={handleSave} disabled={saving || !!dupCust || !!dupSerial}>{saving ? "Đang lưu..." : (editing.id ? "Lưu" : "Tạo khách hàng")}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
