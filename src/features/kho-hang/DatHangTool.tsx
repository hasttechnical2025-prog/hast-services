'use client'
import { useState, useEffect, useMemo } from 'react'
import { ShoppingCart, CheckCircle2, Package, AlertTriangle, Search, Download, Plus, Trash2, PenSquare, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import DateField from '@/components/DateField'
import { useConfirm } from '@/components/ConfirmDialog'
import { useRealtimeRefetch } from '@/lib/useRealtime'
import { DATHANG_TOPIC, DATA_EVENT } from '@/lib/realtime'
import { exportRowsToExcel } from '@/lib/excel'
import { usePaged, Pagination, StatCard, StatRow, BoxLoading } from '@/ui'
import type { DatHangLine } from './useDatHangCart'

// Port NGUYÊN DatHangTool từ admin (y hệt): rà soát tồn + giỏ hàng + đơn đặt + hàng về.
// confirmDelete(dat_hang_ct) → useConfirm nội bộ + deleteLineItem. StatCards → StatRow/StatCard.
export function DatHangTool({
  inventory,
  committed,
  nhaCungCapOptions,
  hangOptions,
  onUpdateSuccess,
  showNotification,
  currentUserRole,
  lines,
  setLines,
  canhBao,
}: {
  inventory: any[]
  committed: Record<string, number>
  nhaCungCapOptions: string[]
  hangOptions: string[]
  onUpdateSuccess: () => void
  showNotification: (type: 'success' | 'error', msg: string) => void
  currentUserRole: string
  lines: DatHangLine[]
  setLines: React.Dispatch<React.SetStateAction<DatHangLine[]>>
  canhBao?: any[]
}) {
  const { confirm, confirmNode } = useConfirm()
  const [form, setForm] = useState({ ngay_dat: new Date().toISOString().split('T')[0], nha_cung_cap: "", so_don_hang: "", da_dat: false })
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [receiving, setReceiving] = useState<{ ctId: string, ngay_nhan: string, so_luong_nhan: string, ma_dat: string, ma_hang: string } | null>(null)
  const [delId, setDelId] = useState<string | null>(null)
  const [orderFilters, setOrderFilters] = useState({ maHang: "", ncc: "", trangThai: "con_thieu", hvTu: "", hvDen: "" })

  const [leftSearch, setLeftSearch] = useState("")
  const [leftModel, setLeftModel] = useState("")
  const [leftHang, setLeftHang] = useState("")
  const [leftLowStock, setLeftLowStock] = useState(false)
  const [leftUnderWarn, setLeftUnderWarn] = useState(false)
  const [leftQuantities, setLeftQuantities] = useState<Record<string, string>>({})
  const [leftSortField, setLeftSortField] = useState<string>("model")
  const [leftSortAsc, setLeftSortAsc] = useState<boolean>(true)

  const canhBaoMap = useMemo(() => {
    const m = new Map<string, any>()
    for (const c of (canhBao || [])) { if (c?.ma_hang) m.set(c.ma_hang, c) }
    return m
  }, [canhBao])

  const getUnderWarnInfo = useMemo(() => (item: any) => {
    const cb = canhBaoMap.get(item.ma_hang)
    const nguong = cb?.nguong_dat != null ? Number(cb.nguong_dat) : (item.nguong_dat != null ? Number(item.nguong_dat) : null)
    if (nguong != null && nguong > 0) {
      const ton = Number(item.ton_kho) || 0
      if (ton <= nguong) { const thieu = Math.max(1, nguong - ton); return { isUnder: true, nguong, thieu } }
    }
    return { isUnder: false, nguong: null as number | null, thieu: 0 }
  }, [canhBaoMap])

  const underWarnItems = useMemo(() => inventory.filter(item => !item.ngung_su_dung && getUnderWarnInfo(item).isUnder), [inventory, getUnderWarnInfo])

  const handleLeftSort = (field: string) => {
    if (leftSortField === field) setLeftSortAsc(prev => !prev)
    else { setLeftSortField(field); setLeftSortAsc(true) }
  }

  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [excelSuccessModal, setExcelSuccessModal] = useState<{ isOpen: boolean, order: any } | null>(null)
  const [tab, setTab] = useState<'tao_don' | 'danh_sach'>('tao_don')

  const getPendingInfo = (ma_hang: string) => {
    let pendingQty = 0
    const details: string[] = []
    for (const o of orders) {
      if (o.hoan_thanh) continue
      const line = (o.soct_dat_hang_ct || []).find((l: any) => l.ma_hang === ma_hang)
      if (line) {
        const nhan = (line.soct_hang_ve_dot || []).reduce((s: number, h: any) => s + h.so_luong_nhan, 0)
        const thieu = line.sl_dat - nhan
        if (thieu > 0) { pendingQty += thieu; details.push(`• Đơn ${o.so_don_hang || 'nháp'} (${o.nha_cung_cap || 'Chưa có NCC'}): thiếu ${thieu} cái`) }
      }
    }
    return { pendingQty, tooltip: details.length > 0 ? `HÀNG CHỜ VỀ:\n${details.join('\n')}` : "" }
  }

  const addToCart = (ma_hang: string, qtyStr: string) => {
    const qty = parseInt(qtyStr, 10) || 0
    if (qty <= 0) return showNotification('error', "Nhập số lượng lớn hơn 0")
    const { pendingQty } = getPendingInfo(ma_hang)
    setLines(prev => {
      const existing = prev.find(l => l.ma_hang === ma_hang)
      if (existing) return prev.map(l => l.ma_hang === ma_hang ? { ...l, sl_dat: String(Number(l.sl_dat) + qty) } : l)
      return [...prev, { ma_hang, sl_dat: String(qty) }]
    })
    setLeftQuantities(prev => ({ ...prev, [ma_hang]: "" }))
    if (pendingQty > 0) showNotification('error', `Lưu ý: Mã này vẫn còn ${pendingQty} cái đang chờ giao từ các đơn cũ. Đã thêm ${qty} cái vào giỏ hàng.`)
    else showNotification('success', `Đã nhặt vật tư vào giỏ hàng.`)
  }

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/dat-hang')
      const json = await res.json()
      setOrders(json.data || [])
    } catch { showNotification('error', "Không tải được đơn đặt hàng") }
    finally { setLoading(false) }
  }
  useEffect(() => { fetchOrders() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useRealtimeRefetch(DATHANG_TOPIC, DATA_EVENT, () => fetchOrders())

  const genSoDon = (ngay: string) => {
    const d = new Date(ngay)
    const p = `PO-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-`
    let max = 0
    for (const o of orders) if (o.so_don_hang?.startsWith(p)) { const n = parseInt(o.so_don_hang.slice(p.length)) || 0; if (n > max) max = n }
    return p + String(max + 1).padStart(3, '0')
  }
  useEffect(() => {
    if (editingDraftId) return
    setForm(f => (!f.so_don_hang || /^PO-\d{6}-\d{3}$/.test(f.so_don_hang)) ? { ...f, so_don_hang: genSoDon(f.ngay_dat) } : f)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, form.ngay_dat, editingDraftId])

  const filteredOrders = orders.filter(o => {
    const of = orderFilters
    if (of.trangThai === 'con_thieu' && o.hoan_thanh) return false
    else if (of.trangThai === 'nhap' && o.da_dat) return false
    else if (of.trangThai === 'da_dat' && (!o.da_dat || o.hoan_thanh)) return false
    else if (of.trangThai === 'hoan_thanh' && !o.hoan_thanh) return false
    if (of.ncc && o.nha_cung_cap !== of.ncc) return false
    if (of.maHang) {
      const q = of.maHang.trim().toLowerCase()
      if (!(o.soct_dat_hang_ct || []).some((l: any) => (l.ma_hang || '').toLowerCase().includes(q) || (l.soct_kho_hang?.ten_hang || '').toLowerCase().includes(q))) return false
    }
    if (of.hvTu || of.hvDen) {
      const receipts = (o.soct_dat_hang_ct || []).flatMap((l: any) => l.soct_hang_ve_dot || [])
      if (!receipts.some((h: any) => (!of.hvTu || h.ngay_nhan >= of.hvTu) && (!of.hvDen || h.ngay_nhan <= of.hvDen))) return false
    }
    return true
  })
  const dhPaged = usePaged(filteredOrders)

  const updLine = (i: number, f: 'ma_hang' | 'sl_dat', v: string) => setLines(p => p.map((l, idx) => idx === i ? { ...l, [f]: v } : l))
  const rmLine = (i: number) => setLines(p => p.filter((_, idx) => idx !== i))

  const deleteLineItem = async (lineId: string) => {
    try {
      const res = await fetch(`/api/admin/dat-hang?line_id=${lineId}`, { method: 'DELETE' })
      if (res.ok) { showNotification('success', "Đã xóa mục hàng thành công (hoàn tồn kho đợt đã nhận)."); onUpdateSuccess(); fetchOrders() }
      else { const j = await res.json(); showNotification('error', j.error || "Xóa mục hàng thất bại.") }
    } catch { showNotification('error', "Lỗi kết nối!") }
  }

  const ORDER_XLSX_HEADERS = ['Số đơn', 'Ngày đặt', 'Nhà cung cấp', 'Mã hàng', 'Tên hàng', 'Model', 'SL đặt', 'Ghi chú']
  const orderLineRow = (o: any, l: any) => [o.so_don_hang || '', fmtDate(o.ngay_dat), o.nha_cung_cap || '', l.ma_hang, l.soct_kho_hang?.ten_hang || '', l.soct_kho_hang?.model || '', l.sl_dat, '']

  const REPORT_XLSX_HEADERS = ['Số đơn', 'Ngày đặt', 'Nhà cung cấp', 'Mã hàng', 'Tên hàng', 'Model', 'SL đặt', 'Ghi chú', 'Đã nhận', 'Còn thiếu', 'Các đợt hàng về']
  const reportLineRow = (o: any, l: any) => {
    const nhan = daNhan(l)
    const receipts = (l.soct_hang_ve_dot || []).map((h: any) => `${fmtDate(h.ngay_nhan)}: ${h.so_luong_nhan}${h.ma_hang && h.ma_hang !== l.ma_hang ? ` (mã ${h.ma_hang})` : ''}`).join(', ')
    return [o.so_don_hang || '', fmtDate(o.ngay_dat), o.nha_cung_cap || '', l.ma_hang, l.soct_kho_hang?.ten_hang || '', l.soct_kho_hang?.model || '', l.sl_dat, '', nhan, l.sl_dat - nhan, receipts || '—']
  }

  const exportSingleOrderExcel = (o: any) => {
    const rows = (o.soct_dat_hang_ct || []).map((l: any) => orderLineRow(o, l))
    exportRowsToExcel(`Don-hang-${o.so_don_hang || 'nhap'}`, ORDER_XLSX_HEADERS, rows)
  }

  const exportPendingItemsExcel = () => {
    const pendingLines: any[][] = []
    for (const o of orders) {
      if (o.hoan_thanh) continue
      for (const l of (o.soct_dat_hang_ct || [])) { if (l.sl_dat - daNhan(l) > 0) pendingLines.push(reportLineRow(o, l)) }
    }
    if (pendingLines.length === 0) return showNotification('error', "Không có vật tư nào còn nợ chờ về.")
    exportRowsToExcel('Danh-sach-hang-cho-ve', REPORT_XLSX_HEADERS, pendingLines)
  }

  const handleCreate = async (isDaDat: boolean) => {
    if (!form.nha_cung_cap.trim()) return showNotification('error', "Vui lòng chọn hoặc nhập Nhà cung cấp")
    const valid = lines.filter(l => l.ma_hang && parseInt(l.sl_dat) > 0)
    if (valid.length === 0) return showNotification('error', "Thêm ít nhất một dòng hàng hợp lệ")
    setSaving(true)
    try {
      const payload = { ...form, da_dat: isDaDat, lines: valid }
      let res
      if (editingDraftId) res = await fetch('/api/admin/dat-hang', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, id: editingDraftId }) })
      else res = await fetch('/api/admin/dat-hang', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (res.ok) {
        const resJson = await res.json()
        showNotification('success', editingDraftId ? "Đã cập nhật đơn hàng!" : "Đã tạo đơn đặt hàng thành công.")
        const createdOrder = resJson.data || form
        setForm({ ngay_dat: new Date().toISOString().split('T')[0], nha_cung_cap: "", so_don_hang: "", da_dat: false })
        setLines([])
        setEditingDraftId(null)
        fetchOrders()
        setExcelSuccessModal({ isOpen: true, order: createdOrder })
      } else { const err = await res.json(); showNotification('error', err.error) }
    } catch { showNotification('error', "Lỗi kết nối!") } finally { setSaving(false) }
  }

  const orderReceived = (o: any) => (o.soct_dat_hang_ct || []).reduce((s: number, l: any) => s + daNhan(l), 0)

  const toggleDaDat = async (o: any) => {
    if (o.da_dat && orderReceived(o) > 0) return showNotification('error', 'Đơn đã nhận hàng — không thể chuyển về Nháp.')
    const res = await fetch('/api/admin/dat-hang', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: o.id, da_dat: !o.da_dat }) })
    if (res.ok) fetchOrders(); else { const j = await res.json().catch(() => ({})); showNotification('error', j.error || 'Cập nhật không thành công') }
  }
  const deleteOrder = async (id: string) => {
    const res = await fetch(`/api/admin/dat-hang?id=${id}`, { method: 'DELETE' })
    setDelId(null)
    if (res.ok) {
      showNotification('success', "Đã xóa đơn (hoàn tồn kho các đợt đã nhận)."); onUpdateSuccess(); fetchOrders()
      if (editingDraftId === id) { setEditingDraftId(null); setLines([]) }
    } else { const j = await res.json().catch(() => ({})); showNotification('error', j.error || 'Xóa không thành công') }
  }
  const saveReceipt = async () => {
    if (!receiving || !(parseInt(receiving.so_luong_nhan) > 0)) return showNotification('error', "Nhập số lượng nhận")
    const res = await fetch('/api/admin/hang-ve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(receiving.ctId ? { id_dat_hang_ct: receiving.ctId, ngay_nhan: receiving.ngay_nhan, so_luong_nhan: receiving.so_luong_nhan, ma_hang: receiving.ma_hang } : {}) })
    if (res.ok) { showNotification('success', "Đã ghi hàng về (tồn kho tự cộng)."); setReceiving(null); onUpdateSuccess(); fetchOrders() }
    else { const err = await res.json(); showNotification('error', err.error) }
  }
  const deleteReceipt = async (id: string, qty?: number, maHang?: string) => {
    if (qty && qty > 0) {
      if (!(await confirm(`Xóa đợt hàng về này sẽ TRỪ ${qty}${maHang ? ` (${maHang})` : ''} khỏi tồn kho.\nChỉ làm khi ghi NHẦM (hàng thực chưa về). Tiếp tục?`, { confirmLabel: 'Tiếp tục' }))) return
    }
    const res = await fetch(`/api/admin/hang-ve?id=${id}`, { method: 'DELETE' })
    if (res.ok) { showNotification('success', 'Đã xóa đợt hàng về (trừ tồn tương ứng).'); onUpdateSuccess(); fetchOrders() } else showNotification('error', "Xóa đợt hàng về không thành công")
  }

  const fmtDate = (s: string) => { if (!s) return ''; const d = new Date(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` }
  const daNhan = (line: any) => (line.soct_hang_ve_dot || []).reduce((s: number, h: any) => s + h.so_luong_nhan, 0)

  const exportOrdersExcel = () => {
    const rows: any[][] = []
    for (const o of filteredOrders) for (const l of (o.soct_dat_hang_ct || [])) rows.push(reportLineRow(o, l))
    exportRowsToExcel('dat-hang', REPORT_XLSX_HEADERS, rows)
  }

  const orderStats = (() => {
    let daDat = 0, done = 0, thieu = 0
    for (const o of filteredOrders) {
      if (o.da_dat) daDat++
      if (o.hoan_thanh) done++
      for (const l of (o.soct_dat_hang_ct || [])) thieu += Math.max(0, (Number(l.sl_dat) || 0) - daNhan(l))
    }
    return { total: filteredOrders.length, daDat, done, thieu }
  })()

  const sortedLeftInventory = useMemo(() => {
    const filtered = inventory.filter(item => {
      if (item.ngung_su_dung) return false
      if (leftSearch) {
        const q = leftSearch.trim().toLowerCase()
        const match = (item.ma_hang || '').toLowerCase().includes(q) || (item.ten_hang || '').toLowerCase().includes(q)
        if (!match) return false
      }
      if (leftModel) {
        const qModel = leftModel.trim().toLowerCase()
        if (!String(item.model || '').toLowerCase().includes(qModel)) return false
      }
      if (leftHang && String(item.hang || '').trim().toLowerCase() !== leftHang.trim().toLowerCase()) return false
      if (leftLowStock && item.ton_kho > 0) return false
      if (leftUnderWarn && !getUnderWarnInfo(item).isUnder) return false
      return true
    })
    filtered.sort((a, b) => {
      let cmp = 0
      if (leftSortField === 'vattu') {
        cmp = String(a.ma_hang || '').localeCompare(String(b.ma_hang || ''), 'vi', { numeric: true, sensitivity: 'base' })
      } else if (leftSortField === 'model') {
        const mA = String(a.model || '').trim(); const mB = String(b.model || '').trim()
        if (!mA && mB) return 1; if (mA && !mB) return -1
        cmp = mA.localeCompare(mB, 'vi', { numeric: true, sensitivity: 'base' })
      } else if (leftSortField === 'ton_kho') {
        const kdA = (Number(a.ton_kho) || 0) - (committed[a.ma_hang] || 0)
        const kdB = (Number(b.ton_kho) || 0) - (committed[b.ma_hang] || 0)
        cmp = kdA - kdB
      } else if (leftSortField === 'cho_ve') {
        cmp = getPendingInfo(a.ma_hang).pendingQty - getPendingInfo(b.ma_hang).pendingQty
      }
      if (cmp === 0) cmp = String(a.ma_hang || '').localeCompare(String(b.ma_hang || ''))
      return leftSortAsc ? cmp : -cmp
    })
    return filtered
  }, [inventory, leftSearch, leftModel, leftHang, leftLowStock, leftUnderWarn, leftSortField, leftSortAsc, committed, orders, getUnderWarnInfo]) // eslint-disable-line react-hooks/exhaustive-deps

  const exportLeftInventory = () => {
    if (sortedLeftInventory.length === 0) { showNotification('error', 'Không có vật tư nào trong danh sách để xuất.'); return }
    const headers = ['Mã hàng', 'Tên hàng', 'Model', 'Hãng', 'Tồn kho', 'Có sẵn', 'Chờ về', 'Ngưỡng đặt']
    const rows = sortedLeftInventory.map((it: any) => {
      const giu = committed[it.ma_hang] || 0
      const coSan = (Number(it.ton_kho) || 0) - giu
      const choVe = getPendingInfo(it.ma_hang).pendingQty
      return [it.ma_hang, it.ten_hang || '', it.model || '', it.hang || '', Number(it.ton_kho) || 0, coSan, choVe || 0, it.nguong_dat ?? '']
    })
    const tag = leftHang ? `-${leftHang}` : ''
    exportRowsToExcel(`Ra-soat-kho${tag}`, headers, rows)
  }

  const handleAddAllUnderWarnToCart = () => {
    const targets = sortedLeftInventory.filter(item => getUnderWarnInfo(item).isUnder)
    if (targets.length === 0) return
    setLines(prev => {
      const copy = [...prev]
      for (const it of targets) {
        const info = getUnderWarnInfo(it)
        const qty = info.thieu || 1
        const idx = copy.findIndex(l => l.ma_hang === it.ma_hang)
        if (idx >= 0) copy[idx] = { ...copy[idx], sl_dat: String((Number(copy[idx].sl_dat) || 0) + qty) }
        else copy.push({ ma_hang: it.ma_hang, sl_dat: String(qty) })
      }
      return copy
    })
    showNotification('success', `Đã nhặt ${targets.length} món dưới ngưỡng vào giỏ hàng.`)
  }

  return (
    <div className="space-y-6">
      <StatRow>
        <StatCard label="Đơn hàng" value={orderStats.total.toLocaleString('vi-VN')} sub={`trên ${orders.length.toLocaleString('vi-VN')} tất cả`} icon={ShoppingCart} tone="blue" />
        <StatCard label="Đã đặt NCC" value={orderStats.daDat.toLocaleString('vi-VN')} sub={`${(orderStats.total - orderStats.daDat).toLocaleString('vi-VN')} còn nháp`} icon={CheckCircle2} tone="indigo" />
        <StatCard label="Đủ hàng" value={orderStats.done.toLocaleString('vi-VN')} sub="đã nhận đủ" icon={Package} tone="emerald" />
        <StatCard label="Còn thiếu" value={orderStats.thieu.toLocaleString('vi-VN')} sub="đơn vị chưa về" icon={AlertTriangle} tone="amber" />
      </StatRow>
      {confirmNode}

      {/* Thanh tab: Tạo đơn hàng · Danh sách đơn hàng (underline chuẩn v2) */}
      <div className="flex gap-1 border-b border-slate-200">
        {([['tao_don', 'Tạo đơn hàng'], ['danh_sach', 'Danh sách đơn hàng']] as const).map(([k, label]) => {
          const on = tab === k
          const draftCount = k === 'danh_sach' ? orders.filter(o => !o.da_dat).length : 0
          return (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-2 font-medium text-sm transition whitespace-nowrap border-b-2 inline-flex items-center gap-1.5 ${on ? 'border-blue-600 text-blue-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {label}
              {draftCount > 0 && <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white t3 font-bold" title={`${draftCount} đơn còn ở trạng thái Nháp`}>{draftCount}</span>}
            </button>
          )
        })}
      </div>

      {tab === 'tao_don' && (
      <>
      {/* FORM TẠO ĐƠN - SHOPPING CART UX */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* BÊN TRÁI: RÀ SOÁT TỒN KHO & CHỌN VẬT TƯ (3/5) */}
        <div className="lg:col-span-3 border border-slate-200 rounded-xl bg-white overflow-hidden flex flex-col shadow-sm">
          <div className="bg-slate-50 p-4 border-b border-slate-200 space-y-2.5">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
              <Search className="w-4 h-4 text-slate-500" /> Rà soát kho & Chọn vật tư đặt hàng
            </h3>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative w-44">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input placeholder="Gõ mã / tên vật tư..." className="pl-8 pr-6 h-9 text-xs bg-white" value={leftSearch} onChange={(e) => setLeftSearch(e.target.value)} />
                {leftSearch && <button onClick={() => setLeftSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs" title="Xóa tìm kiếm">✕</button>}
              </div>
              <div className="relative w-40">
                <Input placeholder="Tìm / gõ model..." className="h-9 text-xs bg-white pr-6" value={leftModel} onChange={(e) => setLeftModel(e.target.value)} />
                {leftModel && <button onClick={() => setLeftModel("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs" title="Xóa bộ lọc model">✕</button>}
              </div>
              <select value={leftHang} onChange={(e) => setLeftHang(e.target.value)} className="h-9 px-2 w-36 rounded-md border border-slate-200 text-xs bg-white outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">Hãng: Tất cả</option>
                {hangOptions.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="w-44 flex items-center">
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none h-9">
                  <input type="checkbox" checked={leftLowStock} onChange={(e) => setLeftLowStock(e.target.checked)} className="w-3.5 h-3.5 accent-blue-600" />
                  Hết hàng (Tồn = 0)
                </label>
              </div>
              <label className={`flex items-center gap-1.5 text-xs font-semibold cursor-pointer select-none h-9 px-2 py-0.5 rounded border transition-colors ${leftUnderWarn ? 'bg-rose-100 text-rose-800 border-rose-300' : 'bg-rose-50/70 text-rose-700 border-rose-200 hover:bg-rose-100/70'}`}>
                <input type="checkbox" checked={leftUnderWarn} onChange={(e) => setLeftUnderWarn(e.target.checked)} className="w-3.5 h-3.5 accent-rose-600" />
                <span>🔔 Dưới ngưỡng ({underWarnItems.length})</span>
              </label>
              {(leftSearch || leftModel || leftHang || leftLowStock || leftUnderWarn) && (
                <button onClick={() => { setLeftSearch(""); setLeftModel(""); setLeftHang(""); setLeftLowStock(false); setLeftUnderWarn(false) }} className="text-xs text-rose-600 hover:underline font-medium ml-1">Bỏ lọc</button>
              )}
              <button type="button" onClick={exportLeftInventory} title="Xuất Excel đúng danh sách đang hiển thị (sau lọc mã/tên, model, hãng…) để đối chiếu" className="ml-auto shrink-0 h-9 px-2.5 rounded-md border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold inline-flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" /> Xuất Excel ({sortedLeftInventory.length})
              </button>
            </div>
            {leftUnderWarn && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 flex items-center justify-between gap-2 text-xs">
                <div className="text-rose-800 font-medium">Đang hiển thị <b>{sortedLeftInventory.length}</b> mặt hàng dưới ngưỡng cảnh báo tồn.</div>
                {sortedLeftInventory.length > 0 && (
                  <Button type="button" size="sm" onClick={handleAddAllUnderWarnToCart} className="h-7 text-xs bg-rose-600 hover:bg-rose-700 text-white gap-1 shrink-0 font-semibold">
                    <ShoppingCart className="w-3.5 h-3.5" /> Nhặt tất cả vào giỏ ({sortedLeftInventory.length})
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="overflow-x-auto h-[850px] overflow-y-auto">
            <table className="dh-rasoat w-full text-left text-xs text-slate-600 min-w-[550px]">
              <thead className="bg-slate-50 text-slate-500 font-semibold uppercase sticky top-0 border-b border-slate-200 z-10">
                <tr>
                  <th onClick={() => handleLeftSort('vattu')} className={`px-3 py-2 min-w-[180px] cursor-pointer select-none transition-colors ${leftSortField === 'vattu' ? 'text-blue-600 font-bold bg-blue-50/60' : 'hover:bg-slate-100 hover:text-slate-700'}`} title="Bấm để sắp xếp theo Vật tư">
                    <div className="inline-flex items-center gap-1"><span>Vật tư</span>{leftSortField === 'vattu' && (leftSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                  </th>
                  <th onClick={() => handleLeftSort('model')} className={`px-3 py-2 text-center w-32 max-w-[150px] cursor-pointer select-none transition-colors ${leftSortField === 'model' ? 'text-blue-600 font-bold bg-blue-50/60' : 'hover:bg-slate-100 hover:text-slate-700'}`} title="Bấm để sắp xếp theo Model">
                    <div className="inline-flex items-center justify-center gap-1"><span>Model</span>{leftSortField === 'model' && (leftSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                  </th>
                  <th onClick={() => handleLeftSort('ton_kho')} className={`px-3 py-2 text-center w-16 cursor-pointer select-none transition-colors ${leftSortField === 'ton_kho' ? 'text-blue-600 font-bold bg-blue-50/60' : 'hover:bg-slate-100 hover:text-slate-700'}`} title="Bấm để sắp xếp theo Tồn kho / Khả dụng">
                    <div className="inline-flex items-center justify-center gap-1"><span>Tồn / Có sẵn</span>{leftSortField === 'ton_kho' && (leftSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                  </th>
                  <th onClick={() => handleLeftSort('cho_ve')} className={`px-3 py-2 text-center w-14 cursor-pointer select-none transition-colors ${leftSortField === 'cho_ve' ? 'text-blue-600 font-bold bg-blue-50/60' : 'hover:bg-slate-100 hover:text-slate-700'}`} title="Bấm để sắp xếp theo Hàng chờ về">
                    <div className="inline-flex items-center justify-center gap-1"><span>Chờ về</span>{leftSortField === 'cho_ve' && (leftSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                  </th>
                  <th className="px-3 py-2 text-center w-20 min-w-[70px]">SL đặt</th>
                  <th className="px-3 py-2 text-center w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedLeftInventory.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 italic">Không tìm thấy vật tư khớp bộ lọc.</td></tr>
                ) : sortedLeftInventory.map(item => {
                  const tempQty = leftQuantities[item.ma_hang] || ""
                  const isOut = item.ton_kho <= 0
                  const { pendingQty, tooltip } = getPendingInfo(item.ma_hang)
                  const underInfo = getUnderWarnInfo(item)
                  const effectiveQty = tempQty ? parseInt(tempQty, 10) : (underInfo.isUnder ? underInfo.thieu : 0)
                  return (
                    <tr key={item.ma_hang} className={`hover:bg-slate-50/80 transition-colors ${underInfo.isUnder ? 'bg-rose-50/30' : ''}`}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-bold text-slate-700">{item.ma_hang}</span>
                          {underInfo.isUnder && <span className="inline-flex items-center px-1.5 py-0.5 rounded t3 font-bold bg-rose-100 text-rose-700 border border-rose-300 whitespace-nowrap" title={`Tồn: ${item.ton_kho} / Ngưỡng: ${underInfo.nguong} → Cần đặt bù tối thiểu ${underInfo.thieu}`}>🔔 Thiếu {underInfo.thieu}</span>}
                        </div>
                        <div className="text-slate-500 font-normal leading-relaxed">{item.ten_hang}</div>
                        {item.ma_thay_the && <div className="t3 text-blue-600 font-mono leading-tight mt-0.5" title={`Mã tương đương: ${item.ma_thay_the}`}>≡ {item.ma_thay_the}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-center text-[11px] text-slate-500 leading-tight w-32 max-w-[150px] break-words whitespace-normal">{item.model || '—'}</td>
                      {(() => {
                        const giu = committed[item.ma_hang] || 0
                        const kd = (Number(item.ton_kho) || 0) - giu
                        return (
                          <td className={`px-3 py-2.5 text-center font-bold leading-tight ${isOut ? 'bg-red-50/50' : ''}`} title={giu > 0 ? `Tồn ${item.ton_kho}, đang giữ ${giu} ở phiếu chưa hoàn thành` : undefined}>
                            <span className={isOut ? 'text-red-500' : 'text-slate-600'}>{item.ton_kho}</span>
                            {giu > 0 && <span className={`block t3 font-semibold ${kd <= 0 ? 'text-red-500' : 'text-emerald-600'}`}>Có sẵn {kd}</span>}
                          </td>
                        )
                      })()}
                      <td className="px-3 py-2.5 text-center">
                        {pendingQty > 0 ? <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 cursor-help" title={tooltip}>{pendingQty}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <Input type="text" inputMode="numeric" placeholder={underInfo.isUnder && underInfo.thieu > 0 ? `Thiếu ${underInfo.thieu}` : "Đặt SL"} className={`h-7 text-xs bg-white text-center w-full min-w-[64px] ${underInfo.isUnder && !tempQty ? 'placeholder:text-rose-500 placeholder:font-semibold border-rose-300' : ''}`} value={tempQty} onChange={(e) => { const val = e.target.value.replace(/\D/g, ''); setLeftQuantities({ ...leftQuantities, [item.ma_hang]: val }) }} />
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <Button type="button" onClick={() => addToCart(item.ma_hang, String(effectiveQty))} disabled={effectiveQty <= 0} className={`h-7 w-7 p-0 text-white rounded disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center mx-auto ${underInfo.isUnder ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}`} title={effectiveQty > 0 ? (tempQty ? `Nhặt ${effectiveQty} vào giỏ hàng` : `Nhặt số lượng thiếu (${effectiveQty}) vào giỏ hàng`) : "Nhập SL để nhặt"}>
                          <Plus className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* BÊN PHẢI: GIỎ HÀNG & THÔNG TIN ĐƠN (2/5) */}
        <div className="lg:col-span-2 border border-slate-200 rounded-xl p-5 bg-slate-50/50 flex flex-col shadow-sm gap-4">
          <div className="space-y-4 shrink-0">
            <h3 className="text-base font-bold text-slate-700">Giỏ hàng đặt</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Ngày đặt</label>
                <DateField value={form.ngay_dat} onChange={(v) => setForm({ ...form, ngay_dat: v })} heightClass="h-9" className="w-36" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Nhà cung cấp <span className="text-red-500">*</span></label>
                  <Input list="dh-ncc-list" placeholder="Chọn / gõ NCC" value={form.nha_cung_cap} onChange={(e) => setForm({ ...form, nha_cung_cap: e.target.value })} className="bg-white h-9" />
                  <datalist id="dh-ncc-list">{nhaCungCapOptions.map(o => <option key={o} value={o} />)}</datalist>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Số đơn hàng</label>
                  <Input placeholder="PO-YYMMDD-NNN" value={form.so_don_hang} onChange={(e) => setForm({ ...form, so_don_hang: e.target.value })} className="bg-white h-9 font-mono" />
                </div>
              </div>
            </div>
          </div>

          {/* BẢNG GIỎ HÀNG */}
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white flex flex-col flex-1 min-h-[250px]">
            <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex justify-between items-center shrink-0">
              <h4 className="text-xs font-bold text-slate-600 uppercase">Danh sách đã chọn ({lines.length})</h4>
              {lines.length > 0 && <button type="button" onClick={() => setLines([])} className="t3 text-red-500 font-bold hover:underline">Xóa hết</button>}
            </div>
            <div className="p-3 space-y-2 flex-1 overflow-y-auto">
              {lines.length === 0 ? (
                <div className="text-center text-slate-400 py-6 text-xs italic">Chưa nhặt vật tư nào. Nhập số lượng bên trái và bấm &quot;Nhặt&quot;.</div>
              ) : lines.map((l, i) => {
                const item = inventory.find(inv => inv.ma_hang === l.ma_hang)
                return (
                  <div key={l.ma_hang} className="flex gap-2 items-center justify-between bg-slate-50/50 p-2 rounded border border-slate-100">
                    <div className="flex-1 min-w-0 pr-1">
                      <div className="font-mono font-bold text-xs text-slate-700">{l.ma_hang}</div>
                      <div className="t3 text-slate-500 truncate" title={item?.ten_hang}>{item?.ten_hang || '—'}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Input type="number" min="1" className="h-7 w-16 text-xs bg-white text-center" value={l.sl_dat} onChange={(e) => updLine(i, 'sl_dat', e.target.value)} />
                      <button type="button" onClick={() => rmLine(i)} className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition" title="Xóa dòng"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2 border-t border-slate-200 shrink-0">
            {editingDraftId && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded flex justify-between items-center mb-1">
                <span>Đang sửa đơn nháp: <b>{form.so_don_hang}</b></span>
                <button onClick={() => { setEditingDraftId(null); setForm({ ngay_dat: new Date().toISOString().split('T')[0], nha_cung_cap: "", so_don_hang: "", da_dat: false }); setLines([]) }} className="font-bold hover:underline text-red-600 t3">Huỷ sửa</button>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={() => handleCreate(false)} disabled={saving || lines.length === 0} variant="outline" className="w-1/2 h-10 font-bold border-blue-200 text-blue-700 hover:bg-blue-50">{saving ? "..." : editingDraftId ? "Lưu đè nháp" : "💾 Lưu đơn nháp"}</Button>
              <Button onClick={() => handleCreate(true)} disabled={saving || lines.length === 0} className="w-1/2 h-10 font-bold bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? "..." : editingDraftId ? "Chốt & Gửi" : "🚀 Chốt đơn & Gửi"}</Button>
            </div>
          </div>
        </div>
      </div>
      </>
      )}

      {tab === 'danh_sach' && (
      <>
      {/* Gợi ý MÃ THỰC NHẬN khi ghi hàng về giao thay thế */}
      <datalist id="dathang-ma-thuc">
        {inventory.map((it: any) => <option key={it.ma_hang} value={it.ma_hang}>{it.ten_hang || ''}</option>)}
      </datalist>
      {/* DANH SÁCH ĐƠN + BỘ LỌC */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap px-1">
          <h3 className="text-sm font-bold text-slate-700">Danh sách đơn đặt hàng ({filteredOrders.length}/{orders.length})</h3>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportPendingItemsExcel} className="gap-2 h-9 text-xs border-amber-200 text-amber-700 hover:bg-amber-50"><AlertTriangle className="w-4 h-4" /> Xuất hàng chưa về</Button>
            <Button variant="outline" onClick={exportOrdersExcel} className="gap-2 h-9 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"><Download className="w-4 h-4" /> Xuất danh sách đang lọc</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-1">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Lọc theo mã hàng / tên..." className="pl-9 pr-7 bg-white h-9 text-xs" value={orderFilters.maHang} onChange={(e) => setOrderFilters({ ...orderFilters, maHang: e.target.value })} />
            {orderFilters.maHang && <button type="button" onClick={() => setOrderFilters({ ...orderFilters, maHang: '' })} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-semibold" title="Xóa tìm kiếm">✕</button>}
          </div>
          <select value={orderFilters.ncc} onChange={(e) => setOrderFilters({ ...orderFilters, ncc: e.target.value })} className="h-9 px-2 rounded-md border border-slate-200 text-xs bg-white outline-none">
            <option value="">NCC: Tất cả</option>
            {nhaCungCapOptions.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={orderFilters.trangThai} onChange={(e) => setOrderFilters({ ...orderFilters, trangThai: e.target.value })} className="h-9 px-2 rounded-md border border-slate-200 text-xs bg-white outline-none">
            <option value="con_thieu">Còn thiếu</option>
            <option value="all">Tất cả trạng thái</option>
            <option value="nhap">Nháp</option>
            <option value="da_dat">Đã đặt (đang về)</option>
            <option value="hoan_thanh">Đã nhận đủ</option>
          </select>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Hàng về</span>
            <DateField value={orderFilters.hvTu} onChange={(v) => setOrderFilters({ ...orderFilters, hvTu: v })} heightClass="h-9" className="w-36" />
            <span>–</span>
            <DateField value={orderFilters.hvDen} onChange={(v) => setOrderFilters({ ...orderFilters, hvDen: v })} heightClass="h-9" className="w-36" />
          </div>
          {(orderFilters.maHang || orderFilters.ncc || orderFilters.trangThai !== 'con_thieu' || orderFilters.hvTu || orderFilters.hvDen) && (
            <button onClick={() => setOrderFilters({ maHang: "", ncc: "", trangThai: "con_thieu", hvTu: "", hvDen: "" })} className="text-xs text-red-600 hover:underline font-medium">Bỏ lọc</button>
          )}
        </div>
        <Pagination top page={dhPaged.page} pageCount={dhPaged.pageCount} total={dhPaged.total} perPage={dhPaged.perPage} onPage={dhPaged.setPage} onPerPage={dhPaged.setPerPage} />
        {loading ? <BoxLoading label="Đang tải đơn đặt hàng..." />
          : orders.length === 0 ? <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-400 text-sm">Chưa có đơn đặt hàng nào.</div>
          : filteredOrders.length === 0 ? <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-400 text-sm">Không có đơn khớp bộ lọc.</div>
          : dhPaged.pageItems.map(o => (
            <div key={o.id} className={`bg-white rounded-lg border p-4 space-y-3 ${o.hoan_thanh ? 'border-slate-200 opacity-80' : 'border-slate-200'}`}>
              <div className="flex justify-between items-start gap-3 flex-wrap">
                <div>
                  <div className="t1 font-medium text-slate-800">{o.nha_cung_cap || 'Chưa có NCC'} {o.so_don_hang && <span className="text-slate-400 font-normal">· {o.so_don_hang}</span>}</div>
                  <div className="t2 text-slate-500">Ngày đặt {fmtDate(o.ngay_dat)}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => toggleDaDat(o)} className={`whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-semibold border ${o.da_dat ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{o.da_dat ? 'Đã đặt' : 'Nháp'}</button>
                  {o.hoan_thanh && <span className="whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200">Đã đủ hàng</span>}
                  <button onClick={() => exportSingleOrderExcel(o)} className="text-blue-600 hover:text-blue-800 p-1.5 bg-blue-50 hover:bg-blue-100 rounded-md transition" title="Xuất file Excel đơn này"><Download className="w-4 h-4" /></button>
                  {!o.da_dat && (
                    <button onClick={() => { setEditingDraftId(o.id); setForm({ ngay_dat: o.ngay_dat, nha_cung_cap: o.nha_cung_cap || "", so_don_hang: o.so_don_hang || "", da_dat: false }); setLines((o.soct_dat_hang_ct || []).map((l: any) => ({ ma_hang: l.ma_hang, sl_dat: String(l.sl_dat) }))); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="text-slate-600 hover:text-slate-800 p-1.5 bg-slate-100 hover:bg-slate-200 rounded-md transition" title="Sửa đơn nháp"><PenSquare className="w-4 h-4" /></button>
                  )}
                  {delId === o.id ? (
                    <span className="flex items-center gap-1 text-xs">
                      <button onClick={() => deleteOrder(o.id)} className="text-red-600 font-semibold px-2 py-1 bg-red-50 rounded">Xác nhận xóa</button>
                      <button onClick={() => setDelId(null)} className="text-slate-500 px-2 py-1">Hủy</button>
                    </span>
                  ) : (
                    !(orderReceived(o) > 0 && currentUserRole !== 'admin') && (
                      <button onClick={async () => { const recv = orderReceived(o); if (recv > 0 && !(await confirm(`Đơn này đã nhận tổng ${recv}. Xóa đơn sẽ TRỪ ${recv} khỏi tồn kho. Chỉ làm khi hàng chưa thực về / nhập nhầm. Tiếp tục?`, { confirmLabel: 'Tiếp tục' }))) return; setDelId(o.id) }} className="text-red-500 hover:text-red-700 p-1.5 bg-red-50 hover:bg-red-100 rounded-md" title="Xóa đơn"><Trash2 className="w-4 h-4" /></button>
                    )
                  )}
                </div>
              </div>

              <div className="border border-slate-100 rounded-md overflow-hidden">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2 font-medium">Mã hàng</th><th className="px-3 py-2 font-medium">Model</th><th className="px-3 py-2 font-medium text-center">Đặt</th><th className="px-3 py-2 font-medium text-center">Đã nhận</th><th className="px-3 py-2 font-medium text-center">Còn thiếu</th><th className="px-3 py-2 font-medium">Đợt hàng về</th><th className="px-3 py-2">Thao tác</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {(o.soct_dat_hang_ct || []).map((line: any) => {
                      const nhan = daNhan(line); const thieu = line.sl_dat - nhan
                      return (
                        <tr key={line.id} className={line.hoan_thanh ? 'bg-emerald-50/40' : ''}>
                          <td className="px-3 py-2"><span className="font-mono font-medium text-slate-700">{line.ma_hang}</span> <span className="text-slate-500">{line.soct_kho_hang?.ten_hang || ''}</span></td>
                          <td className="px-3 py-2 text-slate-500">{line.soct_kho_hang?.model || '—'}</td>
                          <td className="px-3 py-2 text-center">{line.sl_dat}</td>
                          <td className="px-3 py-2 text-center font-medium text-emerald-600">{nhan}</td>
                          <td className={`px-3 py-2 text-center font-medium ${thieu > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{thieu > 0 ? thieu : '—'}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {(line.soct_hang_ve_dot || []).map((h: any) => {
                                const maThuc = h.ma_hang && h.ma_hang !== line.ma_hang ? h.ma_hang : null
                                return (
                                  <span key={h.id} className={`inline-flex items-center gap-1 border rounded px-1.5 py-0.5 ${maThuc ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`} title={maThuc ? `Giao thay thế bằng mã ${maThuc}` : undefined}>
                                    {fmtDate(h.ngay_nhan)}: <b>{h.so_luong_nhan}</b>
                                    {maThuc && <span className="t3 text-amber-700 font-semibold">→ {maThuc}</span>}
                                    {currentUserRole === 'admin' && <button onClick={() => deleteReceipt(h.id, h.so_luong_nhan, h.ma_hang || line.ma_hang)} className="text-slate-400 hover:text-red-500" title="Xóa đợt này (trừ tồn)">✕</button>}
                                  </span>
                                )
                              })}
                            </div>
                            {receiving && receiving.ctId === line.id && (
                              <div className="flex flex-wrap items-end gap-1.5 mt-1.5">
                                <DateField value={receiving.ngay_nhan} onChange={(v) => setReceiving({ ...receiving, ngay_nhan: v })} heightClass="h-8" className="w-36" />
                                <Input type="number" min="1" placeholder="SL nhận" value={receiving.so_luong_nhan} onChange={(e) => setReceiving({ ...receiving, so_luong_nhan: e.target.value })} className="h-8 bg-white w-24" />
                                <label className="flex flex-col">
                                  <span className="text-[9px] text-slate-400 leading-none mb-0.5">Mã thực nhận</span>
                                  <Input list="dathang-ma-thuc" value={receiving.ma_hang} onChange={(e) => setReceiving({ ...receiving, ma_hang: e.target.value.trim() })} className={`h-8 bg-white w-40 font-mono ${receiving.ma_hang !== receiving.ma_dat ? 'border-amber-400' : ''}`} title="Mặc định = mã đã đặt; đổi nếu NCC giao mã khác" />
                                </label>
                                <Button onClick={saveReceipt} className="h-8 text-xs px-3 bg-emerald-600 hover:bg-emerald-700">Lưu</Button>
                                <Button variant="outline" onClick={() => setReceiving(null)} className="h-8 text-xs px-3">Hủy</Button>
                                {receiving.ma_hang !== receiving.ma_dat && <span className="t3 text-amber-700 self-center">Giao thay thế (đặt {receiving.ma_dat})</span>}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-2">
                              {currentUserRole === 'admin' && !line.hoan_thanh && (!receiving || receiving.ctId !== line.id) && (
                                <button onClick={() => setReceiving({ ctId: line.id, ngay_nhan: new Date().toISOString().split('T')[0], so_luong_nhan: "", ma_dat: line.ma_hang, ma_hang: line.ma_hang })} className="text-blue-600 hover:text-blue-800 text-xs font-medium whitespace-nowrap">+ Ghi hàng về</button>
                              )}
                              {!(nhan > 0 && currentUserRole !== 'admin') && (
                                <button onClick={async () => { if (nhan > 0 && !(await confirm(`Mục "${line.ma_hang}" đã nhận ${nhan}. Xóa sẽ TRỪ ${nhan} khỏi tồn kho. Chỉ làm khi hàng chưa thực về / ghi nhầm. Tiếp tục?`, { confirmLabel: 'Tiếp tục' }))) return; if (!(await confirm("Bạn có chắc chắn muốn xóa mục vật tư này khỏi đơn đặt hàng? Thao tác này sẽ tự động hoàn tồn kho các đợt đã nhận.", { confirmLabel: 'Xóa', danger: true }))) return; deleteLineItem(line.id) }} className="text-red-500 hover:text-red-700 p-1 bg-red-50 hover:bg-red-100 rounded-md transition" title={nhan > 0 ? 'Xóa mục (đã nhận hàng — trừ tồn)' : 'Xóa mục hàng này'}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {o.ghi_chu && <div className="text-xs text-slate-500 italic">Ghi chú: {o.ghi_chu}</div>}
            </div>
          ))}
        {!loading && filteredOrders.length > 0 && (
          <Pagination page={dhPaged.page} pageCount={dhPaged.pageCount} total={dhPaged.total} perPage={dhPaged.perPage} onPage={dhPaged.setPage} />
        )}
      </div>
      </>
      )}

      {excelSuccessModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="mx-auto w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center"><CheckCircle2 className="w-6 h-6 text-emerald-600" /></div>
              <div className="text-center space-y-1">
                <h3 className="text-lg font-bold text-slate-800">Lưu thành công!</h3>
                <p className="text-sm text-slate-500">Đơn đặt hàng <b className="text-slate-700">{excelSuccessModal.order.so_don_hang || 'nháp'}</b> đã được ghi nhận.</p>
              </div>
            </div>
            <div className="bg-slate-50 p-4 flex flex-col gap-2 border-t border-slate-100">
              <Button onClick={() => { exportSingleOrderExcel(excelSuccessModal.order); setExcelSuccessModal(null) }} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"><Download className="w-4 h-4" /> Xuất Excel đơn này ngay</Button>
              <Button variant="outline" onClick={() => { setTab('danh_sach'); setExcelSuccessModal(null) }} className="w-full border-blue-200 text-blue-700 hover:bg-blue-50 gap-2"><ShoppingCart className="w-4 h-4" /> Danh sách đơn hàng</Button>
              <Button variant="outline" onClick={() => setExcelSuccessModal(null)} className="w-full text-slate-500 hover:text-slate-700">Đóng</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
