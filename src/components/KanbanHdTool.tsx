"use client"

import { useState, useEffect, useCallback } from "react"
import { Copy, AlertCircle, CheckCircle, Clock, ArrowRight, User, Hash, CheckSquare, Layers, FileText, RefreshCw, Landmark, Pencil, Search, Download, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import MonthField from "@/components/MonthField"
import { supabase } from "@/lib/supabase"

type VatTu = {
  id: string
  ma_hang: string
  so_luong: number
  don_gia: number
  vat: number
  thanh_tien: number
  hoa_don: boolean
  da_tra: boolean
  ten_hang_hd?: string | null // tên ghi đè cho riêng dòng phiếu
  ten_hd?: string             // tên hiển thị đã giải quyết ưu tiên (server tính)
  soct_kho_hang: { ten_hang: string } | null
}

type Customer = {
  id: string
  ten_khach_hang: string
  dia_chi: string
  ma_so_thue: string | null
  email_ke_toan: string | null
  ma_khach_cum: string | null
  soct_khach_cum?: {
    ten_khach_hang: string
    dia_chi: string | null
    ma_so_thue: string | null
    email_ke_toan: string | null
  } | null
}

type Ticket = {
  id: string
  ngay: string
  ma_may: string
  id_khach_hang: string
  loai_cong_viec: string
  km: number
  ket_qua: string
  report: string | null
  ghi_chu: string
  ktv_id: string | null
  ktv2_id: string | null
  so_luong: number
  created_by: string
  da_nop_phieu: boolean
  trang_thai_hd: 'Chờ xuất HĐ' | 'Đang xử lý HĐ' | 'Đã lên hóa đơn' | 'Đã thanh toán'
  so_hoa_don: string | null
  ngay_xuat_hd?: string | null
  nguoi_xuat?: { full_name: string } | null // người lập hóa đơn (kế toán bấm Hoàn tất)
  _co_mau?: boolean // khách có mẫu tên/giá đã lưu (để hiện nút "Áp mẫu khách")
  soct_khach_hang: Customer | null
  soct_users: { full_name: string } | null
  soct_chi_tiet_vat_tu: VatTu[]
}

type GroupedCard = {
  id: string // khachHangId
  customer: Customer | null
  tickets: Ticket[]
  trang_thai_hd: string
}

const fmtDate = (s: string) => {
  if (!s) return ''
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

const fmtVnd = (x: number) => Math.round(x || 0).toLocaleString('vi-VN')
const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
// Số ngày kể từ ngày xuất hóa đơn (tính tuổi nợ đọng ở cột Chờ thanh toán).
const daysSince = (d: any): number | null => { if (!d) return null; const t = new Date(d).getTime(); return isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 86400000)) }

export default function KanbanHdTool({ role = 'staff', showNotification }: { role?: string, showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("") // tìm khách / số phiếu / số hóa đơn
  const [col3ChiKyNay, setCol3ChiKyNay] = useState(false) // cột Chờ thanh toán: lọc theo kỳ hay lũy kế
  const [grouped, setGrouped] = useState(true) // Bật/tắt tự động gom nhóm theo khách hàng
  const [activeCard, setActiveCard] = useState<{ type: 'single' | 'group', tickets: Ticket[] } | null>(null)
  const [invoiceNum, setInvoiceNum] = useState("")
  const [completing, setCompleting] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [editName, setEditName] = useState<{ ma_hang: string; ten: string; gia: string } | null>(null) // sửa tên + đơn giá trong modal
  const [savingName, setSavingName] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    onConfirm: () => Promise<void>
  } | null>(null)
  const [thang, setThang] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/kanban-hd?thang_nam=${thang}`)
      const j = await res.json()
      if (res.ok) {
        const fresh: Ticket[] = j.data || []
        setTickets(fresh)
        // Modal đang mở -> ánh xạ lại thẻ theo dữ liệu mới để tên/tiền cập nhật ngay.
        setActiveCard(prev => {
          if (!prev) return prev
          const byId = new Map(fresh.map(t => [t.id, t]))
          const remapped = prev.tickets.map(t => byId.get(t.id)).filter(Boolean) as Ticket[]
          return remapped.length ? { ...prev, tickets: remapped } : null
        })
      } else {
        showNotification('error', j.error || 'Lỗi tải danh sách Kanban')
      }
    } catch {
      showNotification('error', 'Lỗi kết nối hệ thống')
    } finally {
      setLoading(false)
    }
  }, [thang, showNotification])

  useEffect(() => {
    load()
    // Đăng ký kênh Realtime lắng nghe thay đổi phiếu
    const ch = supabase
      .channel("soct_jobs")
      .on('broadcast', { event: "changed" }, () => { load() })
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])

  // Đóng modal -> bỏ trạng thái đang sửa tên (tránh sót khi mở thẻ khác)
  useEffect(() => { if (!activeCard) setEditName(null) }, [activeCard])

  // Tính tổng tiền cho 1 mảng vật tư của các phiếu
  const getVatTuStats = (vtList: VatTu[]) => {
    const activeVt = vtList.filter(v => !v.da_tra)
    const truocVat = activeVt.reduce((s, v) => s + v.so_luong * v.don_gia, 0)
    const tienVat = activeVt.reduce((s, v) => s + (v.so_luong * v.don_gia * v.vat) / 100, 0)
    const sauVat = truocVat + tienVat
    return { truocVat, tienVat, sauVat, activeVt }
  }

  // Copy nhanh text vào clipboard
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
    showNotification('success', 'Đã copy vào bộ nhớ đệm')
  }

  // Kéo thẻ (Drag Start)
  const handleDragStart = (e: React.DragEvent, cardData: { id?: string, ids?: string[], currentState: string }) => {
    e.dataTransfer.setData("text/plain", JSON.stringify(cardData))
  }

  // Thả thẻ (Drop)
  const handleDrop = async (e: React.DragEvent, targetState: 'Chờ xuất HĐ' | 'Đang xử lý HĐ' | 'Đã lên hóa đơn' | 'Đã thanh toán') => {
    e.preventDefault()
    try {
      const raw = e.dataTransfer.getData("text/plain")
      if (!raw) return
      const cardData = JSON.parse(raw)
      const targetIds = cardData.ids || [cardData.id]
      const sourceState = cardData.currentState

      // 1. Kiểm tra phân quyền kéo/thả
      if (role !== 'admin') {
        if (role === 'tech_admin' || role === 'staff') {
          // Tech_admin & Staff: chỉ kéo Cột 1 -> Cột 2 (bàn giao Kế toán) + thu hồi về Công nợ.
          if (!(sourceState === 'Chờ xuất HĐ' && targetState === 'Đang xử lý HĐ')) {
            return showNotification('error', 'Bạn chỉ có quyền kéo thẻ từ Cột 1 (Chờ xuất HĐ) sang Cột 2 để bàn giao cho Kế toán.')
          }
        } else if (role === 'kthc') {
          // Kế toán (kthc): Chỉ được làm việc với Cột 2, 3, 4
          const isAllowedTransition =
            (sourceState === 'Đang xử lý HĐ' && targetState === 'Đã lên hóa đơn') ||
            (sourceState === 'Đã lên hóa đơn' && targetState === 'Đã thanh toán') ||
            (sourceState === 'Đã thanh toán' && targetState === 'Đã lên hóa đơn') ||
            (sourceState === 'Đã lên hóa đơn' && targetState === 'Đang xử lý HĐ')

          if (!isAllowedTransition) {
            return showNotification('error', 'Quyền kéo thả không hợp lệ đối với Kế toán.')
          }
        }
      }

      // 2. Thực hiện chuyển trạng thái
      if (targetState === 'Đã lên hóa đơn') {
        const matchedTickets = tickets.filter(t => targetIds.includes(t.id))
        if (sourceState === 'Đang xử lý HĐ') {
          // Cột 2 -> Cột 3: mở Modal để nhập Số hóa đơn lần đầu
          setInvoiceNum(matchedTickets[0].so_hoa_don || "")
          setActiveCard({ type: cardData.ids ? 'group' : 'single', tickets: matchedTickets })
        } else {
          // Cột 4 -> Cột 3 (bỏ đánh dấu đã thanh toán): giữ nguyên số HĐ + ngày xuất, chuyển thẳng.
          const res = await fetch('/api/admin/kanban-hd', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: targetIds, trang_thai_hd: 'Đã lên hóa đơn', so_hoa_don: matchedTickets[0].so_hoa_don, ngay_xuat_hd: matchedTickets[0].ngay_xuat_hd })
          })
          if (res.ok) { showNotification('success', 'Đã chuyển về "Chờ thanh toán".'); load() }
          else { const err = await res.json(); showNotification('error', err.error || 'Lỗi chuyển trạng thái') }
        }
      } else if (sourceState === 'Đã lên hóa đơn' && targetState === 'Đang xử lý HĐ') {
        // Kéo ngược Cột 3 -> Cột 2 để sửa. GIỮ số HĐ (hệ thống nhớ lại) -> khi hoàn tất lại
        // khỏi gõ số HĐ. Chỉ gỡ ngày xuất + cờ hóa đơn (ra khỏi "chờ thanh toán").
        setConfirmDialog({
          title: "Trả về xử lý hóa đơn",
          message: "Trả phiếu này về cột 'KT-HC lên hóa đơn' để sửa?\nSố hóa đơn được GIỮ LẠI (khi hoàn tất lại sẽ điền sẵn).",
          onConfirm: async () => {
            const res = await fetch('/api/admin/kanban-hd', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: targetIds, trang_thai_hd: 'Đang xử lý HĐ' })
            })
            if (res.ok) {
              showNotification('success', 'Đã trả thẻ về xử lý hóa đơn (giữ số HĐ).')
              load()
            } else {
              const err = await res.json()
              showNotification('error', err.error || 'Lỗi chuyển trạng thái')
            }
          }
        })
      } else {
        // Cập nhật trạng thái trực tiếp (Ví dụ: 1 -> 2, 3 -> 4, 4 -> 3)
        const res = await fetch('/api/admin/kanban-hd', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: targetIds, trang_thai_hd: targetState })
        })
        if (res.ok) {
          showNotification('success', 'Đã chuyển trạng thái thẻ thành công.')
          load()
        } else {
          const err = await res.json()
          showNotification('error', err.error || 'Lỗi chuyển trạng thái')
        }
      }
    } catch {
      showNotification('error', 'Lỗi kéo thả thẻ')
    }
  }

  // Hoàn tất xuất hóa đơn (Modal Submit). Có cảnh báo số HĐ trùng của KHÁCH KHÁC (chống gõ nhầm).
  const handleCompleteInvoice = async () => {
    if (!activeCard) return
    const cleanedInvoice = invoiceNum.trim()
    if (!cleanedInvoice) return showNotification('error', 'Vui lòng nhập Số hóa đơn!')

    const currentIds = new Set(activeCard.tickets.map(t => t.id))
    const curKh = activeCard.tickets[0]?.id_khach_hang
    const dup = tickets.find(t => !currentIds.has(t.id) && (t.so_hoa_don || '').trim().toUpperCase() === cleanedInvoice.toUpperCase() && t.id_khach_hang !== curKh)
    if (dup) {
      const dupKh = dup.soct_khach_hang?.soct_khach_cum?.ten_khach_hang || dup.soct_khach_hang?.ten_khach_hang || 'khách khác'
      setConfirmDialog({
        title: 'Số hóa đơn có thể trùng',
        message: `Số hóa đơn "${cleanedInvoice}" đã dùng cho phiếu của "${dupKh}".\nBạn có chắc muốn dùng lại số này?`,
        onConfirm: async () => { await doCompleteInvoice(cleanedInvoice) },
      })
      return
    }
    await doCompleteInvoice(cleanedInvoice)
  }

  const doCompleteInvoice = async (cleanedInvoice: string) => {
    if (!activeCard) return
    setCompleting(true)
    try {
      const targetIds = activeCard.tickets.map(t => t.id)
      const res = await fetch('/api/admin/kanban-hd', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: targetIds, trang_thai_hd: 'Đã lên hóa đơn', so_hoa_don: cleanedInvoice })
      })
      if (res.ok) {
        showNotification('success', `Đã xuất hóa đơn ${cleanedInvoice} thành công!`)
        setActiveCard(null)
        load()
      } else {
        const err = await res.json()
        showNotification('error', err.error || 'Lỗi lưu hóa đơn')
      }
    } catch {
      showNotification('error', 'Lỗi kết nối')
    } finally {
      setCompleting(false)
    }
  }

  // Chuyển trạng thái trực tiếp từ NÚT trong modal (thay cho kéo thả — dùng được trên mobile).
  const moveStatus = async (targetState: string, keepInvoice = false) => {
    if (!activeCard) return
    setCompleting(true)
    try {
      const targetIds = activeCard.tickets.map(t => t.id)
      const body: any = { ids: targetIds, trang_thai_hd: targetState }
      if (keepInvoice) { body.so_hoa_don = activeCard.tickets[0]?.so_hoa_don; body.ngay_xuat_hd = activeCard.tickets[0]?.ngay_xuat_hd }
      const res = await fetch('/api/admin/kanban-hd', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) { showNotification('success', 'Đã chuyển trạng thái.'); setActiveCard(null); load() }
      else { const err = await res.json(); showNotification('error', err.error || 'Lỗi chuyển trạng thái') }
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setCompleting(false) }
  }

  // scope_key của khách đang mở modal (khớp cách gom: cụm nếu có, else điểm máy).
  const modalScopeKey = (() => {
    const t0 = activeCard?.tickets[0]
    if (!t0) return ''
    return t0.soct_khach_hang?.ma_khach_cum ? `cum:${t0.soct_khach_hang.ma_khach_cum}` : `may:${t0.id_khach_hang}`
  })()

  // Lưu tên + đơn giá: 'hoa_don' (ghi thẳng dòng phiếu này) hoặc 'khach' (lưu MẪU cho khách).
  const saveName = async (pham_vi: 'hoa_don' | 'khach') => {
    if (!editName || !activeCard) return
    setSavingName(true)
    try {
      const res = await fetch('/api/admin/ten-hang-rieng', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pham_vi, ma_hang: editName.ma_hang, ten_hang: editName.ten, don_gia: editName.gia,
          ...(pham_vi === 'hoa_don'
            ? { ticket_ids: activeCard.tickets.map(t => t.id) }
            : { scope_key: modalScopeKey }),
        }),
      })
      if (res.ok) {
        showNotification('success', pham_vi === 'khach' ? 'Đã lưu mẫu tên/giá cho khách.' : 'Đã cập nhật hóa đơn này.')
        setEditName(null)
        load()
      } else { const e = await res.json(); showNotification('error', e.error || 'Lỗi lưu') }
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setSavingName(false) }
  }

  // Áp MẪU tên/giá đã lưu của khách vào các dòng của phiếu này (bấm nút -> ghi vào dòng).
  const applyTemplate = async () => {
    if (!activeCard) return
    setSavingName(true)
    try {
      const res = await fetch('/api/admin/ten-hang-rieng', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pham_vi: 'ap_khach', scope_key: modalScopeKey, ticket_ids: activeCard.tickets.map(t => t.id) }),
      })
      if (res.ok) { showNotification('success', 'Đã áp mẫu tên/giá của khách. Vui lòng kiểm tra lại.'); load() }
      else { const e = await res.json(); showNotification('error', e.error || 'Lỗi áp mẫu') }
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setSavingName(false) }
  }

  // Xuất Excel danh sách vật tư (Mã hàng · Tên · SL · Đơn giá · VAT · Thành tiền) để sửa hàng loạt.
  const exportExcel = async () => {
    if (!activeCard) return
    const mod: any = await import('exceljs'); const ExcelJS = mod.default ?? mod
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('HangHoa')
    ws.addRow(['Mã hàng', 'Tên hàng', 'SL', 'Đơn giá', 'VAT (%)', 'Thành tiền (chưa VAT)'])
    for (const v of modalDisplayRows) ws.addRow([v.ma_hang, v.ten_hang, v.so_luong, v.don_gia, v.vat, v.so_luong * v.don_gia])
    ws.getRow(1).font = { bold: true }
    const buf = await wb.xlsx.writeBuffer()
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const a = document.createElement('a')
    a.href = url; a.download = `hanghoa-${activeCard.tickets[0]?.so_hoa_don || activeCard.tickets[0]?.report || 'phieu'}.xlsx`; a.click(); URL.revokeObjectURL(url)
  }

  // Nhập lại Excel -> cập nhật ĐƠN GIÁ (thật) + TÊN (ghi đè hóa đơn) cho dòng của phiếu này, khớp mã hàng.
  const importExcel = async (file: File) => {
    if (!activeCard) return
    setSavingName(true)
    try {
      const mod: any = await import('exceljs'); const ExcelJS = mod.default ?? mod
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer())
      const ws = wb.worksheets[0]
      const cell = (v: any) => (v && typeof v === 'object' && 'result' in v) ? v.result : v
      const items: { ma_hang: string; ten_hang: string; don_gia: any }[] = []
      ws.eachRow({ includeEmpty: false }, (row: any, idx: number) => {
        if (idx === 1) return // bỏ dòng tiêu đề
        const vals = row.values as any[]
        const ma = String(cell(vals[1]) ?? '').trim()
        if (!ma) return
        items.push({ ma_hang: ma, ten_hang: String(cell(vals[2]) ?? ''), don_gia: cell(vals[4]) })
      })
      if (items.length === 0) { showNotification('error', 'File không có dòng hợp lệ.'); return }
      const res = await fetch('/api/admin/ten-hang-rieng', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pham_vi: 'hoa_don', ticket_ids: activeCard.tickets.map(t => t.id), items }),
      })
      if (res.ok) { showNotification('success', `Đã cập nhật ${items.length} mặt hàng từ Excel.`); load() }
      else { const e = await res.json(); showNotification('error', e.error || 'Lỗi nhập Excel') }
    } catch { showNotification('error', 'Lỗi đọc file Excel') } finally { setSavingName(false) }
  }

  // Tìm kiếm: khách hàng (cụm/lẻ) + số phiếu (report) + số hóa đơn. Áp cho CẢ 4 cột ->
  // gõ vào là thấy phiếu đang nằm cột nào = trạng thái hóa đơn/thanh toán.
  const sTokens = norm(search.trim()).split(/\s+/).filter(Boolean)
  const matchSearch = (t: Ticket) => {
    if (!sTokens.length) return true
    const kh = t.soct_khach_hang; const cum = kh?.soct_khach_cum
    const ten = cum ? (cum.ten_khach_hang || '') : (kh?.ten_khach_hang || '')
    const hay = norm(`${ten} ${t.report || ''} ${t.so_hoa_don || ''}`)
    return sTokens.every(tok => hay.includes(tok))
  }
  const shown = tickets.filter(matchSearch)

  // Phân bổ thẻ lên các cột
  const col1Tickets = shown.filter(t => t.trang_thai_hd === 'Chờ xuất HĐ')
  const col2Tickets = shown.filter(t => t.trang_thai_hd === 'Đang xử lý HĐ')
  const col3Tickets = shown.filter(t => t.trang_thai_hd === 'Đã lên hóa đơn'
    && (!col3ChiKyNay || String(t.ngay_xuat_hd || '').startsWith(thang)))
  const col4Tickets = shown.filter(t => t.trang_thai_hd === 'Đã thanh toán')

  // Gom nhóm Cột 1 & Cột 2 theo khách hàng nếu bật chế độ grouped
  const getColumnCards = (colTickets: Ticket[], state: string) => {
    if (!grouped) {
      return colTickets.map(t => ({
        id: t.id,
        customer: t.soct_khach_hang,
        tickets: [t],
        trang_thai_hd: state
      }))
    }
    const map = new Map<string, GroupedCard>()
    colTickets.forEach(t => {
      const cumId = t.soct_khach_hang?.ma_khach_cum
      const groupKey = cumId ? `cum:${cumId}` : `may:${t.id_khach_hang}`
      if (!map.has(groupKey)) {
        map.set(groupKey, {
          id: groupKey,
          customer: t.soct_khach_hang,
          tickets: [],
          trang_thai_hd: state
        })
      }
      map.get(groupKey)!.tickets.push(t)
    })
    return [...map.values()]
  }

  const cardsCol1 = getColumnCards(col1Tickets, 'Chờ xuất HĐ')
  const cardsCol2 = getColumnCards(col2Tickets, 'Đang xử lý HĐ')

  // Cột 3 & Cột 4 (Hoàn thành) luôn để đơn lẻ từng phiếu để hiển thị rõ số hóa đơn riêng biệt
  const cardsCol3 = col3Tickets.map(t => ({
    id: t.id,
    customer: t.soct_khach_hang,
    tickets: [t],
    trang_thai_hd: 'Đã lên hóa đơn'
  }))
  const cardsCol4 = col4Tickets.map(t => ({
    id: t.id,
    customer: t.soct_khach_hang,
    tickets: [t],
    trang_thai_hd: 'Đã thanh toán'
  }))

  const renderCardList = (cards: any[], state: 'Chờ xuất HĐ' | 'Đang xử lý HĐ' | 'Đã lên hóa đơn' | 'Đã thanh toán') => {
    return (
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => handleDrop(e, state)}
        className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50 min-h-[500px] max-h-[700px] rounded-b-xl border-t border-slate-100"
      >
        {cards.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-400 italic">
            Trống
          </div>
        ) : (
          cards.map(card => {
            const allVt = card.tickets.flatMap((t: any) => t.soct_chi_tiet_vat_tu || [])
            const { truocVat, sauVat } = getVatTuStats(allVt)
            const count = card.tickets.length
            const dragData = card.tickets.length > 1
              ? { ids: card.tickets.map((t: any) => t.id), currentState: state }
              : { id: card.tickets[0].id, currentState: state }

            return (
              <div
                key={card.id}
                draggable
                onDragStart={e => handleDragStart(e, dragData)}
                onClick={() => {
                  // Mở thẻ ở MỌI cột (kể cả Cột 1 Chờ lên HĐ) để tech_admin sửa tên hàng
                  // TRƯỚC khi bàn giao kế toán. Modal tự ẩn phần Số HĐ / nút Hoàn tất ở Cột 1.
                  setInvoiceNum(card.tickets[0].so_hoa_don || "")
                  setActiveCard({
                    type: count > 1 ? 'group' : 'single',
                    tickets: card.tickets
                  })
                }}
                className={`bg-white border rounded-lg p-3 shadow-sm hover:shadow transition cursor-grab active:cursor-grabbing border-slate-200 relative overflow-hidden hover:bg-slate-50/50`}
              >
                {/* Đường viền trang trí trạng thái */}
                <div className={`absolute top-0 left-0 bottom-0 w-1 ${state === 'Chờ xuất HĐ' ? 'bg-blue-400' : state === 'Đang xử lý HĐ' ? 'bg-amber-400' : state === 'Đã lên hóa đơn' ? 'bg-emerald-500' : 'bg-indigo-500'}`}></div>

                {(() => {
                  const cum = card.customer?.soct_khach_cum
                  const tenKh = cum ? (cum.ten_khach_hang || '') : (card.customer?.ten_khach_hang || 'Khách hàng lẻ')
                  const mst = cum ? cum.ma_so_thue : card.customer?.ma_so_thue

                  return (
                    <div className="pl-1.5 space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <div className="font-bold text-slate-800 text-xs leading-snug line-clamp-2">
                          {tenKh}
                        </div>
                        {(state === 'Chờ xuất HĐ' || role === 'admin') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setConfirmDialog({
                                title: "Thu hồi phiếu",
                                message: "Bạn có chắc chắn muốn thu hồi (các) phiếu này quay lại Công nợ không?",
                                onConfirm: async () => {
                                  try {
                                    const targetIds = card.tickets.map((t: any) => t.id)
                                    const res = await fetch('/api/admin/kanban-hd', {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ ids: targetIds, trang_thai_hd: 'Chưa hóa đơn' })
                                    })
                                    if (res.ok) {
                                      showNotification('success', 'Đã thu hồi phiếu quay lại Công nợ.')
                                      load()
                                    } else {
                                      const err = await res.json()
                                      showNotification('error', err.error || 'Lỗi thu hồi')
                                    }
                                  } catch {
                                    showNotification('error', 'Lỗi kết nối')
                                  }
                                }
                              })
                            }}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 px-1 py-0.5 rounded transition text-[10px] font-bold shrink-0 border border-red-200"
                            title="Thu hồi quay lại Công nợ"
                          >
                            Thu hồi
                          </button>
                        )}
                      </div>

                      {mst && (
                        <div className="text-[10px] text-slate-400 font-mono">
                          MST: {mst}
                        </div>
                      )}
                    </div>
                  )
                })()}

                  <div className="flex justify-between items-center text-[10px] text-slate-500">
                    <span className="bg-slate-100 px-2 py-0.5 rounded font-medium">
                      {count > 1 ? `${count} phiếu gộp` : `Phiếu: ${card.tickets[0].report || '—'}`}
                    </span>
                    <span className="font-mono text-slate-400">
                      {count === 1 ? fmtDate(card.tickets[0].ngay) : ''}
                    </span>
                  </div>

                  <div className="pt-1.5 border-t border-dashed border-slate-100 flex justify-between items-end">
                    <div className="text-[10px] text-slate-400">Thành tiền:</div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-800">{fmtVnd(sauVat)} đ</div>
                      <div className="text-[9px] text-slate-400 font-mono">Trước VAT: {fmtVnd(truocVat)}</div>
                    </div>
                  </div>

                  {(state === 'Đã lên hóa đơn' || state === 'Đã thanh toán') && card.tickets[0].so_hoa_don && (
                    <div className="mt-2 space-y-1">
                      <div className={`border rounded px-2 py-1 text-[10px] font-semibold flex items-center gap-1 ${state === 'Đã thanh toán' ? 'bg-indigo-50 text-indigo-800 border-indigo-100' : 'bg-emerald-50 text-emerald-800 border-emerald-100'}`}>
                        <CheckCircle className="w-3.5 h-3.5" /> HĐ: {card.tickets[0].so_hoa_don}
                      </div>
                      {(card.tickets[0].nguoi_xuat?.full_name || card.tickets[0].ngay_xuat_hd) && (
                        <div className="text-[9px] text-slate-400">
                          {[card.tickets[0].nguoi_xuat?.full_name ? `KT: ${card.tickets[0].nguoi_xuat.full_name}` : '', card.tickets[0].ngay_xuat_hd ? fmtDate(card.tickets[0].ngay_xuat_hd) : ''].filter(Boolean).join(' · ')}
                        </div>
                      )}
                      {state === 'Đã lên hóa đơn' && (() => {
                        const d = daysSince(card.tickets[0].ngay_xuat_hd)
                        if (d == null) return null
                        const cls = d > 30 ? 'bg-red-50 text-red-700 border-red-200' : d > 15 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-200'
                        return <div className={`inline-block border rounded-full px-2 py-0.5 text-[9px] font-semibold ${cls}`}>Chờ thu {d} ngày</div>
                      })()}
                    </div>
                  )}
              </div>
            )
          })
        )}
      </div>
    )
  }

  // Thu thập toàn bộ danh sách vật tư gộp để hiển thị trong Modal copy
  const modalAllVt = activeCard ? activeCard.tickets.flatMap(t => t.soct_chi_tiet_vat_tu || []) : []
  const modalStats = getVatTuStats(modalAllVt)
  const modalKh = activeCard?.tickets[0]?.soct_khach_hang

  // Giải quyết thông tin Khách hàng Cụm nếu có, nếu không lấy của khách lẻ
  const modalCum = modalKh?.soct_khach_cum
  const modalTenKh = modalCum ? (modalCum.ten_khach_hang || '') : (modalKh?.ten_khach_hang || 'Khách hàng lẻ')
  const modalMst = modalCum ? modalCum.ma_so_thue : modalKh?.ma_so_thue
  const modalEmail = modalCum ? modalCum.email_ke_toan : modalKh?.email_ke_toan
  const modalDiaChi = modalCum ? modalCum.dia_chi : modalKh?.dia_chi

  // Gộp các dòng vật tư trùng mã hàng để hóa đơn in gọn gàng
  const aggregatedVatTu: Record<string, { ma_hang: string; ten_hang: string; so_luong: number; don_gia: number; vat: number }> = {}
  modalAllVt.filter(v => !v.da_tra).forEach(v => {
    const k = `${v.ma_hang}_${v.don_gia}`
    if (!aggregatedVatTu[k]) {
      aggregatedVatTu[k] = {
        ma_hang: v.ma_hang,
        ten_hang: v.ten_hd || v.soct_kho_hang?.ten_hang || v.ma_hang,
        so_luong: 0,
        don_gia: v.don_gia,
        vat: v.vat
      }
    }
    aggregatedVatTu[k].so_luong += v.so_luong
  })
  const modalDisplayRows = Object.values(aggregatedVatTu)

  return (
    <div className="space-y-4">
      {/* Header điều phối */}
      <div className="flex justify-between items-center gap-3 flex-wrap bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" /> Bảng điều phối hóa đơn (Kanban)
          </h2>
          <p className="text-xs text-slate-400">Tech_admin giao việc {`->`} Kế toán xuất hóa đơn trên MISA/Fast/SAPP và dán Số hóa đơn để hoàn tất.</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm khách / số phiếu / số HĐ..." className="pl-8 h-9 w-64 bg-white text-sm" />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-600" title="Kỳ đối chiếu chỉ lọc cột 'Đã thanh toán' (và cột 'Chờ thanh toán' nếu bật tùy chọn bên cạnh). Cột 1, 2 luôn hiện toàn bộ.">
            Kỳ đối chiếu:
            <MonthField value={thang} onChange={setThang} className="h-8 px-2 text-xs w-36" />
            <span className="text-[10px] text-slate-400">(áp cột Đã thanh toán)</span>
          </label>

          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none" title="Bật: cột Chờ thanh toán chỉ hiện HĐ trong kỳ đang chọn. Tắt: lũy kế toàn bộ nợ chưa thu.">
            <input type="checkbox" checked={col3ChiKyNay} onChange={e => setCol3ChiKyNay(e.target.checked)} className="w-4 h-4 accent-blue-600" />
            Chờ thanh toán: chỉ kỳ này
          </label>

          {role !== 'kthc' && (
            <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={grouped}
                onChange={e => setGrouped(e.target.checked)}
                className="w-4 h-4 accent-blue-600"
              />
              Tự động gom nhóm theo khách hàng
            </label>
          )}
          <Button onClick={load} disabled={loading} size="sm" variant="outline" className="h-9 gap-1 text-xs bg-white">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Tải lại
          </Button>
        </div>
      </div>

      {loading && tickets.length === 0 ? (
        <div className="text-center py-24 text-slate-400 text-sm italic bg-white border border-slate-200 rounded-xl shadow-sm">
          Đang tải bảng Kanban...
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-5 ${role === 'kthc' ? 'md:grid-cols-3' : 'md:grid-cols-4'}`}>
          {/* CỘT 1: CHỜ XUẤT HĐ (Chỉ hiện với Admin, Tech_admin, Staff) */}
          {role !== 'kthc' && (
            <div className="border border-slate-200 rounded-xl bg-white flex flex-col shadow-sm">
              <div className="p-3 bg-blue-50/50 rounded-t-xl flex justify-between items-center">
                <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-4 h-4" /> 1. Chờ lên hóa đơn ({cardsCol1.length})
                </h3>
              </div>
              {renderCardList(cardsCol1, 'Chờ xuất HĐ')}
            </div>
          )}

          {/* CỘT 2: ĐANG XỬ LÝ HĐ */}
          <div className="border border-slate-200 rounded-xl bg-white flex flex-col shadow-sm">
            <div className="p-3 bg-amber-50/50 rounded-t-xl flex justify-between items-center">
              <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> {role === 'kthc' ? '1.' : '2.'} KT-HC lên hóa đơn ({cardsCol2.length})
              </h3>
            </div>
            {renderCardList(cardsCol2, 'Đang xử lý HĐ')}
          </div>

          {/* CỘT 3: CHỜ THANH TOÁN (Trạng thái Đã lên hóa đơn) */}
          <div className="border border-slate-200 rounded-xl bg-white flex flex-col shadow-sm">
            <div className="p-3 bg-emerald-50/50 rounded-t-xl flex justify-between items-center">
              <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" /> {role === 'kthc' ? '2.' : '3.'} Chờ thanh toán ({cardsCol3.length})
              </h3>
            </div>
            {renderCardList(cardsCol3, 'Đã lên hóa đơn')}
          </div>

          {/* CỘT 4: ĐÃ THANH TOÁN */}
          <div className="border border-slate-200 rounded-xl bg-white flex flex-col shadow-sm">
            <div className="p-3 bg-indigo-50/50 rounded-t-xl flex justify-between items-center">
              <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wider flex items-center gap-1.5">
                <Landmark className="w-4 h-4" /> {role === 'kthc' ? '3.' : '4.'} Đã thanh toán ({cardsCol4.length})
              </h3>
            </div>
            {renderCardList(cardsCol4, 'Đã thanh toán')}
          </div>
        </div>
      )}

      {/* MODAL TRỢ THỦ COPY-PASTE CHO KẾ TOÁN */}
      {activeCard && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setActiveCard(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                <FileText className="w-5 h-5 text-blue-600" /> Trợ thủ lập Hóa đơn nhanh
              </h3>
              <button onClick={() => setActiveCard(null)} className="text-slate-400 hover:text-slate-600 font-bold text-lg">✕</button>
            </div>

            {/* Content (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {activeCard.tickets[0].trang_thai_hd === 'Chờ xuất HĐ' && (
                <div className="text-xs bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-blue-700">
                  Bấm <Pencil className="w-3 h-3 inline -mt-0.5" /> cạnh tên hàng để đổi tên hiển thị trên hóa đơn <b>trước khi</b> kéo sang cột kế toán.
                </div>
              )}

              {/* Thông tin khách hàng & MST */}
              <div className="bg-slate-50/70 p-4 rounded-lg border border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Tên khách hàng</div>
                  <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                    {modalTenKh}
                    <button
                      onClick={() => handleCopy(modalTenKh, 'ten_kh')}
                      className={`p-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-500 transition ${copiedKey === 'ten_kh' ? 'text-emerald-600 border-emerald-200' : ''}`}
                      title="Copy tên khách hàng"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Mã số thuế</div>
                  <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                    {modalMst || <span className="text-slate-400 italic">Chưa khai báo MST</span>}
                    {modalMst && (
                      <button
                        onClick={() => handleCopy(modalMst, 'mst')}
                        className={`p-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-500 transition ${copiedKey === 'mst' ? 'text-emerald-600 border-emerald-200' : ''}`}
                        title="Copy Mã số thuế"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Địa chỉ xuất hóa đơn</div>
                  <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                    {modalDiaChi || '—'}
                    {modalDiaChi && (
                      <button
                        onClick={() => handleCopy(modalDiaChi, 'dia_chi')}
                        className={`p-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-500 transition ${copiedKey === 'dia_chi' ? 'text-emerald-600 border-emerald-200' : ''}`}
                        title="Copy Địa chỉ"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Email nhận hóa đơn</div>
                  <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                    {modalEmail || <span className="text-slate-400 italic">Chưa khai báo Email</span>}
                    {modalEmail && (
                      <button
                        onClick={() => handleCopy(modalEmail, 'email_kt')}
                        className={`p-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-500 transition ${copiedKey === 'email_kt' ? 'text-emerald-600 border-emerald-200' : ''}`}
                        title="Copy Email nhận HĐ"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Bảng chi tiết sản phẩm / dịch vụ */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Danh sách sản phẩm dịch vụ ({modalDisplayRows.length} mặt hàng)</div>
                  <div className="flex items-center gap-1.5">
                    {activeCard.tickets[0]?._co_mau && (
                      <Button size="sm" variant="outline" onClick={applyTemplate} disabled={savingName} className="h-8 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-50" title="Điền tên + đơn giá đã lưu của khách này (rồi kiểm tra lại)">
                        <CheckSquare className="w-3.5 h-3.5" /> Áp mẫu khách
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={exportExcel} className="h-8 text-xs gap-1"><Download className="w-3.5 h-3.5" /> Xuất Excel</Button>
                    <label className="h-8 px-3 text-xs gap-1 inline-flex items-center rounded-md border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer text-slate-700">
                      <Upload className="w-3.5 h-3.5" /> Nhập Excel
                      <input type="file" accept=".xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importExcel(f); e.target.value = '' }} />
                    </label>
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 font-semibold uppercase">
                      <tr>
                        <th className="px-3 py-2">Tên vật tư / dịch vụ</th>
                        <th className="px-3 py-2 text-center w-14">SL</th>
                        <th className="px-3 py-2 text-right w-24">Đơn giá</th>
                        <th className="px-3 py-2 text-center w-14">VAT</th>
                        <th className="px-3 py-2 text-right w-24">Thành tiền</th>
                        <th className="px-3 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white font-medium text-slate-700">
                      {modalDisplayRows.map((v, i) => {
                        const tt = v.so_luong * v.don_gia
                        const copyText = `${v.ten_hang}\t${v.so_luong}\t${v.don_gia}\t${v.vat}`
                        if (editName?.ma_hang === v.ma_hang) {
                          return (
                            <tr key={i} className="bg-blue-50/40">
                              <td colSpan={6} className="px-3 py-2.5">
                                <div className="flex flex-col gap-2">
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <Input
                                      value={editName.ten}
                                      onChange={e => setEditName({ ...editName, ten: e.target.value })}
                                      placeholder="Tên hàng trên hóa đơn"
                                      className="h-9 bg-white text-xs sm:col-span-2"
                                    />
                                    <Input
                                      value={editName.gia}
                                      onChange={e => setEditName({ ...editName, gia: e.target.value })}
                                      placeholder="Đơn giá"
                                      inputMode="numeric"
                                      className="h-9 bg-white text-xs text-right"
                                    />
                                  </div>
                                  <div className="flex flex-wrap gap-2 items-center">
                                    <Button size="sm" onClick={() => saveName('hoa_don')} disabled={savingName} className="h-8 text-xs bg-blue-600 hover:bg-blue-700">Chỉ hóa đơn này</Button>
                                    <Button size="sm" variant="outline" onClick={() => saveName('khach')} disabled={savingName} className="h-8 text-xs">Lưu mẫu cho khách</Button>
                                    <button onClick={() => setEditName(null)} className="text-xs text-slate-500 hover:text-slate-700 px-1">Hủy</button>
                                    <span className="text-[10px] text-slate-400 ml-auto font-mono">Mã: {v.ma_hang}</span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )
                        }
                        return (
                          <tr key={i} className="hover:bg-slate-50/50">
                            <td className="px-3 py-2.5 font-medium">
                              <div className="flex items-center gap-1.5">
                                <span>{v.ten_hang}</span>
                                <button
                                  onClick={() => setEditName({ ma_hang: v.ma_hang, ten: v.ten_hang, gia: v.don_gia ? String(v.don_gia) : '' })}
                                  title="Đổi tên / đơn giá hiển thị trên hóa đơn"
                                  className="text-slate-300 hover:text-blue-600 shrink-0"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center">{v.so_luong}</td>
                            <td className="px-3 py-2.5 text-right font-mono">{fmtVnd(v.don_gia)}</td>
                            <td className="px-3 py-2.5 text-center font-mono">{v.vat}%</td>
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-800">{fmtVnd(tt)}</td>
                            <td className="px-2 py-2.5 text-center">
                              <button
                                onClick={() => handleCopy(copyText, `row_${i}`)}
                                className={`p-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-500 transition ${copiedKey === `row_${i}` ? 'text-emerald-600 border-emerald-200' : ''}`}
                                title="Copy nguyên dòng (Tên	SL	Đơn giá	VAT) để dán nhanh Excel/MISA"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bảng tổng cộng tài chính */}
              <div className="bg-slate-50/50 p-4 rounded-lg border border-slate-100 flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs text-slate-500">
                  <span>Tổng tiền hàng (trước thuế):</span>
                  <span className="font-mono font-bold text-slate-700">{fmtVnd(modalStats.truocVat)} đ</span>
                </div>
                <div className="flex justify-between items-center text-xs text-slate-500">
                  <span>Tiền thuế VAT:</span>
                  <span className="font-mono font-bold text-slate-700">{fmtVnd(modalStats.tienVat)} đ</span>
                </div>
                <div className="flex justify-between items-center text-sm border-t border-dashed border-slate-200 pt-2 font-bold text-slate-800">
                  <span>TỔNG CỘNG THANH TOÁN (sau thuế):</span>
                  <span className="font-mono text-blue-700 text-base">{fmtVnd(modalStats.sauVat)} đ</span>
                </div>
              </div>

              {/* Số hóa đơn đầu vào (Chỉ hiện khi ở cột 2 hoặc để xem lại cột 3/4) */}
              {activeCard.tickets[0].trang_thai_hd !== 'Chờ xuất HĐ' && (
                <div className="space-y-1 bg-blue-50/40 p-4 rounded-lg border border-blue-100">
                  <label className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1">
                    <Hash className="w-3.5 h-3.5" /> Số hóa đơn kế toán <span className="text-red-500">*</span>
                  </label>
                  <Input
                    required
                    placeholder="Nhập số hóa đơn (MISA/SAPP/Fast) để hoàn tất"
                    value={invoiceNum}
                    onChange={e => setInvoiceNum(e.target.value)}
                    disabled={activeCard.tickets[0].trang_thai_hd !== 'Đang xử lý HĐ'}
                    className="h-10 mt-1 bg-white uppercase font-mono font-bold text-slate-800 border-blue-200 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-blue-600">Lưu ý: Bắt buộc điền đúng Số hóa đơn đã xuất trên phần mềm để lưu vết đối chiếu.</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 shrink-0 flex-wrap">
              <Button variant="outline" onClick={() => setActiveCard(null)} className="h-10">Đóng</Button>
              {/* Nút chuyển trạng thái (thay kéo thả — dùng được trên điện thoại), theo vai trò + cột. */}
              {(() => {
                const st = activeCard.tickets[0].trang_thai_hd
                const canGiao = role === 'admin' || role === 'tech_admin' || role === 'staff'
                const canKt = role === 'admin' || role === 'kthc'
                return <>
                  {st === 'Chờ xuất HĐ' && canGiao && (
                    <Button onClick={() => moveStatus('Đang xử lý HĐ')} disabled={completing} className="h-10">Bàn giao Kế toán →</Button>
                  )}
                  {st === 'Đã lên hóa đơn' && canKt && (
                    <>
                      <Button variant="outline" onClick={() => moveStatus('Đang xử lý HĐ')} disabled={completing} className="h-10">← Trả về xử lý</Button>
                      <Button onClick={() => moveStatus('Đã thanh toán', true)} disabled={completing} className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">Đã thanh toán →</Button>
                    </>
                  )}
                  {st === 'Đã thanh toán' && canKt && (
                    <Button variant="outline" onClick={() => moveStatus('Đã lên hóa đơn', true)} disabled={completing} className="h-10">← Bỏ đánh dấu thanh toán</Button>
                  )}
                  {st === 'Đang xử lý HĐ' && (
                    <Button
                      onClick={handleCompleteInvoice}
                      disabled={completing || !invoiceNum.trim()}
                      className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                    >
                      {completing ? 'Đang xử lý...' : 'Hoàn tất xuất hóa đơn'}
                    </Button>
                  )}
                </>
              })()}
            </div>

          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN (THAY THẾ WINDOW.CONFIRM) */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4" onClick={() => setConfirmDialog(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 space-y-3">
              <h3 className="text-lg font-bold text-red-700 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" /> {confirmDialog.title}
              </h3>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">
                {confirmDialog.message}
              </p>
            </div>
            <div className="bg-slate-50 p-4 flex justify-end gap-2 border-t border-slate-100">
              <Button variant="outline" onClick={() => setConfirmDialog(null)} className="h-9">Hủy bỏ</Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  const act = confirmDialog.onConfirm
                  setConfirmDialog(null)
                  await act()
                }}
                className="h-9"
              >
                Xác nhận
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}