"use client"

import { useState, useEffect, useCallback } from "react"
import { Copy, AlertCircle, CheckCircle, Clock, ArrowRight, User, Hash, CheckSquare, Layers, FileText, RefreshCw, Landmark, Pencil, Search, Download, Upload, Info, GripVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import MonthField from "@/components/MonthField"
import DateField from "@/components/DateField"
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
  thu_tu?: number             // thứ tự dòng (kéo-thả sắp xếp ở cột "Chờ lên hóa đơn")
  don_vi_tinh?: string | null // ĐVT (Tháng/Bản/Chiếc… cho phiếu Thuê/CPC; mặc định "Cái")
  soct_kho_hang: { ten_hang: string } | null
}

type Customer = {
  id: string
  ten_khach_hang: string
  loai_hd?: string | null
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
  mien_phi?: boolean // phiếu xuất MIỄN PHÍ (MF) — vật tư máy thuê/CPC
  ktv_id: string | null
  ktv2_id: string | null
  so_luong: number
  created_by: string
  da_nop_phieu: boolean
  trang_thai_hd: 'Chờ xuất HĐ' | 'Đang xử lý HĐ' | 'Đã lên hóa đơn' | 'Đã thanh toán'
  so_hoa_don: string | null
  ngay_xuat_hd?: string | null
  so_tien_da_thu?: number // đã thu theo số hóa đơn (công nợ phải thu)
  dntt_luc?: string | null // lần xuất ĐNTT gần nhất (thời điểm)
  so_dntt?: string | null
  dntt_lan?: number // số lần đã xuất ĐNTT
  lam_tron?: number // khoản làm tròn tổng sau thuế (đồng, cho phép âm)
  ten_khach_hd?: string | null // tên người mua ghi đè trên hóa đơn (bảng kê gộp Thuê/CPC = tên hợp đồng)
  nguon?: string | null // 'thue_cpc' = phiếu sinh từ bảng kê Thuê/CPC (mỗi phiếu = 1 thẻ riêng)
  ly_do_tra?: string | null // lý do kế toán trả phiếu về Cột 1 (thiếu/sai thông tin lên HĐ)
  minvoice_luc?: string | null // lần xuất M-invoice gần nhất (NULL = chưa xuất) — chống xuất trùng
  minvoice_lan?: number // số lần đã xuất M-invoice
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
const parseMoney = (s: any) => Number(String(s ?? '').replace(/\D/g, '')) || 0
const fmtMoneyInput = (s: any) => { const n = String(s ?? '').replace(/\D/g, ''); return n ? Number(n).toLocaleString('vi-VN') : '' }
const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
// Số ngày kể từ ngày xuất hóa đơn (tính tuổi nợ đọng ở cột Chờ thanh toán).
const daysSince = (d: any): number | null => { if (!d) return null; const t = new Date(d).getTime(); return isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 86400000)) }
// Tổng khoản làm tròn của một nhóm phiếu (đồng, cho phép âm) — cộng vào tổng sau thuế.
const cardLamTron = (tickets: Ticket[]) => tickets.reduce((s, t) => s + (Number(t.lam_tron) || 0), 0)
// Thẻ ĐÃ XUẤT M-invoice = mọi phiếu trong thẻ đều có dấu minvoice_luc (xuất theo cả thẻ).
const cardMinvoiceExported = (tickets: Ticket[]) => tickets.length > 0 && tickets.every(t => !!t.minvoice_luc)
// Thẻ CHỜ ĐỐI CHIẾU = đã xuất file nhưng CHƯA có số HĐ thật -> nuôi banner đếm + badge cảnh báo.
const cardMinvoicePending = (tickets: Ticket[]) => cardMinvoiceExported(tickets) && !tickets.some(t => t.so_hoa_don)

// Gộp vật tư theo (mã hàng + đơn giá), bỏ dòng đã trả về kho, SẮP theo thu_tu. Dùng cho export M-invoice.
// ghepMa = dòng có bản ghi kho (vật tư thật) VÀ chưa đặt tên riêng (ten_hang_hd rỗng) -> tự ghép mã.
function aggVatTu(vtList: VatTu[]) {
  const map: Record<string, { ma_hang: string; ten_hang: string; so_luong: number; don_gia: number; vat: number; dvt: string; ghepMa: boolean; _ord: number }> = {}
  vtList.filter(v => !v.da_tra).forEach(v => {
    const k = `${v.ma_hang}_${Number(v.don_gia) || 0}`
    if (!map[k]) map[k] = { ma_hang: v.ma_hang, ten_hang: v.ten_hd || v.soct_kho_hang?.ten_hang || v.ma_hang, so_luong: 0, don_gia: v.don_gia, vat: v.vat, dvt: v.don_vi_tinh || '', ghepMa: !!v.soct_kho_hang && !(v.ten_hang_hd && String(v.ten_hang_hd).trim()), _ord: Number.POSITIVE_INFINITY }
    map[k].so_luong += v.so_luong
    map[k]._ord = Math.min(map[k]._ord, Number(v.thu_tu ?? 1e9))
  })
  return Object.values(map).sort((a, b) => a._ord - b._ord)
}

// Tên hàng cho KẾ TOÁN: kế toán yêu cầu mã hàng hiện TRÊN TÊN hóa đơn (cột Tên hàng in ra HĐĐT,
// cột Mã hàng thường không in) -> ghép "Tên - Mã". CHỈ tự ghép cho dòng dùng TÊN KHO gốc (ghepMa),
// tức chưa ai sửa tên. Tên TỰ ĐẶT / ÁP MẪU KHÁCH (đã ghi ten_hang_hd) và dòng DỊCH VỤ Thuê/CPC
// (không có kho) -> GIỮ NGUYÊN, để user tự quyết trường hợp không muốn mã. Chống NHÂN ĐÔI: nếu tên
// đã chứa mã ở BẤT KỲ dạng nào (ngoặc "Trục lăn (9J07330102)", gạch, hay trần) thì không thêm —
// so khớp sau khi bỏ hết ký tự không phải chữ/số và viết hoa.
function tenHangKeToan(ten: string, ma: string, ghepMa: boolean): string {
  const t = String(ten || '').trim()
  const m = String(ma || '').trim()
  if (!ghepMa || !m) return t
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const nm = norm(m)
  if (nm && norm(t).includes(nm)) return t
  return `${t} - ${m}`
}

// 32 cột đúng mẫu import M-invoice (Sheet1). GIỮ NGUYÊN thứ tự & chữ (kể cả lỗi chính tả gốc).
const MINV_HEADERS = ['Ký hiệu(*)', 'Số đơn hàng(*)', 'Ngày hoá đơn(*)', 'Đơn vị tiền tệ(*)', 'Tên người mua', 'Mã Người mua', 'Tên đơn vị mua', 'Mã số thuê', 'Địa chỉ(*)', 'HTTT(*)', 'Email', 'Tỷ giá(*)', 'STK Người mua', 'Ngân hàng Người mua', 'Tính chất(*)', 'Số thứ tự(*)', 'Mã hàng', 'Tên hàng(*)', 'Đơn vị tính', 'Số lượng', 'Đơn giá', 'Thành tiền trước thuế(*)', 'PT chiết khấu', 'Tiền CK', 'Thuế(*)', 'Tiền thuế(*)', 'Tổng tiền(*)', 'Căn cước công dân', 'Mã đơn vị quan thệ ngân sách', 'Số hộ chiếu', 'Mã cửa hàng', 'Tên cửa hàng']

// Dựng các dòng M-invoice cho MỘT hóa đơn (1 nhóm phiếu). Thông tin khách + ngày chỉ ở dòng đầu;
// Ký hiệu + Số đơn hàng ở mọi dòng (khóa gom). KHÔNG áp làm tròn (M-invoice tự tính, kthc sửa tay).
function buildMinvoiceRows(tickets: Ticket[], kyHieu: string, ngayHD: Date, soDonHang: string): any[][] {
  const kh = tickets[0]?.soct_khach_hang
  const cum = kh?.soct_khach_cum
  // Tên người mua: ghi đè (ten_khach_hd, VD bảng kê gộp Thuê/CPC) > cụm > khách lẻ.
  const tenDonVi = tickets[0]?.ten_khach_hd || (cum ? (cum.ten_khach_hang || '') : (kh?.ten_khach_hang || ''))
  const mst = (cum ? cum.ma_so_thue : kh?.ma_so_thue) || ''
  const diaChi = (cum ? cum.dia_chi : kh?.dia_chi) || ''
  const email = (cum ? cum.email_ke_toan : kh?.email_ke_toan) || ''
  const items = aggVatTu(tickets.flatMap(t => t.soct_chi_tiet_vat_tu || []))
  return items.map((it, idx) => {
    const thanhTien = Math.round(it.so_luong * it.don_gia)
    const tienThue = Math.round(it.so_luong * it.don_gia * (Number(it.vat) || 0) / 100)
    const row = new Array(32).fill('')
    // Mọi dòng: Ký hiệu, Số đơn hàng, Ngày HĐ, HTTT (M-invoice BẮT BUỘC Ngày + HTTT ở MỌI dòng).
    row[0] = kyHieu; row[1] = soDonHang; row[2] = ngayHD; row[9] = 'TM/CK'
    if (idx === 0) {                                // chỉ dòng đầu: các trường đầu HĐ + khách còn lại
      row[3] = 'VND'; row[11] = 1
      // Tên đơn vị mua IN HOA (chuẩn hóa đơn); địa chỉ giữ chữ thường như nhập.
      row[6] = tenDonVi.toUpperCase(); row[7] = mst; row[8] = diaChi; row[10] = email
    }
    row[14] = 1; row[15] = idx + 1                  // Tính chất=hàng hoá; STT
    row[16] = it.ma_hang; row[17] = tenHangKeToan(it.ten_hang, it.ma_hang, it.ghepMa); row[18] = it.dvt || 'Cái'
    row[19] = it.so_luong; row[20] = it.don_gia
    row[21] = thanhTien; row[22] = 0; row[23] = 0
    row[24] = Number(it.vat) || 0; row[25] = tienThue; row[26] = thanhTien + tienThue
    return row
  })
}

export default function KanbanHdTool({ role = 'staff', showNotification }: { role?: string, showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("") // tìm khách / số phiếu / số hóa đơn
  const [col3ChiKyNay, setCol3ChiKyNay] = useState(false) // cột Chờ thanh toán: lọc theo kỳ hay lũy kế
  const [importingReport, setImportingReport] = useState(false) // đang import báo cáo M-invoice
  const [importResult, setImportResult] = useState<{ ok: number; total: number; skipped: { soHD: string; ten: string; reason: string }[]; failed: { soHD: string; reason: string }[] } | null>(null)
  const [payModal, setPayModal] = useState<{ soHd: string; ticketIds: string[]; tong: number; daThu: number; tenKh: string; soPhieu: string[] } | null>(null)
  const [payInput, setPayInput] = useState("")
  const [paying, setPaying] = useState(false)
  const [grouped, setGrouped] = useState(true) // Bật/tắt tự động gom nhóm theo khách hàng
  const [activeCard, setActiveCard] = useState<{ type: 'single' | 'group', tickets: Ticket[] } | null>(null)
  const [invoiceNum, setInvoiceNum] = useState("")
  const [completing, setCompleting] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  // Sửa tên + đơn giá + ĐVT trong modal. Giữ kèm giá trị GỐC (ten0/gia0/dvt0) để khi Lưu chỉ ghi
  // trường THỰC SỰ đổi — tránh vô tình ghi ten_hang_hd (làm rớt phần ghép "Tên - Mã") khi chỉ sửa ĐVT.
  const [editName, setEditName] = useState<{ ma_hang: string; ten: string; gia: string; dvt: string; ten0: string; gia0: string; dvt0: string } | null>(null)
  const [savingName, setSavingName] = useState(false)
  // Import thanh toán FAST (đối ứng công nợ Cột 3)
  const [payImporting, setPayImporting] = useState(false)
  const [payResult, setPayResult] = useState<any>(null)
  // Bộ lọc Cột 3 (kthc/admin theo dõi công nợ)
  const [col3Pay, setCol3Pay] = useState<'all' | 'chua' | 'phan' | 'du'>('all')
  const [col3Age, setCol3Age] = useState<'all' | 'd30' | 'd15' | 'd0'>('all')
  const [dragVtIdx, setDragVtIdx] = useState<number | null>(null) // kéo-thả sắp xếp dòng vật tư
  // Kế toán TRẢ LẠI phiếu về Cột 1 kèm lý do (cho tech_admin/staff sửa).
  const [returnTarget, setReturnTarget] = useState<{ ids: string[]; reason: string } | null>(null)
  const [returning, setReturning] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    onConfirm: () => Promise<void>
  } | null>(null)
  const [thang, setThang] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  // Xuất Excel công nợ (dữ liệu thô cho kthc pivot) — 2 sheet: chưa thu / đã thanh toán.
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [expPhongBan, setExpPhongBan] = useState<'tat_ca' | 'ky_thuat' | 'kinh_doanh'>('tat_ca')
  const [expCutoff, setExpCutoff] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })
  const [expTu, setExpTu] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` })
  const [expDen, setExpDen] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })

  // Đặt tổng sau thuế mục tiêu (làm tròn) trong modal.
  const [roundOpen, setRoundOpen] = useState(false)
  const [roundVal, setRoundVal] = useState("")
  const [savingRound, setSavingRound] = useState(false)
  // Ký hiệu HĐ M-invoice — kế toán tự sửa ngay trên Bảng điều phối (không phụ thuộc admin).
  const [kyHieuMinvoice, setKyHieuMinvoice] = useState("")
  const [kyHieuEdit, setKyHieuEdit] = useState("")
  const [savingKyHieu, setSavingKyHieu] = useState(false)

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

  // Lấy ký hiệu M-invoice từ cấu hình (1 lần).
  useEffect(() => {
    fetch('/api/admin/cau-hinh').then(r => r.json()).then(j => { if (j?.data) { const k = j.data.minvoice_ky_hieu || ''; setKyHieuMinvoice(k); setKyHieuEdit(k) } }).catch(() => {})
  }, [])

  // Kế toán lưu ký hiệu M-invoice (endpoint riêng cho admin/kthc).
  const saveKyHieu = async () => {
    setSavingKyHieu(true)
    try {
      const res = await fetch('/api/admin/minvoice-kyhieu', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gia_tri: kyHieuEdit }) })
      if (res.ok) { const j = await res.json(); const k = j.gia_tri ?? kyHieuEdit.trim(); setKyHieuMinvoice(k); setKyHieuEdit(k); showNotification('success', 'Đã lưu ký hiệu M-invoice.') }
      else { const e = await res.json(); showNotification('error', e.error || 'Lỗi lưu ký hiệu') }
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setSavingKyHieu(false) }
  }

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
  useEffect(() => { if (!activeCard) { setEditName(null); setRoundOpen(false) } }, [activeCard])

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

  // Xuất Đề nghị thanh toán (.docx) cho 1 số hóa đơn. Tải file + cập nhật badge (load lại).
  const exportDntt = async (so_hd: string) => {
    try {
      const res = await fetch(`/api/admin/dntt?so_hd=${encodeURIComponent(so_hd)}`)
      if (!res.ok) { const j = await res.json().catch(() => ({})); showNotification('error', j.error || 'Lỗi xuất ĐNTT'); return }
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') || ''
      const fname = decodeURIComponent((cd.match(/filename="?([^"]+)"?/) || [])[1] || 'DNTT.docx')
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fname; a.click(); URL.revokeObjectURL(url)
      showNotification('success', 'Đã xuất Đề nghị thanh toán.'); load()
    } catch { showNotification('error', 'Lỗi kết nối') }
  }

  // Đếm dòng hàng còn ĐƠN GIÁ 0đ (chưa trả về kho). Dùng để cảnh báo trước khi bàn giao kế
  // toán — sau bàn giao KHÔNG sửa được giá nữa, dễ để lọt giá 0 vào hóa đơn.
  const countZeroPrice = (ts: Ticket[]) =>
    ts.reduce((n, t) => n + (t.soct_chi_tiet_vat_tu || []).filter(v => !v.da_tra && (Number(v.don_gia) || 0) === 0).length, 0)

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
      } else if (sourceState === 'Đã lên hóa đơn' && targetState === 'Đã thanh toán') {
        // Cột 3 -> Cột 4: KHÔNG chuyển thẳng — mở modal Thu tiền (ghi số tiền khách trả theo HĐ).
        openPayModal(targetIds)
      } else {
        // Cập nhật trạng thái trực tiếp (Ví dụ: 1 -> 2, 4 -> 3)
        const doMove = async () => {
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
        // Bàn giao kế toán (Cột 1 -> 2) mà còn dòng giá 0đ -> hỏi xác nhận (sau đó khóa sửa giá).
        if (sourceState === 'Chờ xuất HĐ' && targetState === 'Đang xử lý HĐ') {
          const z = countZeroPrice(tickets.filter(t => targetIds.includes(t.id)))
          if (z > 0) {
            setConfirmDialog({
              title: 'Còn dòng đơn giá 0đ',
              message: `Phiếu còn ${z} dòng hàng đơn giá 0đ. Sau khi bàn giao kế toán sẽ KHÔNG sửa được giá nữa. Bàn giao luôn?`,
              onConfirm: doMove,
            })
            return
          }
        }
        await doMove()
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
    // Bàn giao kế toán (Cột 1 -> 2) mà còn dòng giá 0đ -> hỏi xác nhận trước.
    if (targetState === 'Đang xử lý HĐ' && activeCard.tickets[0]?.trang_thai_hd === 'Chờ xuất HĐ') {
      const z = countZeroPrice(activeCard.tickets)
      if (z > 0) {
        setConfirmDialog({
          title: 'Còn dòng đơn giá 0đ',
          message: `Phiếu còn ${z} dòng hàng đơn giá 0đ. Sau khi bàn giao kế toán sẽ KHÔNG sửa được giá nữa. Bàn giao luôn?`,
          onConfirm: () => doMoveStatus(targetState, keepInvoice),
        })
        return
      }
    }
    await doMoveStatus(targetState, keepInvoice)
  }
  const doMoveStatus = async (targetState: string, keepInvoice = false) => {
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
  // Mở modal Thu tiền cho một HÓA ĐƠN (theo danh sách phiếu cùng số HĐ).
  const openPayModal = (ticketIds: string[]) => {
    const ts = tickets.filter(t => ticketIds.includes(t.id))
    if (ts.length === 0) return
    const soHd = ts[0].so_hoa_don || ''
    const tong = Math.round(getVatTuStats(ts.flatMap(t => t.soct_chi_tiet_vat_tu || [])).sauVat) + cardLamTron(ts)
    const daThu = Number(ts[0].so_tien_da_thu) || 0
    const cum = ts[0].soct_khach_hang?.soct_khach_cum
    const tenKh = ts[0].ten_khach_hd || (cum ? (cum.ten_khach_hang || '') : (ts[0].soct_khach_hang?.ten_khach_hang || 'Khách lẻ'))
    setPayInput("")
    setPayModal({ soHd, ticketIds, tong, daThu, tenKh, soPhieu: ts.map(t => t.report || '—') })
  }

  // Gọi API ghi thu tiền (cộng dồn); chuyen=true thì chuyển cả hóa đơn sang Đã thanh toán.
  const doPay = async (them: number, chuyen: boolean) => {
    if (!payModal) return
    setPaying(true)
    try {
      const res = await fetch('/api/admin/hd-thu', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ so_hoa_don: payModal.soHd, so_tien_them: them, chuyen }),
      })
      if (res.ok) {
        showNotification('success', chuyen ? 'Đã thu đủ — chuyển sang Đã thanh toán.' : 'Đã ghi nhận thanh toán.')
        setPayModal(null); load()
      } else { const e = await res.json(); showNotification('error', e.error || 'Lỗi ghi thu') }
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setPaying(false) }
  }

  // Bấm Xác nhận trong modal Thu tiền -> phân nhánh thiếu / đủ / dư.
  const submitPay = () => {
    if (!payModal) return
    const them = parseMoney(payInput)
    if (them <= 0) return showNotification('error', 'Nhập số tiền khách thanh toán.')
    const moi = payModal.daThu + them
    const con = payModal.tong - moi
    if (con > 0) {
      // Còn thiếu -> ghi nhận, thẻ ở lại Chờ thanh toán.
      doPay(them, false)
    } else if (con === 0) {
      setConfirmDialog({
        title: 'Đã thu đủ',
        message: `Hóa đơn ${payModal.soHd} đã thu đủ ${fmtVnd(payModal.tong)} đ.\nChuyển sang "Đã thanh toán"?`,
        onConfirm: async () => { await doPay(them, true) },
      })
    } else {
      setConfirmDialog({
        title: 'Khách trả DƯ',
        message: `Tổng hóa đơn ${fmtVnd(payModal.tong)} đ, nhưng đã thu ${fmtVnd(moi)} đ (dư ${fmtVnd(-con)} đ).\nVẫn ghi nhận và chuyển sang "Đã thanh toán"?`,
        onConfirm: async () => { await doPay(them, true) },
      })
    }
  }

  // Admin đặt lại số đã thu của hóa đơn (cứu khi gõ nhầm).
  const resetThu = () => {
    if (!payModal) return
    setConfirmDialog({
      title: 'Đặt lại số đã thu',
      message: `Đặt lại "đã thu" của hóa đơn ${payModal.soHd} về 0?`,
      onConfirm: async () => {
        setPaying(true)
        try {
          const res = await fetch('/api/admin/hd-thu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ so_hoa_don: payModal.soHd, reset: true }) })
          if (res.ok) { showNotification('success', 'Đã đặt lại số đã thu.'); setPayModal(null); load() }
          else { const e = await res.json(); showNotification('error', e.error || 'Lỗi đặt lại') }
        } catch { showNotification('error', 'Lỗi kết nối') } finally { setPaying(false) }
      },
    })
  }

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
      // CHỈ gửi trường THỰC SỰ đổi (so với giá trị gốc). Không đổi tên -> KHÔNG gửi ten_hang -> API
      // giữ ten_hang_hd cũ (null) -> phần ghép "Tên - Mã" vẫn còn. Tránh sửa ĐVT làm rớt mã.
      const trim = (s: string) => String(s ?? '').trim()
      const res = await fetch('/api/admin/ten-hang-rieng', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pham_vi, ma_hang: editName.ma_hang,
          ...(trim(editName.ten) !== trim(editName.ten0) ? { ten_hang: editName.ten } : {}),
          ...(trim(editName.gia) !== trim(editName.gia0) ? { don_gia: editName.gia } : {}),
          ...(trim(editName.dvt) !== trim(editName.dvt0) ? { don_vi_tinh: editName.dvt } : {}),
          // Lưu mẫu khách: gửi kèm ticket_ids để áp NGAY vào dòng phiếu đang mở (không chỉ nhớ kỳ sau).
          ticket_ids: activeCard.tickets.map(t => t.id),
          ...(pham_vi === 'khach' ? { scope_key: modalScopeKey } : {}),
        }),
      })
      if (res.ok) {
        showNotification('success', pham_vi === 'khach' ? 'Đã đổi trên hóa đơn này và lưu mẫu cho khách (kỳ sau tự dùng).' : 'Đã cập nhật hóa đơn này.')
        setEditName(null)
        load()
      } else { const e = await res.json(); showNotification('error', e.error || 'Lỗi lưu') }
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setSavingName(false) }
  }

  // RESET 1 mã hàng: xóa MẪU đã lưu cho khách/cụm + đưa dòng vật tư kho về tên kho.
  // Dòng DỊCH VỤ (không có bản ghi kho: DVTM/DVCR…) giữ nguyên tên hiện tại để không hiện mã trơ.
  const resetName = async () => {
    if (!editName || !activeCard) return
    setSavingName(true)
    try {
      const res = await fetch('/api/admin/ten-hang-rieng', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pham_vi: 'reset', ma_hang: editName.ma_hang, scope_key: modalScopeKey,
          ticket_ids: activeCard.tickets.map(t => t.id),
        }),
      })
      if (res.ok) {
        const j = await res.json().catch(() => ({}))
        showNotification('success', j.reverted
          ? 'Đã xóa mẫu khách và đưa dòng về tên kho.'
          : 'Đã xóa mẫu khách. Dòng dịch vụ giữ tên hiện tại — sửa bằng "Chỉ hóa đơn này" nếu cần.')
        setEditName(null)
        load()
      } else { const e = await res.json(); showNotification('error', e.error || 'Lỗi reset') }
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

  // Đặt tổng sau thuế mục tiêu -> lưu CHÊNH LỆCH LÀM TRÒN (delta = mục tiêu − tổng tự tính).
  const saveLamTron = async () => {
    if (!activeCard) return
    const target = parseMoney(roundVal)
    const rawTong = Math.round(getVatTuStats(activeCard.tickets.flatMap(t => t.soct_chi_tiet_vat_tu || [])).sauVat)
    const delta = target - rawTong
    if (Math.abs(delta) > 1000) { showNotification('error', 'Chênh lệch làm tròn vượt ±1.000đ — kiểm tra lại số nhập.'); return }
    setSavingRound(true)
    try {
      const res = await fetch('/api/admin/lam-tron', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_ids: activeCard.tickets.map(t => t.id), lam_tron: delta }),
      })
      if (res.ok) {
        showNotification('success', delta === 0 ? 'Đã bỏ làm tròn.' : `Đã đặt tổng ${fmtVnd(target)}đ (làm tròn ${delta > 0 ? '+' : ''}${fmtVnd(delta)}).`)
        setRoundOpen(false); load()
      } else { const e = await res.json(); showNotification('error', e.error || 'Lỗi lưu làm tròn') }
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setSavingRound(false) }
  }

  // Xuất Excel danh sách vật tư (Mã hàng · Tên · SL · Đơn giá · VAT · Thành tiền) để sửa hàng loạt.
  const exportExcel = async () => {
    if (!activeCard) return
    const mod: any = await import('exceljs'); const ExcelJS = mod.default ?? mod
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('HangHoa')
    ws.addRow(['Mã hàng', 'Tên hàng', 'SL', 'ĐVT', 'Đơn giá', 'VAT (%)', 'Thành tiền (chưa VAT)'])
    for (const v of modalDisplayRows) ws.addRow([v.ma_hang, v.ten_hang, v.so_luong, v.dvt || 'Cái', v.don_gia, v.vat, v.so_luong * v.don_gia])
    ws.getRow(1).font = { bold: true }
    const buf = await wb.xlsx.writeBuffer()
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const a = document.createElement('a')
    a.href = url; a.download = `hanghoa-${activeCard.tickets[0]?.so_hoa_don || activeCard.tickets[0]?.report || 'phieu'}.xlsx`; a.click(); URL.revokeObjectURL(url)
  }

  // ── XUẤT EXCEL CÔNG NỢ (dữ liệu thô cho kthc pivot) ─────────────────────────────
  // 2 sheet: "Cong no chua thu" (cột 3, lũy kế đến cutoff) + "Da thanh toan" (cột 4, range).
  // Bảng phẳng: 1 dòng = 1 số HĐ, AutoFilter + freeze header, KHÔNG subtotal/tổng.
  const buildCongNoSheet = (ws: any, list: Ticket[], isChuaThu: boolean) => {
    const headers = ['STT', 'Phòng ban', 'NV kinh doanh', 'Số HĐ', 'Ngày HĐ', 'Khách hàng', 'MST', 'Địa chỉ', 'Số phiếu', 'SL phiếu', 'Trước VAT', 'VAT (%)', 'Tiền VAT', 'Tổng sau VAT', 'Đã thu']
    if (isChuaThu) headers.push('Còn nợ', 'Tuổi nợ')
    headers.push('Người lập HĐ', 'Số ĐNTT', 'MF', 'Ghi chú')
    ws.addRow(headers)

    const cards = groupByHd(list, isChuaThu ? 'Đã lên hóa đơn' : 'Đã thanh toán')
    const khName = (c: any) => { const cum = c.customer?.soct_khach_cum; return norm(cum ? (cum.ten_khach_hang || '') : (c.customer?.ten_khach_hang || '')) }
    cards.sort((a: any, b: any) => {
      const ka = khName(a), kb = khName(b)
      if (ka !== kb) return ka < kb ? -1 : 1
      const da = a.tickets[0]?.ngay_xuat_hd || '', db = b.tickets[0]?.ngay_xuat_hd || ''
      return da < db ? -1 : da > db ? 1 : 0
    })
    const toDate = (s?: string | null) => { if (!s) return null; const [y, m, d] = String(s).split('-').map(Number); return (y && m && d) ? new Date(y, m - 1, d) : null }

    cards.forEach((card: any, i: number) => {
      const t0 = card.tickets[0]
      const allVt = card.tickets.flatMap((t: any) => t.soct_chi_tiet_vat_tu || [])
      const { truocVat, sauVat, activeVt } = getVatTuStats(allVt)
      // Mức VAT hiển thị: đồng nhất -> số (VD 8); trộn nhiều mức -> 'mix'; không có -> ''.
      const rates = [...new Set(activeVt.map((v: any) => Number(v.vat) || 0))]
      const vatRate: number | string = rates.length === 0 ? '' : rates.length === 1 ? rates[0] : 'mix'
      const cum = card.customer?.soct_khach_cum
      const tenKh = card.tickets[0]?.ten_khach_hd || (cum ? (cum.ten_khach_hang || '') : (card.customer?.ten_khach_hang || 'Khách hàng lẻ'))
      const mst = (cum ? cum.ma_so_thue : card.customer?.ma_so_thue) || ''
      const diaChi = (cum ? cum.dia_chi : card.customer?.dia_chi) || ''
      const soPhieu = card.tickets.map((t: any) => t.report || '—').join(', ')
      const truoc = Math.round(truocVat)
      const tong = Math.round(sauVat) + cardLamTron(card.tickets) // cộng làm tròn
      const daThu = Math.round(Number(t0.so_tien_da_thu) || 0)
      const conNo = Math.max(0, tong - daThu)
      const du = daThu - tong
      const mf = card.tickets.every((t: any) => t.mien_phi) ? 'x' : card.tickets.some((t: any) => t.mien_phi) ? 'một phần' : ''
      const soDntt = card.tickets.find((t: any) => t.so_dntt)?.so_dntt || ''
      const tuoiNo = daysSince(t0.ngay_xuat_hd)

      const row: any[] = [
        i + 1, 'Kỹ thuật', '', t0.so_hoa_don || '', toDate(t0.ngay_xuat_hd),
        tenKh, mst, diaChi, soPhieu, card.tickets.length,
        truoc, vatRate, tong - truoc, tong, daThu,
      ]
      if (isChuaThu) row.push(conNo, tuoiNo == null ? '' : tuoiNo)
      row.push(t0.nguoi_xuat?.full_name || '', soDntt, mf, du > 0 ? `(dư ${fmtVnd(du)})` : '')
      ws.addRow(row)
    })

    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    const lastCol = ws.getColumn(headers.length).letter
    ws.autoFilter = `A1:${lastCol}${Math.max(1, ws.rowCount)}`
    const moneyCols = isChuaThu ? [11, 13, 14, 15, 16] : [11, 13, 14, 15]
    moneyCols.forEach(c => { ws.getColumn(c).numFmt = '#,##0' })
    ws.getColumn(12).numFmt = '0"%"' // VAT (%): giá trị số, hiện "8%"
    ws.getColumn(5).numFmt = 'dd/mm/yyyy'
    const widths = isChuaThu
      ? [5, 10, 16, 10, 12, 32, 14, 32, 24, 8, 14, 8, 12, 14, 14, 14, 8, 16, 12, 6, 14]
      : [5, 10, 16, 10, 12, 32, 14, 32, 24, 8, 14, 8, 12, 14, 14, 16, 12, 6, 14]
    widths.forEach((w, idx) => { ws.getColumn(idx + 1).width = w })
  }

  const runExportCongNo = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams({ phong_ban: expPhongBan })
      if (expCutoff) params.set('cutoff', expCutoff)
      if (expTu) params.set('tu', expTu)
      if (expDen) params.set('den', expDen)
      const res = await fetch(`/api/admin/kanban-hd/export?${params.toString()}`)
      const j = await res.json()
      if (!res.ok) { showNotification('error', j.error || 'Lỗi tải dữ liệu xuất'); return }
      const chuaThu: Ticket[] = (j.chua_thu || []).filter(matchSearch)
      const daThanhToan: Ticket[] = (j.da_thanh_toan || []).filter(matchSearch)
      if (chuaThu.length === 0 && daThanhToan.length === 0) {
        showNotification('error', 'Không có dữ liệu công nợ khớp bộ lọc.')
        return
      }
      const mod: any = await import('exceljs'); const ExcelJS = mod.default ?? mod
      const wb = new ExcelJS.Workbook()
      buildCongNoSheet(wb.addWorksheet('Cong no chua thu'), chuaThu, true)
      buildCongNoSheet(wb.addWorksheet('Da thanh toan'), daThanhToan, false)
      const buf = await wb.xlsx.writeBuffer()
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a')
      const stamp = fmtDate(new Date().toISOString()).replace(/\//g, '-')
      a.href = url; a.download = `cong-no_${stamp}.xlsx`; a.click(); URL.revokeObjectURL(url)
      showNotification('success', 'Đã xuất file công nợ.')
      setExportOpen(false)
    } catch {
      showNotification('error', 'Lỗi xuất Excel')
    } finally { setExporting(false) }
  }

  // Kéo-thả đổi thứ tự dòng vật tư (chỉ cột "Chờ lên hóa đơn"). from/to = chỉ số trong modalDisplayRows.
  const moveVatTu = async (from: number, to: number) => {
    if (!activeCard || from === to) return
    const keys = modalDisplayRows.map(v => `${v.ma_hang}_${Number(v.don_gia) || 0}`)
    if (from < 0 || from >= keys.length || to < 0 || to >= keys.length) return
    const [moved] = keys.splice(from, 1)
    keys.splice(to, 0, moved)
    setSavingName(true)
    try {
      const res = await fetch('/api/admin/vat-tu-thu-tu', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_ids: activeCard.tickets.map(t => t.id), order: keys }),
      })
      if (res.ok) { load() }
      else { const e = await res.json(); showNotification('error', e.error || 'Lỗi đổi thứ tự') }
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setSavingName(false) }
  }

  // Kế toán TRẢ LẠI phiếu (Cột 2 -> Cột 1) kèm lý do -> tech_admin/staff sửa thông tin.
  const doReturn = async () => {
    if (!returnTarget) return
    const reason = returnTarget.reason.trim()
    if (!reason) { showNotification('error', 'Nhập lý do trả lại để tech_admin biết cần sửa gì.'); return }
    setReturning(true)
    try {
      const res = await fetch('/api/admin/kanban-hd', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: returnTarget.ids, trang_thai_hd: 'Chờ xuất HĐ', ly_do_tra: reason }),
      })
      if (res.ok) { showNotification('success', 'Đã trả phiếu về "Chờ lên hóa đơn" (kèm lý do).'); setReturnTarget(null); setActiveCard(null); load() }
      else { const e = await res.json(); showNotification('error', e.error || 'Lỗi trả phiếu') }
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setReturning(false) }
  }

  // Số đơn hàng (khóa gom M-invoice) cho 1 thẻ = số phiếu ĐẦU (nhiều phiếu vẫn 1 khóa chung).
  const soDonHangCard = (ts: Ticket[]) => ts[0]?.report || ts[0]?.id?.slice(0, 8) || ''

  // Xuất Excel ĐÚNG MẪU M-invoice (import qua "Tạo hóa đơn từ file excel"). invoices: mỗi phần tử = 1 HĐ.
  const exportMinvoice = async (invoices: { tickets: Ticket[]; soDonHang: string }[], filename: string) => {
    if (!kyHieuMinvoice.trim()) { showNotification('error', 'Chưa khai "Ký hiệu HĐ M-invoice" ở Hệ thống → Cấu hình.'); return }
    const valid = invoices.filter(inv => aggVatTu(inv.tickets.flatMap(t => t.soct_chi_tiet_vat_tu || [])).length > 0)
    if (valid.length === 0) { showNotification('error', 'Không có dòng hàng để xuất.'); return }
    try {
      const mod: any = await import('exceljs'); const ExcelJS = mod.default ?? mod
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Sheet1')
      ws.addRow(MINV_HEADERS); ws.getRow(1).font = { bold: true }
      // UTC-midnight để exceljs lưu ĐÚNG ngày lịch (local-midnight bị lùi 1 ngày khi ghi UTC).
      const d = new Date(); const ngayHD = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
      for (const inv of valid) for (const row of buildMinvoiceRows(inv.tickets, kyHieuMinvoice.trim().toUpperCase(), ngayHD, inv.soDonHang)) ws.addRow(row)
      ws.getColumn(3).numFmt = 'dd/mm/yyyy'
      const buf = await wb.xlsx.writeBuffer()
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
      // Đóng dấu "đã xuất M-invoice" cho mọi phiếu vừa xuất -> chống xuất trùng + nuôi banner đếm.
      const ids = Array.from(new Set(valid.flatMap(inv => inv.tickets.map(t => t.id))))
      try {
        const r = await fetch('/api/admin/minvoice-xuat', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket_ids: ids }) })
        if (!r.ok) { const e = await r.json(); showNotification('error', e.error || 'Đã tải file nhưng chưa đóng dấu được — kiểm tra lại.') }
      } catch { showNotification('error', 'Đã tải file nhưng chưa đóng dấu được (lỗi mạng).') }
      await load()
      showNotification('success', `Đã xuất ${valid.length} hóa đơn cho M-invoice.`)
    } catch { showNotification('error', 'Lỗi xuất Excel M-invoice') }
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
      // Cột: 1=Mã hàng, 2=Tên hàng, 3=SL, 4=ĐVT, 5=Đơn giá, 6=VAT, 7=Thành tiền.
      const items: { ma_hang: string; ten_hang: string; don_gia: any; don_vi_tinh: string; thu_tu: number }[] = []
      ws.eachRow({ includeEmpty: false }, (row: any, idx: number) => {
        if (idx === 1) return // bỏ dòng tiêu đề
        const vals = row.values as any[]
        const ma = String(cell(vals[1]) ?? '').trim()
        if (!ma) return
        // thu_tu = VỊ TRÍ DÒNG trong Excel -> nhập lại thì thứ tự hiển thị/đẩy Kanban đi theo Excel.
        items.push({ ma_hang: ma, ten_hang: String(cell(vals[2]) ?? ''), don_vi_tinh: String(cell(vals[4]) ?? '').trim(), don_gia: cell(vals[5]), thu_tu: items.length })
      })
      if (items.length === 0) { showNotification('error', 'File không có dòng hợp lệ.'); return }
      const res = await fetch('/api/admin/ten-hang-rieng', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        // scope_key -> lưu luôn tên/giá/ĐVT thành MẪU cho khách (kỳ sau tự áp).
        body: JSON.stringify({ pham_vi: 'hoa_don', ticket_ids: activeCard.tickets.map(t => t.id), items, scope_key: modalScopeKey }),
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
      // Phiếu Thuê/CPC = MỖI PHIẾU 1 THẺ RIÊNG (1 bảng kê = 1 hóa đơn) — không gộp chung khách/máy
      // để tránh lẫn với phiếu kỹ thuật cùng máy.
      const groupKey = t.nguon === 'thue_cpc' ? `tc:${t.id}` : (cumId ? `cum:${cumId}` : `may:${t.id_khach_hang}`)
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

  // SẮP XẾP THẺ: mọi cột "mới nhất lên đầu". Cột 1/2 theo NGÀY PHIẾU (đẩy mới nhất trên đầu);
  // cột 3/4 theo NGÀY XUẤT HĐ (mới lên HĐ / mới thanh toán trên đầu). Lấy ngày lớn nhất trong thẻ.
  const cardNgay = (c: any) => (c.tickets || []).reduce((m: string, t: any) => (String(t.ngay || '') > m ? String(t.ngay || '') : m), '')
  const cardXuat = (c: any) => (c.tickets || []).reduce((m: string, t: any) => { const d = String(t.ngay_xuat_hd || t.ngay || ''); return d > m ? d : m }, '')

  const cardsCol1 = getColumnCards(col1Tickets, 'Chờ xuất HĐ').sort((a, b) => cardNgay(b).localeCompare(cardNgay(a)))
  const cardsCol2 = getColumnCards(col2Tickets, 'Đang xử lý HĐ').sort((a, b) => cardNgay(b).localeCompare(cardNgay(a)))
  // M-invoice: thẻ CHƯA xuất (nút hàng loạt chỉ đụng các thẻ này) & số thẻ đã xuất nhưng CHƯA có số HĐ.
  const cardsCol2ChuaXuat = cardsCol2.filter((c: any) => !cardMinvoiceExported(c.tickets))
  const col2PendingCount = cardsCol2.filter((c: any) => cardMinvoicePending(c.tickets)).length

  // Cột 3 & Cột 4: GOM THEO SỐ HÓA ĐƠN (1 thẻ = 1 hóa đơn = đơn vị thu tiền). Thẻ liệt kê
  // các số phiếu bên trong -> kế toán thu theo HĐ, tech_admin vẫn thấy từng số phiếu.
  const groupByHd = (list: Ticket[], state: string) => {
    const m = new Map<string, any>()
    for (const t of list) {
      const key = t.so_hoa_don || `noHD:${t.id}`
      if (!m.has(key)) m.set(key, { id: `hd:${key}`, customer: t.soct_khach_hang, tickets: [], trang_thai_hd: state })
      m.get(key).tickets.push(t)
    }
    return [...m.values()]
  }
  const cardsCol3 = groupByHd(col3Tickets, 'Đã lên hóa đơn').sort((a, b) => cardXuat(b).localeCompare(cardXuat(a)))
  const cardsCol4 = groupByHd(col4Tickets, 'Đã thanh toán').sort((a, b) => cardXuat(b).localeCompare(cardXuat(a)))

  // Thông tin thu của 1 thẻ Cột 3: tổng HĐ, đã thu, còn nợ, tuổi, trạng thái thu.
  const cardTong = (c: any) => Math.round(getVatTuStats(c.tickets.flatMap((t: any) => t.soct_chi_tiet_vat_tu || [])).sauVat) + cardLamTron(c.tickets)
  const cardPay = (c: any) => {
    const tong = cardTong(c); const daThu = Number(c.tickets[0].so_tien_da_thu) || 0
    const con = tong - daThu
    const pay = daThu <= 0 ? 'chua' : daThu > tong ? 'du' : daThu < tong ? 'phan' : 'du_dung'
    return { tong, daThu, con, pay, days: daysSince(c.tickets[0].ngay_xuat_hd) }
  }
  // Cột 3 sau bộ lọc trạng thái thu + tuổi nợ (kthc/admin). Banner giữ nguyên tổng (toàn cột).
  const cardsCol3Shown = cardsCol3.filter((c: any) => {
    const info = cardPay(c)
    if (col3Pay !== 'all' && info.pay !== col3Pay) return false
    if (col3Age !== 'all') {
      if (info.con <= 0 || info.days == null) return false
      if (col3Age === 'd30' && !(info.days > 30)) return false
      if (col3Age === 'd15' && !(info.days >= 15 && info.days <= 30)) return false
      if (col3Age === 'd0' && !(info.days < 15)) return false
    }
    return true
  })

  // IMPORT THANH TOÁN (FAST): đọc "Sổ chi tiết TK 112" — cột "Diễn giải" = số HĐ, "Phát sinh nợ" =
  // tiền khách trả. Gộp tiền theo số HĐ -> ĐẶT số đã thu (ghi đè). THU = TỔNG HĐ (khớp chính xác) ->
  // tự chuyển Cột 4; các trường hợp khác giữ Cột 3 để đối soát. Khoản gộp "Thu tiền hàng" (F là chữ)
  // -> gộp theo khách để hỗ trợ đối chiếu tay. Chỉ kthc/admin.
  const importThanhToanFast = async (file: File) => {
    setPayImporting(true)
    try {
      const mod: any = await import('exceljs'); const ExcelJS = mod.default ?? mod
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer())
      const ws = wb.worksheets[0]
      const cell = (v: any) => { let x = v; if (x && typeof x === 'object' && 'result' in x) x = x.result; if (x && typeof x === 'object' && 'text' in x) x = x.text; if (x && typeof x === 'object' && 'richText' in x) x = x.richText.map((r: any) => r.text).join(''); return x }
      const norm2 = (s: any) => String(s ?? '').replace(/\s+/g, ' ').trim()
      // Tìm dòng tiêu đề + vị trí cột (theo tên; fallback F=6 diễn giải, H=8 phát sinh nợ).
      let headRow = -1, colF = 6, colH = 8, colKhach = 5, colNgay = 1
      for (let r = 1; r <= Math.min(ws.rowCount, 15); r++) {
        const row = ws.getRow(r); let hit = false
        for (let c = 1; c <= Math.min(ws.columnCount, 20); c++) {
          const t = norm2(cell(row.getCell(c).value))
          if (t === 'Diễn giải') { colF = c; hit = true }
          else if (t === 'Phát sinh nợ') colH = c
          else if (t === 'Tên khách hàng') colKhach = c
          else if (t === 'Ngày ct') colNgay = c
        }
        if (hit) { headRow = r; break }
      }
      if (headRow < 0) { showNotification('error', 'Không nhận diện được file FAST (thiếu cột "Diễn giải" / "Phát sinh nợ").'); return }

      // Chuẩn hóa tên khách: bỏ dấu + bỏ từ pháp lý (Công ty/CP/TNHH/…) để khớp FAST ⇄ app.
      const custKey = (s: any) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()
        .replace(/cong ty|co phan|trach nhiem huu han|tnhh|mot thanh vien|mtv/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
      const custMatch = (a: string, b: string) => !!a && !!b && (a === b || a.includes(b) || b.includes(a))

      // Thu theo (số HĐ) KÈM KHÁCH — số HĐ ở FAST là chứng từ nội bộ, TRÙNG giữa các khách, nên PHẢI
      // khớp đúng khách để không gán nhầm tiền của khách khác. Khoản "Thu tiền hàng" (F chữ) -> gộp theo khách.
      const pays: { hd: string; kkey: string; h: number }[] = []
      const lumpByKhach = new Map<string, number>()
      for (let r = headRow + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r)
        const h = Number(cell(row.getCell(colH).value)) || 0
        if (h <= 0) continue // chỉ lấy tiền THU VÀO (phát sinh nợ TK 112)
        const f = norm2(cell(row.getCell(colF).value))
        const khach = norm2(cell(row.getCell(colKhach).value))
        if (/^\d{1,7}$/.test(f)) pays.push({ hd: f, kkey: custKey(khach), h })
        else if (khach) lumpByKhach.set(khach, (lumpByKhach.get(khach) || 0) + h)
      }

      // Bản đồ số HĐ -> thẻ Cột 3.
      const col3ByHd = new Map<string, any>()
      for (const c of cardsCol3) { const hd = String(c.tickets[0].so_hoa_don || '').trim(); if (hd) col3ByHd.set(hd, c) }

      const moved: { hd: string; tien: number }[] = []          // thu = tổng -> chuyển Cột 4
      const partial: { hd: string; daThu: number; tong: number }[] = [] // ghi nhận, ở lại Cột 3
      const over: { hd: string; daThu: number; tong: number }[] = []    // thu dư -> ở lại đối soát
      const failed: { hd: string; reason: string }[] = []
      const applied = new Set<any>()
      // CHỈ duyệt theo HĐ đang ở Cột 3; chỉ nhận khoản thu KHỚP CẢ số HĐ + đúng khách.
      for (const [hd, card] of col3ByHd) {
        const ck = custKey(card.customer?.soct_khach_cum?.ten_khach_hang || card.customer?.ten_khach_hang || '')
        const matched = pays.filter(p => p.hd === hd && custMatch(p.kkey, ck))
        if (matched.length === 0) continue // FAST không có khoản thu cho HĐ này của đúng khách -> chưa thanh toán
        matched.forEach(p => applied.add(p))
        const sum = matched.reduce((s, p) => s + p.h, 0)
        const tong = cardTong(card)
        const exact = sum === tong
        try {
          const res = await fetch('/api/admin/hd-thu', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ so_hoa_don: hd, set_to: sum, chuyen: exact }),
          })
          if (!res.ok) { const e = await res.json(); failed.push({ hd, reason: e.error || 'Lỗi ghi nhận' }); continue }
          if (exact) moved.push({ hd, tien: sum })
          else if (sum > tong) over.push({ hd, daThu: sum, tong })
          else partial.push({ hd, daThu: sum, tong })
        } catch { failed.push({ hd, reason: 'Lỗi kết nối' }) }
      }
      // Số khoản thu (theo số HĐ) trong file KHÔNG đối ứng được vào Cột 3 -> chỉ đếm.
      const khacCount = pays.filter(p => !applied.has(p)).length

      // Khoản gộp theo khách — CHỈ hiện khách CÓ HĐ đang ở Cột 3 (khớp tên chuẩn hóa) để hỗ trợ tay.
      const lumps = [...lumpByKhach.entries()].map(([khach, tien]) => {
        const kk = custKey(khach)
        const hds = cardsCol3
          .filter((c: any) => custMatch(custKey(c.customer?.soct_khach_cum?.ten_khach_hang || c.customer?.ten_khach_hang || ''), kk))
          .map((c: any) => ({ hd: c.tickets[0].so_hoa_don, con: cardPay(c).con }))
        return { khach, tien, hds }
      }).filter(l => l.hds.length > 0).sort((a, b) => b.tien - a.tien)

      await load()
      setPayResult({ moved, partial, over, khacCount, failed, lumps })
    } catch (e: any) { showNotification('error', 'Lỗi đọc file FAST: ' + (e?.message || '')) }
    finally { setPayImporting(false) }
  }

  // IMPORT BÁO CÁO M-INVOICE: đọc file "Báo cáo tổng hợp doanh thu hóa đơn", TỰ ĐỘNG điền Số HĐ +
  // chuyển thẻ từ cột "KT-HC lên hóa đơn" (Đang xử lý HĐ) sang "Chờ thanh toán" (Đã lên hóa đơn).
  // AN TOÀN: chỉ áp dòng KHỚP CHẮC CHẮN (Số đơn hàng = report thẻ) VÀ khớp tổng tiền (±1.000đ do làm
  // tròn). Dòng thiếu Số đơn hàng / không thấy thẻ / lệch tiền / HĐ âm (điều chỉnh) -> liệt kê làm tay.
  const importMinvoiceReport = async (file: File) => {
    setImportingReport(true)
    try {
      const mod: any = await import('exceljs'); const ExcelJS = mod.default ?? mod
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer())
      const ws = wb.worksheets[0]
      const cell = (v: any) => { let x = v; if (x && typeof x === 'object' && 'result' in x) x = x.result; if (x && typeof x === 'object' && 'text' in x) x = x.text; return x }
      const norm2 = (s: any) => String(s ?? '').replace(/\s+/g, ' ').trim()
      // Tìm dòng tiêu đề (ô = 'Số HĐ') + vị trí các cột cần dùng.
      let headRow = -1, colHD = -1, colDH = -1, colTong = -1, colNgay = -1, colTen = -1
      for (let r = 1; r <= Math.min(ws.rowCount, 15); r++) {
        const row = ws.getRow(r)
        for (let c = 1; c <= ws.columnCount; c++) {
          const t = norm2(cell(row.getCell(c).value))
          if (t === 'Số HĐ') { headRow = r; colHD = c }
          if (headRow === r) {
            if (t === 'Số đơn hàng') colDH = c
            else if (t === 'Tổng tiền sau thuế') colTong = c
            else if (t === 'Ngày hóa đơn') colNgay = c
            else if (t === 'Tên đơn vị bên mua') colTen = c
          }
        }
        if (headRow === r) break
      }
      if (headRow < 0 || colHD < 0 || colDH < 0 || colTong < 0) {
        showNotification('error', 'Không nhận diện được file báo cáo M-invoice (thiếu cột Số HĐ / Số đơn hàng / Tổng tiền sau thuế).')
        return
      }
      // Đọc dòng dữ liệu.
      const dataRows: { soHD: string; soDH: string; tong: number; ngay: string; ten: string }[] = []
      for (let r = headRow + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r)
        const soHDraw = cell(row.getCell(colHD).value)
        const soHD = soHDraw == null ? '' : String(soHDraw).trim()
        if (!soHD) continue // dòng trống / tổng cộng
        const soDH = norm2(cell(row.getCell(colDH).value))
        const tong = Number(cell(row.getCell(colTong).value)) || 0
        const ten = colTen > 0 ? norm2(cell(row.getCell(colTen).value)) : ''
        const ngayRaw = colNgay > 0 ? cell(row.getCell(colNgay).value) : null
        let ngay = ''
        if (ngayRaw instanceof Date) ngay = new Date(ngayRaw.getTime()).toISOString().slice(0, 10)
        else if (typeof ngayRaw === 'string' && ngayRaw) ngay = ngayRaw.slice(0, 10)
        dataRows.push({ soHD, soDH, tong, ngay, ten })
      }
      if (dataRows.length === 0) { showNotification('error', 'File không có dòng hóa đơn nào.'); return }

      // Khớp từng dòng với thẻ ở cột 2.
      const matched: { card: any; soHD: string; ngay: string }[] = []
      const skipped: { soHD: string; ten: string; reason: string }[] = []
      const usedCards = new Set<string>()
      for (const row of dataRows) {
        if (row.tong <= 0) { skipped.push({ soHD: row.soHD, ten: row.ten, reason: 'HĐ điều chỉnh/hủy (tổng ≤ 0) — bỏ qua' }); continue }
        if (!row.soDH) { skipped.push({ soHD: row.soHD, ten: row.ten, reason: 'Thiếu "Số đơn hàng" — HĐ nhập tay, không khớp tự động' }); continue }
        const card = cardsCol2.find((c: any) => !usedCards.has(c.id) && c.tickets.some((t: any) => String(t.report || '').trim() === row.soDH))
        if (!card) { skipped.push({ soHD: row.soHD, ten: row.ten, reason: `Không thấy thẻ "KT-HC lên hóa đơn" cho đơn hàng ${row.soDH} (có thể đã xử lý)` }); continue }
        // Tổng KỲ VỌNG tính GIỐNG hệt lúc xuất M-invoice (làm tròn từng dòng qua aggVatTu) -> khớp
        // đúng số M-invoice tự cộng. Nếu kthc có thêm làm tròn tổng thì lệch ≤ 1.000đ.
        const cardTong = aggVatTu(card.tickets.flatMap((t: any) => t.soct_chi_tiet_vat_tu || [])).reduce((s: number, it: any) => {
          const tt = Math.round((Number(it.so_luong) || 0) * (Number(it.don_gia) || 0))
          const th = Math.round((Number(it.so_luong) || 0) * (Number(it.don_gia) || 0) * (Number(it.vat) || 0) / 100)
          return s + tt + th
        }, 0)
        const diff = Math.abs(cardTong - row.tong)
        if (diff > 1000) { skipped.push({ soHD: row.soHD, ten: row.ten, reason: `Lệch tổng tiền: thẻ ${fmtVnd(cardTong)}đ ≠ HĐ ${fmtVnd(row.tong)}đ` }); continue }
        usedCards.add(card.id)
        matched.push({ card, soHD: row.soHD, ngay: row.ngay })
      }

      // Áp các thẻ khớp: điền số HĐ + chuyển sang "Chờ thanh toán".
      let ok = 0
      const failed: { soHD: string; reason: string }[] = []
      for (const m of matched) {
        try {
          const res = await fetch('/api/admin/kanban-hd', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: m.card.tickets.map((t: any) => t.id), trang_thai_hd: 'Đã lên hóa đơn', so_hoa_don: m.soHD, ...(m.ngay ? { ngay_xuat_hd: m.ngay } : {}) }),
          })
          if (res.ok) ok++
          else { const e = await res.json(); failed.push({ soHD: m.soHD, reason: e.error || 'Lỗi cập nhật' }) }
        } catch { failed.push({ soHD: m.soHD, reason: 'Lỗi kết nối' }) }
      }
      await load()
      setImportResult({ ok, total: dataRows.length, skipped, failed })
    } catch (e: any) { showNotification('error', 'Lỗi đọc file báo cáo: ' + (e?.message || '')) }
    finally { setImportingReport(false) }
  }

  // Tổng nợ đọng cột 3 (Chờ thanh toán) theo TUỔI NỢ (ngay_xuat_hd) — 3 mức khớp màu badge thẻ:
  // <15 ngày (trong hạn) · 15–30 ngày (chớm quá hạn) · >30 ngày (quá hạn). Chỉ tính HĐ còn nợ
  // (đã thu < tổng). 1 thẻ = 1 hóa đơn. Banner đầu cột cho MỌI role cùng theo dõi.
  const col3Debt = (() => {
    const b = { n0: 0, t0: 0, n1: 0, t1: 0, n2: 0, t2: 0, nAll: 0, tAll: 0 }
    for (const c of cardsCol3) {
      const { sauVat } = getVatTuStats(c.tickets.flatMap((t: any) => t.soct_chi_tiet_vat_tu || []))
      const tong = Math.round(sauVat) + cardLamTron(c.tickets)
      const con = Math.max(0, tong - (Number(c.tickets[0].so_tien_da_thu) || 0))
      if (con <= 0) continue // đã thu đủ (chưa kịp sang cột 4) -> không phải nợ đọng
      const d = daysSince(c.tickets[0].ngay_xuat_hd)
      b.nAll++; b.tAll += con
      if (d != null && d > 30) { b.n2++; b.t2 += con }
      else if (d != null && d >= 15) { b.n1++; b.t1 += con }
      else { b.n0++; b.t0 += con }
    }
    return b
  })()

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
            const tong = Math.round(sauVat) + cardLamTron(card.tickets) // tổng sau thuế đã cộng làm tròn
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
                  const tenKh = card.tickets[0]?.ten_khach_hd || (cum ? (cum.ten_khach_hang || '') : (card.customer?.ten_khach_hang || 'Khách hàng lẻ'))
                  const mst = cum ? cum.ma_so_thue : card.customer?.ma_so_thue

                  return (
                    <div className="pl-1.5 space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <div className="font-bold text-slate-800 text-xs leading-snug line-clamp-2">
                          {tenKh}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                        {/* Xuất riêng THẺ NÀY ra M-invoice (1 chạm) — chỉ kế toán, chỉ cột KT-HC lên hóa đơn.
                            Thẻ đã xuất -> nút chuyển "Xuất lại" (cam) + XÁC NHẬN, vì xuất lại = có thể tạo HĐ trùng. */}
                        {state === 'Đang xử lý HĐ' && isKeToan && (() => {
                          const daXuat = cardMinvoiceExported(card.tickets)
                          const doExport = () => exportMinvoice([{ tickets: card.tickets, soDonHang: soDonHangCard(card.tickets) }], `minvoice-${soDonHangCard(card.tickets)}.xlsx`)
                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (daXuat) {
                                  setConfirmDialog({
                                    title: 'Xuất lại M-invoice thẻ này?',
                                    message: 'Thẻ này ĐÃ xuất M-invoice. Chỉ xuất lại khi đã đối chiếu MISA và chắc chắn hóa đơn CHƯA được tạo (VD lỡ quên import). Nếu MISA đã có hóa đơn, hãy nhập số HĐ thay vì xuất lại (xuất lại có thể gây hóa đơn đúp).',
                                    onConfirm: doExport,
                                  })
                                } else doExport()
                              }}
                              title={daXuat ? 'Thẻ đã xuất — bấm để XUẤT LẠI (có xác nhận)' : 'Xuất riêng thẻ này ra file M-invoice'}
                              className={`p-1 rounded transition border ${daXuat ? 'text-amber-600 hover:text-amber-800 hover:bg-amber-50 border-amber-300' : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50 border-blue-200'}`}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          )
                        })()}
                        {(state === 'Chờ xuất HĐ' || role === 'admin') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              const laThueCpc = card.tickets.every((t: any) => t.nguon === 'thue_cpc')
                              setConfirmDialog({
                                title: laThueCpc ? "Gỡ phiếu Thuê/CPC" : "Thu hồi phiếu",
                                message: laThueCpc
                                  ? "Phiếu Thuê/CPC không có Công nợ. Thu hồi = GỠ phiếu này khỏi Kanban (bảng kê sẽ đẩy lại được). Tiếp tục?"
                                  : "Bạn có chắc chắn muốn thu hồi (các) phiếu này quay lại Công nợ không?",
                                onConfirm: async () => {
                                  try {
                                    const targetIds = card.tickets.map((t: any) => t.id)
                                    const res = await fetch('/api/admin/kanban-hd', {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ ids: targetIds, trang_thai_hd: 'Chưa hóa đơn' })
                                    })
                                    if (res.ok) {
                                      showNotification('success', laThueCpc ? 'Đã gỡ phiếu Thuê/CPC khỏi Kanban.' : 'Đã thu hồi phiếu quay lại Công nợ.')
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
                      </div>

                      {mst && (
                        <div className="text-[10px] text-slate-400 font-mono">
                          MST: {mst}
                        </div>
                      )}
                      {/* Kế toán TRẢ LẠI: hiện lý do cần sửa (ở Cột 1) */}
                      {state === 'Chờ xuất HĐ' && card.tickets.find((t: any) => t.ly_do_tra)?.ly_do_tra && (
                        <div className="text-[10px] bg-rose-50 border border-rose-200 text-rose-700 rounded px-1.5 py-1 leading-snug">
                          <b>KT trả lại:</b> {card.tickets.find((t: any) => t.ly_do_tra)?.ly_do_tra}
                        </div>
                      )}
                      {/* Badge Miễn phí (MF) — kế toán nhận biết phiếu 0đ máy thuê/CPC. Kèm cảnh báo
                          nếu đánh dấu MF nhưng vẫn có tiền (dễ là quên bỏ giá / đánh dấu nhầm). */}
                      {(() => {
                        const allMF = card.tickets.every((t: any) => t.mien_phi)
                        const someMF = card.tickets.some((t: any) => t.mien_phi)
                        if (!someMF) return null
                        const loai = String(card.customer?.loai_hd || '').trim()
                        const loaiLbl = loai === 'Máy thuê' ? ' · Thuê' : loai === 'Máy CPC' ? ' · CPC' : ''
                        return (
                          <div className="flex flex-wrap gap-1">
                            {allMF
                              ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">MF{loaiLbl}</span>
                              : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">MF một phần</span>}
                            {allMF && tong > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200" title="Đánh dấu MF nhưng vẫn có tiền — kiểm tra lại">⚠ có tiền</span>}
                          </div>
                        )
                      })()}
                      {/* Badge M-invoice: thẻ ĐÃ xuất mà CHƯA có số HĐ -> nhắc kthc đối chiếu MISA (chống quên/đúp). */}
                      {state === 'Đang xử lý HĐ' && cardMinvoicePending(card.tickets) && (() => {
                        const t = card.tickets.find((x: any) => x.minvoice_luc)
                        const d = new Date(new Date(t.minvoice_luc).getTime() + 7 * 3600 * 1000)
                        const label = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
                        const lan = Math.max(0, ...card.tickets.map((x: any) => Number(x.minvoice_lan) || 0))
                        return (
                          <div className="text-[10px] bg-amber-50 border border-amber-300 text-amber-800 rounded px-1.5 py-1 leading-snug" title="Đã xuất file M-invoice, chờ nhập số HĐ. Đối chiếu MISA rồi nhập số HĐ để chốt.">
                            ⚠ Đã xuất M-inv {label}{lan > 1 ? ` (${lan}×)` : ''} — <b>chưa có số HĐ</b>
                          </div>
                        )
                      })()}
                    </div>
                  )
                })()}

                  <div className="flex justify-between items-start gap-2 text-[10px] text-slate-500">
                    <span className="bg-slate-100 px-2 py-0.5 rounded font-medium leading-relaxed">
                      {count > 1 ? `${count} phiếu: ${card.tickets.map((t: any) => t.report || '—').join(', ')}` : `Phiếu: ${card.tickets[0].report || '—'}`}
                    </span>
                    <span className="font-mono text-slate-400 shrink-0">
                      {count === 1 ? fmtDate(card.tickets[0].ngay) : ''}
                    </span>
                  </div>

                  <div className="pt-1.5 border-t border-dashed border-slate-100 flex justify-between items-end">
                    <div className="text-[10px] text-slate-400">Thành tiền:</div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-800">{fmtVnd(tong)} đ</div>
                      <div className="text-[9px] text-slate-400 font-mono">Trước VAT: {fmtVnd(truocVat)}</div>
                    </div>
                  </div>

                  {(state === 'Đã lên hóa đơn' || state === 'Đã thanh toán') && card.tickets[0].so_hoa_don && (
                    <div className="mt-2 space-y-1">
                      <div className={`border rounded px-2 py-1 text-[10px] font-semibold flex items-center gap-1 ${state === 'Đã thanh toán' ? 'bg-indigo-50 text-indigo-800 border-indigo-100' : 'bg-emerald-50 text-emerald-800 border-emerald-100'}`}>
                        <CheckCircle className="w-3.5 h-3.5" /> HĐ: {card.tickets[0].so_hoa_don}
                      </div>
                      {/* Xuất Đề nghị thanh toán (.docx) cho hóa đơn này + badge đã xuất */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={(e) => { e.stopPropagation(); exportDntt(card.tickets[0].so_hoa_don) }}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded border border-blue-200 text-blue-700 hover:bg-blue-50 inline-flex items-center gap-1"
                          title="Xuất Đề nghị thanh toán (.docx)"
                        >
                          <FileText className="w-3 h-3" /> Xuất ĐNTT
                        </button>
                        {(() => {
                          // Badge = NGÀY xuất gần nhất (dntt_luc, giờ VN) + SỐ LẦN xuất trong ngoặc. VD "đã xuất 24-8 (2)".
                          const t = card.tickets.find((x: any) => x.dntt_luc)
                          if (!t) return null
                          const d = new Date(new Date(t.dntt_luc).getTime() + 7 * 3600 * 1000)
                          const label = `${d.getUTCDate()}-${d.getUTCMonth() + 1}`
                          const lan = Math.max(0, ...card.tickets.map((x: any) => Number(x.dntt_lan) || 0))
                          const soDntt = card.tickets.find((x: any) => x.so_dntt)?.so_dntt || ''
                          return (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200" title={`ĐNTT số ${soDntt} · đã xuất ${lan} lần · lần gần nhất ${label}`}>
                              ✓ đã xuất {label}{lan > 0 ? ` (${lan})` : ''}
                            </span>
                          )
                        })()}
                      </div>
                      {(card.tickets[0].nguoi_xuat?.full_name || card.tickets[0].ngay_xuat_hd) && (
                        <div className="text-[9px] text-slate-400">
                          {[card.tickets[0].nguoi_xuat?.full_name ? `KT: ${card.tickets[0].nguoi_xuat.full_name}` : '', card.tickets[0].ngay_xuat_hd ? fmtDate(card.tickets[0].ngay_xuat_hd) : ''].filter(Boolean).join(' · ')}
                        </div>
                      )}
                      {state === 'Đã lên hóa đơn' && (() => {
                        const daThu = Number(card.tickets[0].so_tien_da_thu) || 0
                        const con = Math.max(0, tong - daThu)
                        return <div className="flex flex-wrap items-center gap-1.5">
                          {daThu > 0 && (
                            <span className="inline-block border rounded-full px-2 py-0.5 text-[9px] font-semibold bg-blue-50 text-blue-700 border-blue-200">
                              Đã thu {fmtVnd(daThu)}{con > 0 ? ` · còn ${fmtVnd(con)}` : daThu > tong ? ` · dư ${fmtVnd(daThu - tong)}` : ' · đủ'}
                            </span>
                          )}
                          {(() => {
                            const d = daysSince(card.tickets[0].ngay_xuat_hd)
                            if (d == null) return null
                            const cls = d > 30 ? 'bg-red-50 text-red-700 border-red-200' : d > 15 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-200'
                            return <span className={`inline-block border rounded-full px-2 py-0.5 text-[9px] font-semibold ${cls}`}>Chờ thu {d} ngày</span>
                          })()}
                        </div>
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
  // Tổng đã cộng khoản làm tròn; VAT = tổng − trước thuế để 3 số luôn khớp nhau.
  const modalLamTron = activeCard ? cardLamTron(activeCard.tickets) : 0
  const modalTruoc = Math.round(modalStats.truocVat)
  const modalTong = Math.round(modalStats.sauVat) + modalLamTron
  const modalVat = modalTong - modalTruoc
  const modalKh = activeCard?.tickets[0]?.soct_khach_hang

  // Giải quyết thông tin Khách hàng Cụm nếu có, nếu không lấy của khách lẻ
  const modalCum = modalKh?.soct_khach_cum
  const modalTenKh = activeCard?.tickets[0]?.ten_khach_hd || (modalCum ? (modalCum.ten_khach_hang || '') : (modalKh?.ten_khach_hang || 'Khách hàng lẻ'))
  const modalMst = modalCum ? modalCum.ma_so_thue : modalKh?.ma_so_thue
  const modalEmail = modalCum ? modalCum.email_ke_toan : modalKh?.email_ke_toan
  const modalDiaChi = modalCum ? modalCum.dia_chi : modalKh?.dia_chi

  // Gộp các dòng vật tư trùng mã hàng để hóa đơn in gọn gàng
  const aggregatedVatTu: Record<string, { ma_hang: string; ten_hang: string; so_luong: number; don_gia: number; vat: number; dvt: string; ghepMa: boolean; _ord: number }> = {}
  modalAllVt.filter(v => !v.da_tra).forEach(v => {
    const k = `${v.ma_hang}_${Number(v.don_gia) || 0}`
    if (!aggregatedVatTu[k]) {
      aggregatedVatTu[k] = {
        ma_hang: v.ma_hang,
        ten_hang: v.ten_hd || v.soct_kho_hang?.ten_hang || v.ma_hang,
        so_luong: 0,
        don_gia: v.don_gia,
        vat: v.vat,
        dvt: (v.don_vi_tinh || '').trim(), // ĐVT (rỗng -> hiển thị "Cái")
        // Tự ghép mã CHỈ khi dùng tên kho gốc (chưa đặt tên riêng); tên tự đặt/áp mẫu -> giữ nguyên.
        ghepMa: !!v.soct_kho_hang && !(v.ten_hang_hd && String(v.ten_hang_hd).trim()),
        _ord: Number.POSITIVE_INFINITY
      }
    }
    aggregatedVatTu[k].so_luong += v.so_luong
    if (!aggregatedVatTu[k].dvt && (v.don_vi_tinh || '').trim()) aggregatedVatTu[k].dvt = (v.don_vi_tinh || '').trim()
    aggregatedVatTu[k]._ord = Math.min(aggregatedVatTu[k]._ord, Number(v.thu_tu ?? 1e9))
  })
  // Sắp theo thu_tu (kéo-thả). Dòng cùng thứ tự (chưa sắp) giữ nguyên tương đối.
  const modalDisplayRows = Object.values(aggregatedVatTu).sort((a, b) => a._ord - b._ord)
  // Chỉ được sửa tên/đơn giá/nhập Excel khi phiếu CÒN Ở "Chờ xuất HĐ" (chưa đưa sang kế toán).
  // Đã chuyển sang kế toán để lên hóa đơn -> mọi role chỉ COPY, không sửa (khóa để đúng số liệu HĐ).
  // Cần sửa thì admin kéo thẻ về cột "Chờ lên hóa đơn" trước.
  const canEditItems = activeCard?.tickets[0]?.trang_thai_hd === 'Chờ xuất HĐ'
  // Chỉ kế toán (admin/kthc) mới nhập số HĐ + hoàn tất xuất hóa đơn. tech_admin/staff chỉ bàn giao.
  const isKeToan = role === 'admin' || role === 'kthc'

  return (
    <div className="space-y-4">
      {/* Header điều phối */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        {/* Tiêu đề */}
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" /> Bảng điều phối hóa đơn (Kanban)
          </h2>
          <p className="text-xs text-slate-400">Tech_admin giao việc {`->`} Kế toán xuất hóa đơn trên MISA/Fast/SAPP và dán Số hóa đơn để hoàn tất.</p>
        </div>

        {/* Hàng 1: LỌC (trái) · HÀNH ĐỘNG (phải) */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm khách / số phiếu / số HĐ..." className="pl-8 h-9 w-64 bg-white text-sm" />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              Kỳ đối chiếu:
              <MonthField value={thang} onChange={setThang} className="h-8 px-2 text-xs w-36" />
              <span className="inline-flex" title="Kỳ đối chiếu áp cho cột 'Đã thanh toán'. Tick 'chỉ kỳ này' bên dưới để áp thêm cột 'Chờ thanh toán'. Cột 1, 2 luôn hiện toàn bộ.">
                <Info className="w-3.5 h-3.5 text-slate-400 cursor-help shrink-0" aria-label="Trợ giúp" />
              </span>
            </label>
            {/* Ký hiệu HĐ M-invoice — CHỈ kế toán (admin/kthc) thấy + tự sửa (không phụ thuộc admin Cấu hình). */}
            {isKeToan && (
              <div className="flex items-center gap-1.5 text-xs text-slate-600" title="Ký hiệu mẫu số hóa đơn (TT78) dùng khi Xuất Excel M-invoice. Kế toán tự khai/đổi.">
                <span className="font-medium">Ký hiệu HĐ:</span>
                <Input value={kyHieuEdit} onChange={e => setKyHieuEdit(e.target.value.toUpperCase())} placeholder="1C26TST" className="h-8 w-28 bg-white text-xs font-mono uppercase" />
                <Button size="sm" variant="outline" onClick={saveKyHieu} disabled={savingKyHieu || kyHieuEdit.trim() === kyHieuMinvoice.trim()} title="Lưu ký hiệu HĐ" className="h-8 w-8 p-0">{savingKyHieu ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}</Button>
              </div>
            )}
          </div>

          {/* Hành động dồn phải, cạnh nhau */}
          <div className="flex items-center gap-2">
            <Button onClick={load} disabled={loading} size="sm" variant="outline" title="Tải lại" className="h-9 w-9 p-0 bg-white">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={() => setExportOpen(true)} size="sm" variant="outline" title="Xuất Excel công nợ" className="h-9 w-9 p-0 bg-white">
              <Download className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Hàng 2: TÙY CHỌN hiển thị (chữ nhỏ, xám) */}
        <div className="flex items-center gap-5 flex-wrap pt-2.5 border-t border-slate-100">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer select-none" title="Bật: cột Chờ thanh toán chỉ hiện HĐ trong kỳ đang chọn. Tắt: lũy kế toàn bộ nợ chưa thu.">
            <input type="checkbox" checked={col3ChiKyNay} onChange={e => setCol3ChiKyNay(e.target.checked)} className="w-3.5 h-3.5 accent-blue-600" />
            Chờ thanh toán: chỉ kỳ này
          </label>
          {role !== 'kthc' && (
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer select-none">
              <input type="checkbox" checked={grouped} onChange={e => setGrouped(e.target.checked)} className="w-3.5 h-3.5 accent-blue-600" />
              Tự động gom nhóm theo khách hàng
            </label>
          )}
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
            <div className="p-3 bg-amber-50/50 rounded-t-xl flex flex-col items-stretch gap-2">
              <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> {role === 'kthc' ? '1.' : '2.'} KT-HC lên hóa đơn ({cardsCol2.length})
              </h3>
              {isKeToan && (
                <div className="flex gap-2 flex-wrap">
                <button
                  disabled={cardsCol2ChuaXuat.length === 0}
                  onClick={() => {
                    const runExport = () => {
                      const d = new Date(); const stamp = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`
                      return exportMinvoice(cardsCol2ChuaXuat.map((c: any) => ({ tickets: c.tickets, soDonHang: soDonHangCard(c.tickets) })), `minvoice-cot2-${stamp}.xlsx`)
                    }
                    // Còn phiếu đã xuất mà CHƯA có số HĐ -> nhắc đối chiếu MISA trước khi tạo lô mới (chống đúp).
                    if (col2PendingCount > 0) {
                      setConfirmDialog({
                        title: 'Còn phiếu chưa chốt số HĐ',
                        message: `Đang có ${col2PendingCount} phiếu ĐÃ xuất M-invoice lần trước nhưng CHƯA nhập số HĐ. Bạn đã đối chiếu (đã lên trên MISA) chưa?\n\nBấm Đồng ý để chỉ xuất ${cardsCol2ChuaXuat.length} phiếu MỚI (chưa xuất). Các phiếu đã xuất sẽ KHÔNG xuất lại (tránh hóa đơn đúp).`,
                        onConfirm: runExport,
                      })
                    } else runExport()
                  }}
                  title={cardsCol2ChuaXuat.length === 0 ? 'Mọi thẻ trong cột đã xuất M-invoice' : `Xuất ${cardsCol2ChuaXuat.length} thẻ CHƯA xuất thành 1 file M-invoice`}
                  className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  <Download className="w-3 h-3" /> M-invoice{cardsCol2ChuaXuat.length > 0 ? ` (${cardsCol2ChuaXuat.length} chưa xuất)` : ''}
                </button>
                <label title={cardsCol2.length === 0 ? 'Cột trống — không có thẻ nào để đối chiếu' : "Nhập file 'Báo cáo tổng hợp doanh thu hóa đơn' từ M-invoice → tự điền số HĐ + chuyển thẻ khớp sang Chờ thanh toán"}
                  className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 cursor-pointer ${importingReport || cardsCol2.length === 0 ? 'opacity-40 pointer-events-none' : ''}`}>
                  <Upload className="w-3 h-3" /> {importingReport ? 'Đang khớp…' : 'Import báo cáo'}
                  <input type="file" accept=".xlsx" className="hidden" disabled={importingReport || cardsCol2.length === 0}
                    onChange={e => { const f = e.target.files?.[0]; if (f) importMinvoiceReport(f); e.target.value = '' }} />
                </label>
                </div>
              )}
            </div>
            {/* Banner an toàn: đếm phiếu ĐÃ xuất file nhưng CHƯA nhập số HĐ -> nhắc đối chiếu MISA, chống quên. */}
            {isKeToan && col2PendingCount > 0 && (
              <div className="mx-3 mt-2 -mb-1 text-[10px] leading-snug bg-amber-50 border border-amber-200 text-amber-800 rounded px-2 py-1.5">
                ⚠ <b>{col2PendingCount}</b> phiếu đã xuất M-invoice nhưng <b>chưa nhập số HĐ</b>. Hãy đối chiếu đã lên hóa đơn trên MISA chưa — nhập số HĐ để chốt sang <i>Chờ thanh toán</i>. (Nếu thực sự chưa lên: mở thẻ, bấm <b>Xuất lại</b>.)
              </div>
            )}
            {renderCardList(cardsCol2, 'Đang xử lý HĐ')}
          </div>

          {/* CỘT 3: CHỜ THANH TOÁN (Trạng thái Đã lên hóa đơn) */}
          <div className="border border-slate-200 rounded-xl bg-white flex flex-col shadow-sm">
            <div className="p-3 bg-emerald-50/50 rounded-t-xl flex flex-col items-stretch gap-2">
              <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" /> {role === 'kthc' ? '2.' : '3.'} Chờ thanh toán ({col3Pay !== 'all' || col3Age !== 'all' ? `${cardsCol3Shown.length}/${cardsCol3.length}` : cardsCol3.length})
              </h3>
              {isKeToan && (
                <div className="flex gap-2 flex-wrap">
                  <label title="Import thanh toán từ FAST (Sổ chi tiết TK 112) → đối ứng công nợ, thu = tổng HĐ tự chuyển Đã thanh toán"
                    className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 cursor-pointer ${payImporting ? 'opacity-50 pointer-events-none' : ''}`}>
                    <Upload className="w-3 h-3" /> {payImporting ? 'Đang đối ứng…' : 'Import Thanh toán'}
                    <input type="file" accept=".xlsx" className="hidden" disabled={payImporting}
                      onChange={e => { const f = e.target.files?.[0]; if (f) importThanhToanFast(f); e.target.value = '' }} />
                  </label>
                </div>
              )}
            </div>
            {/* Banner NỢ ĐỌNG theo tuổi — bấm 1 mức để LỌC theo tuổi (bấm lại bỏ lọc). */}
            {col3Debt.nAll > 0 && (
              <div className="mx-3 mt-2 -mb-1 space-y-1">
                <div className="text-[10px] text-slate-600">
                  Còn nợ: <b className="text-slate-800">{fmtVnd(col3Debt.tAll)} đ</b> · {col3Debt.nAll} hóa đơn
                </div>
                <div className="flex flex-wrap gap-1">
                  {col3Debt.n2 > 0 && (
                    <button onClick={() => setCol3Age(col3Age === 'd30' ? 'all' : 'd30')} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-red-50 text-red-700 border-red-200 ${col3Age === 'd30' ? 'ring-2 ring-red-300' : ''}`} title="Lọc: quá hạn >30 ngày">
                      🔴 &gt;30 ngày: {col3Debt.n2} HĐ · {fmtVnd(col3Debt.t2)}
                    </button>
                  )}
                  {col3Debt.n1 > 0 && (
                    <button onClick={() => setCol3Age(col3Age === 'd15' ? 'all' : 'd15')} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200 ${col3Age === 'd15' ? 'ring-2 ring-amber-300' : ''}`} title="Lọc: 15–30 ngày">
                      🟠 15–30 ngày: {col3Debt.n1} HĐ · {fmtVnd(col3Debt.t1)}
                    </button>
                  )}
                  {col3Debt.n0 > 0 && (
                    <button onClick={() => setCol3Age(col3Age === 'd0' ? 'all' : 'd0')} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-slate-50 text-slate-500 border-slate-200 ${col3Age === 'd0' ? 'ring-2 ring-slate-300' : ''}`} title="Lọc: <15 ngày">
                      ⚪ &lt;15 ngày: {col3Debt.n0} HĐ · {fmtVnd(col3Debt.t0)}
                    </button>
                  )}
                </div>
              </div>
            )}
            {/* Lọc trạng thái thu (kthc/admin theo dõi công nợ). */}
            {isKeToan && (
              <div className="mx-3 mt-2 -mb-1 flex flex-wrap items-center gap-1">
                {([['all', 'Tất cả'], ['chua', 'Chưa thu'], ['phan', 'Thu một phần'], ['du', 'Thu dư']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setCol3Pay(k)} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${col3Pay === k ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-200'}`}>{l}</button>
                ))}
                {(col3Pay !== 'all' || col3Age !== 'all') && (
                  <button onClick={() => { setCol3Pay('all'); setCol3Age('all') }} className="text-[10px] text-rose-500 hover:text-rose-700 px-1">Bỏ lọc</button>
                )}
              </div>
            )}
            {renderCardList(cardsCol3Shown, 'Đã lên hóa đơn')}
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

      {/* HỘP THOẠI XUẤT EXCEL CÔNG NỢ (dữ liệu thô) */}
      {exportOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !exporting && setExportOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                <Download className="w-5 h-5 text-blue-600" /> Xuất Excel công nợ
              </h3>
              <button onClick={() => !exporting && setExportOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold text-lg">✕</button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              <p className="text-[11px] text-slate-500">File dữ liệu thô, 2 sheet (Chưa thu · Đã thanh toán) để tự pivot/tổng hợp báo cáo.</p>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phòng ban</label>
                <div className="flex gap-1.5">
                  {(([['tat_ca', 'Tất cả'], ['ky_thuat', 'Kỹ thuật'], ['kinh_doanh', 'Kinh doanh']]) as [typeof expPhongBan, string][]).map(([v, l]) => (
                    <button key={v} onClick={() => setExpPhongBan(v)}
                      className={`px-3 py-1.5 rounded border text-xs font-medium transition ${expPhongBan === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{l}</button>
                  ))}
                </div>
                {expPhongBan === 'kinh_doanh' && <p className="text-[11px] text-amber-600 mt-1.5">Phòng Kinh doanh chưa có dữ liệu (lệnh xuất hàng chưa triển khai) — file sẽ trống.</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">① Công nợ chưa thu — Nợ tính đến ngày</label>
                <DateField value={expCutoff} onChange={setExpCutoff} heightClass="h-9" className="w-44" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">② Đã thanh toán — theo ngày xuất HĐ</label>
                <div className="flex items-center gap-2">
                  <DateField value={expTu} onChange={setExpTu} heightClass="h-9" className="w-36" />
                  <span className="text-slate-400 text-xs">đến</span>
                  <DateField value={expDen} onChange={setExpDen} heightClass="h-9" className="w-36" />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Để trống một đầu = không giới hạn đầu đó.</p>
              </div>
              {search.trim() && <div className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded px-2 py-1.5">Đang áp bộ tìm kiếm: &quot;{search.trim()}&quot;</div>}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setExportOpen(false)} disabled={exporting} className="text-xs">Hủy</Button>
              <Button size="sm" onClick={runExportCongNo} disabled={exporting} className="gap-1 text-xs">
                {exporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Xuất
              </Button>
            </div>
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

              {activeCard.tickets[0].trang_thai_hd === 'Chờ xuất HĐ' && activeCard.tickets.find(t => t.ly_do_tra)?.ly_do_tra && (
                <div className="text-xs bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-rose-800">
                  <b>⚠ Kế toán trả lại — cần sửa:</b> {activeCard.tickets.find(t => t.ly_do_tra)?.ly_do_tra}
                </div>
              )}
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
                  <div className="text-sm font-normal text-slate-800 flex items-start gap-1.5">
                    <span className="min-w-0 break-words">{modalDiaChi || '—'}</span>
                    {modalDiaChi && (
                      <button
                        onClick={() => handleCopy(modalDiaChi, 'dia_chi')}
                        className={`shrink-0 p-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-500 transition ${copiedKey === 'dia_chi' ? 'text-emerald-600 border-emerald-200' : ''}`}
                        title="Copy Địa chỉ"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Email nhận hóa đơn</div>
                  <div className="text-sm font-normal text-slate-800 flex items-start gap-1.5">
                    {/* Nhiều email M-invoice phân cách bằng ';' -> tách mỗi email 1 dòng cho dễ đọc, chống tràn lề. */}
                    <div className="min-w-0 break-all leading-snug">
                      {modalEmail
                        ? modalEmail.split(';').map((e: string) => e.trim()).filter(Boolean).map((e: string, i: number) => <div key={i}>{e}</div>)
                        : <span className="text-slate-400 italic">Chưa khai báo Email</span>}
                    </div>
                    {modalEmail && (
                      <button
                        onClick={() => handleCopy(modalEmail, 'email_kt')}
                        className={`shrink-0 p-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-500 transition ${copiedKey === 'email_kt' ? 'text-emerald-600 border-emerald-200' : ''}`}
                        title="Copy Email nhận HĐ (đầy đủ, có dấu ;)"
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
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Danh sách sản phẩm dịch vụ ({modalDisplayRows.length} mặt hàng){canEditItems && <span className="ml-1.5 normal-case font-normal text-[10px] text-slate-400">· kéo ⠿ để đổi thứ tự</span>}</div>
                  <div className="flex items-center gap-1.5">
                    {canEditItems && activeCard.tickets[0]?._co_mau && (
                      <Button size="sm" variant="outline" onClick={applyTemplate} disabled={savingName} className="h-8 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-50" title="Điền tên + đơn giá đã lưu của khách này (rồi kiểm tra lại)">
                        <CheckSquare className="w-3.5 h-3.5" /> Áp mẫu khách
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={exportExcel} className="h-8 text-xs gap-1"><Download className="w-3.5 h-3.5" /> Xuất Excel</Button>
                    {isKeToan && !canEditItems && (
                      <Button size="sm" variant="outline" onClick={() => activeCard && exportMinvoice([{ tickets: activeCard.tickets, soDonHang: soDonHangCard(activeCard.tickets) }], `minvoice-${soDonHangCard(activeCard.tickets)}.xlsx`)} className="h-8 text-xs gap-1 border-blue-300 text-blue-700 hover:bg-blue-50" title="Xuất file Excel đúng mẫu M-invoice để import (Tạo hóa đơn từ file excel)"><Download className="w-3.5 h-3.5" /> Xuất M-invoice</Button>
                    )}
                    {canEditItems && (
                      <label className="h-8 px-3 text-xs gap-1 inline-flex items-center rounded-md border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer text-slate-700">
                        <Upload className="w-3.5 h-3.5" /> Nhập Excel
                        <input type="file" accept=".xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importExcel(f); e.target.value = '' }} />
                      </label>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 -mt-1">Vật tư dùng tên kho sẽ tự ghép <b>mã hàng</b> vào tên khi lên hóa đơn (Tên - Mã). Tên tự đặt / áp mẫu khách và dòng dịch vụ giữ nguyên — muốn bỏ mã thì bấm ✏️ đặt tên riêng.</p>
                {/* Copy CẢ CỘT (số thô) -> dán xuống 1 cột M-invoice nếu phần mềm cho phép. Chỉ kế toán, không hiện ở cột "Chờ lên hóa đơn". */}
                {modalDisplayRows.length > 0 && isKeToan && !canEditItems && (
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-600">Copy cả cột:</span>
                    {([['ten', 'Tên', modalDisplayRows.map(v => tenHangKeToan(v.ten_hang, v.ma_hang, v.ghepMa))], ['sl', 'SL', modalDisplayRows.map(v => String(v.so_luong))], ['gia', 'Đơn giá', modalDisplayRows.map(v => String(v.don_gia))], ['vat', 'VAT', modalDisplayRows.map(v => String(v.vat))]] as [string, string, string[]][]).map(([key, label, vals]) => (
                      <button key={key} onClick={() => handleCopy(vals.join('\n'), `col_${key}`)}
                        className={`px-2 py-0.5 rounded border transition ${copiedKey === `col_${key}` ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                        {copiedKey === `col_${key}` ? '✓ ' : ''}{label}
                      </button>
                    ))}
                    <span className="text-slate-400">(dán xuống 1 cột)</span>
                  </div>
                )}
                <datalist id="dvt-suggest">
                  {['Cái', 'Hộp', 'Chiếc', 'Bộ', 'Ram', 'Cuộn', 'Chai', 'Lọ', 'Gói', 'Thùng', 'Bình', 'Cây', 'Tờ', 'Kg', 'Mét', 'Tháng', 'Bản'].map(u => <option key={u} value={u} />)}
                </datalist>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 font-semibold uppercase">
                      <tr>
                        <th className="px-3 py-2">Tên vật tư / dịch vụ</th>
                        <th className="px-3 py-2 text-center w-14">SL</th>
                        <th className="px-3 py-2 text-center w-16">ĐVT</th>
                        <th className="px-3 py-2 text-right w-24">Đơn giá</th>
                        <th className="px-3 py-2 text-center w-14">VAT</th>
                        <th className="px-3 py-2 text-right w-24">Thành tiền</th>
                        <th className="px-3 py-2 text-center w-16">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white font-medium text-slate-700">
                      {modalDisplayRows.map((v, i) => {
                        const tt = v.so_luong * v.don_gia
                        const copyText = `${tenHangKeToan(v.ten_hang, v.ma_hang, v.ghepMa)}\t${v.so_luong}\t${v.don_gia}\t${v.vat}`
                        if (canEditItems && editName?.ma_hang === v.ma_hang) {
                          return (
                            <tr key={i} className="bg-blue-50/40">
                              <td colSpan={7} className="px-3 py-2.5">
                                <div className="flex flex-col gap-2">
                                  <Input
                                    value={editName.ten}
                                    onChange={e => setEditName({ ...editName, ten: e.target.value })}
                                    placeholder="Tên hàng trên hóa đơn"
                                    className="h-9 bg-white text-xs"
                                  />
                                  <div className="grid grid-cols-2 gap-2">
                                    <label className="flex flex-col gap-1">
                                      <span className="text-[10px] text-slate-400">Đơn giá</span>
                                      <Input
                                        value={editName.gia}
                                        onChange={e => setEditName({ ...editName, gia: e.target.value })}
                                        placeholder="Đơn giá"
                                        inputMode="numeric"
                                        className="h-9 bg-white text-xs text-right"
                                      />
                                    </label>
                                    <label className="flex flex-col gap-1">
                                      <span className="text-[10px] text-slate-400">ĐVT (trống = Cái)</span>
                                      <Input
                                        value={editName.dvt}
                                        onChange={e => setEditName({ ...editName, dvt: e.target.value })}
                                        placeholder="Cái"
                                        list="dvt-suggest"
                                        className="h-9 bg-white text-xs"
                                      />
                                    </label>
                                  </div>
                                  <div className="flex flex-wrap gap-2 items-center">
                                    <Button size="sm" onClick={() => saveName('hoa_don')} disabled={savingName} className="h-8 text-xs bg-blue-600 hover:bg-blue-700">Chỉ hóa đơn này</Button>
                                    <Button size="sm" variant="outline" onClick={() => saveName('khach')} disabled={savingName} className="h-8 text-xs">Lưu mẫu cho khách</Button>
                                    <button onClick={() => setEditName(null)} className="text-xs text-slate-500 hover:text-slate-700 px-1">Hủy</button>
                                    <button onClick={resetName} disabled={savingName} title="Xóa mẫu đã lưu cho khách/cụm ở mã hàng này. Dòng vật tư kho về tên kho; dòng dịch vụ giữ tên hiện tại." className="text-xs text-rose-500 hover:text-rose-700 px-1 disabled:opacity-50">↺ Reset mẫu</button>
                                    <span className="text-[10px] text-slate-400 ml-auto font-mono">Mã: {v.ma_hang}</span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )
                        }
                        return (
                          <tr
                            key={i}
                            draggable={!!canEditItems}
                            onDragStart={canEditItems ? (e => { setDragVtIdx(i); e.dataTransfer.effectAllowed = 'move' }) : undefined}
                            onDragOver={canEditItems ? (e => e.preventDefault()) : undefined}
                            onDrop={canEditItems ? (e => { e.preventDefault(); if (dragVtIdx != null) moveVatTu(dragVtIdx, i); setDragVtIdx(null) }) : undefined}
                            onDragEnd={() => setDragVtIdx(null)}
                            className={`hover:bg-slate-50/50 ${canEditItems ? 'cursor-move' : ''} ${dragVtIdx === i ? 'opacity-40' : ''}`}
                          >
                            <td className="px-3 py-2.5 font-medium">
                              <div className="flex items-center gap-1.5">
                                {canEditItems && <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
                                <span>{tenHangKeToan(v.ten_hang, v.ma_hang, v.ghepMa)}</span>
                                {canEditItems && (
                                  <button
                                    onClick={() => { const ten = v.ten_hang, gia = v.don_gia ? String(v.don_gia) : '', dvt = v.dvt || ''; setEditName({ ma_hang: v.ma_hang, ten, gia, dvt, ten0: ten, gia0: gia, dvt0: dvt }) }}
                                    title="Đổi tên / đơn giá / ĐVT hiển thị trên hóa đơn"
                                    className="text-slate-300 hover:text-blue-600 shrink-0"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center">{v.so_luong}</td>
                            <td className="px-3 py-2.5 text-center text-slate-500">{v.dvt || 'Cái'}</td>
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
                  <span className="font-mono font-bold text-slate-700">{fmtVnd(modalTruoc)} đ</span>
                </div>
                <div className="flex justify-between items-center text-xs text-slate-500">
                  <span>Tiền thuế VAT:</span>
                  <span className="font-mono font-bold text-slate-700">{fmtVnd(modalVat)} đ</span>
                </div>
                {modalLamTron !== 0 && (
                  <div className="flex justify-between items-center text-xs text-amber-600">
                    <span>Chênh lệch làm tròn:</span>
                    <span className="font-mono font-bold">{modalLamTron > 0 ? '+' : ''}{fmtVnd(modalLamTron)} đ</span>
                  </div>
                )}
                <div className="flex justify-between items-center gap-2 text-sm border-t border-dashed border-slate-200 pt-2 font-bold text-slate-800">
                  <span>TỔNG CỘNG THANH TOÁN (sau thuế):</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-blue-700 text-base">{fmtVnd(modalTong)} đ</span>
                    {canEditItems && !roundOpen && (
                      <button onClick={() => { setRoundVal(fmtMoneyInput(String(modalTong))); setRoundOpen(true) }} title="Đặt tổng sau thuế thành số tròn (chênh lệch lưu vào khoản làm tròn)" className="text-slate-300 hover:text-blue-600">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {canEditItems && roundOpen && (
                  <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-dashed border-slate-200">
                    <span className="text-[11px] text-slate-500">Đặt tổng sau thuế:</span>
                    <Input value={roundVal} onChange={e => setRoundVal(fmtMoneyInput(e.target.value))} inputMode="numeric" className="h-8 w-36 text-right text-xs font-mono bg-white" />
                    <span className="text-[11px] text-slate-400">đ</span>
                    <Button size="sm" onClick={saveLamTron} disabled={savingRound} className="h-8 text-xs bg-blue-600 hover:bg-blue-700">Lưu</Button>
                    <button onClick={() => setRoundVal(fmtMoneyInput(String(Math.round(modalStats.sauVat))))} className="text-[11px] text-slate-500 hover:text-slate-700 px-1" title="Đặt lại về số tự tính (bỏ làm tròn)">Bỏ làm tròn</button>
                    <button onClick={() => setRoundOpen(false)} className="text-[11px] text-slate-500 hover:text-slate-700 px-1">Hủy</button>
                  </div>
                )}
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
                    disabled={activeCard.tickets[0].trang_thai_hd !== 'Đang xử lý HĐ' || !isKeToan}
                    className="h-10 mt-1 bg-white uppercase font-mono font-bold text-slate-800 border-blue-200 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                  {activeCard.tickets[0].trang_thai_hd === 'Đang xử lý HĐ' && !isKeToan
                    ? <p className="text-[10px] text-amber-600">Chỉ kế toán (KT-HC) mới nhập số hóa đơn và hoàn tất. Bạn chỉ xem/đối chiếu.</p>
                    : <p className="text-[10px] text-blue-600">Lưu ý: Bắt buộc điền đúng Số hóa đơn đã xuất trên phần mềm để lưu vết đối chiếu.</p>}
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
                      <Button onClick={() => { const ids = activeCard.tickets.map(t => t.id); setActiveCard(null); openPayModal(ids) }} disabled={completing} className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">Thu tiền / Thanh toán →</Button>
                    </>
                  )}
                  {st === 'Đã thanh toán' && canKt && (
                    <Button variant="outline" onClick={() => moveStatus('Đã lên hóa đơn', true)} disabled={completing} className="h-10">← Bỏ đánh dấu thanh toán</Button>
                  )}
                  {st === 'Đang xử lý HĐ' && canKt && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setReturnTarget({ ids: activeCard.tickets.map(t => t.id), reason: '' })}
                        disabled={completing}
                        className="h-10 border-rose-200 text-rose-700 hover:bg-rose-50"
                        title="Trả phiếu về 'Chờ lên hóa đơn' cho tech_admin/staff sửa thông tin"
                      >
                        ← Trả lại (thiếu thông tin)
                      </Button>
                      <Button
                        onClick={handleCompleteInvoice}
                        disabled={completing || !invoiceNum.trim()}
                        className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                      >
                        {completing ? 'Đang xử lý...' : 'Hoàn tất xuất hóa đơn'}
                      </Button>
                    </>
                  )}
                </>
              })()}
            </div>

          </div>
        </div>
      )}

      {/* MODAL THU TIỀN (theo số hóa đơn) */}
      {payModal && (() => {
        const con = Math.max(0, payModal.tong - payModal.daThu)
        return (
          <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4" onClick={() => setPayModal(null)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5"><Landmark className="w-5 h-5 text-indigo-600" /> Thu tiền hóa đơn</h3>
                <button onClick={() => setPayModal(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
              </div>
              <div className="p-5 space-y-4">
                <div className="text-sm">
                  <div className="font-semibold text-slate-800">{payModal.tenKh}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Số HĐ: <b className="font-mono">{payModal.soHd || '—'}</b> · {payModal.soPhieu.length} phiếu ({payModal.soPhieu.join(', ')})</div>
                </div>
                <div className="bg-slate-50 rounded-lg border border-slate-100 p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Tổng hóa đơn (sau VAT):</span><b className="font-mono">{fmtVnd(payModal.tong)} đ</b></div>
                  <div className="flex justify-between"><span className="text-slate-500">Đã thu trước đó:</span><span className="font-mono">{fmtVnd(payModal.daThu)} đ</span></div>
                  <div className="flex justify-between border-t border-dashed border-slate-200 pt-1.5"><span className="font-semibold text-slate-700">Còn phải thu:</span><b className="font-mono text-blue-700">{fmtVnd(con)} đ</b></div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Số tiền khách thanh toán (đợt này)</label>
                  <div className="flex gap-2">
                    <Input value={payInput} onChange={e => setPayInput(fmtMoneyInput(e.target.value))} inputMode="numeric" placeholder="0" className="h-10 bg-white text-right font-mono font-bold text-slate-800" />
                    <Button variant="outline" onClick={() => setPayInput(fmtMoneyInput(String(con)))} className="h-10 whitespace-nowrap">Trả đủ</Button>
                  </div>
                  <p className="text-[10px] text-slate-400">Trả thiếu → thẻ ở lại &quot;Chờ thanh toán&quot;. Trả đủ/dư → xác nhận rồi chuyển &quot;Đã thanh toán&quot;.</p>
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center gap-2">
                {role === 'admin'
                  ? <button onClick={resetThu} disabled={paying} className="text-xs text-slate-400 hover:text-rose-600">Đặt lại đã thu</button>
                  : <span />}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setPayModal(null)} disabled={paying} className="h-10">Đóng</Button>
                  <Button onClick={submitPay} disabled={paying || !parseMoney(payInput)} className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">{paying ? 'Đang ghi...' : 'Ghi nhận'}</Button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* MODAL XÁC NHẬN (THAY THẾ WINDOW.CONFIRM) */}
      {/* HỘP THOẠI KẾ TOÁN TRẢ LẠI PHIẾU (nhập lý do) */}
      {returnTarget && (
        <div className="fixed inset-0 bg-black/50 z-[75] flex items-center justify-center p-4" onClick={() => !returning && setReturnTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 bg-rose-50 border-b border-rose-100">
              <h3 className="text-base font-bold text-rose-800">Trả phiếu về &quot;Chờ lên hóa đơn&quot;</h3>
              <p className="text-xs text-rose-600 mt-0.5">Phiếu quay lại cột 1 cho tech_admin/staff sửa. Nêu rõ cần sửa gì.</p>
            </div>
            <div className="p-5">
              <label className="text-xs font-semibold text-slate-600">Lý do trả lại <span className="text-red-500">*</span></label>
              <textarea
                value={returnTarget.reason}
                onChange={e => setReturnTarget(r => r ? { ...r, reason: e.target.value } : r)}
                placeholder="VD: Thiếu MST khách; sai đơn giá dòng Mực TN514; chưa có địa chỉ xuất hóa đơn…"
                rows={4}
                className="mt-1 w-full rounded-md border border-slate-200 p-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-300 resize-none"
              />
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setReturnTarget(null)} disabled={returning} className="text-xs">Hủy</Button>
              <Button size="sm" onClick={doReturn} disabled={returning || !returnTarget.reason.trim()} className="text-xs bg-rose-600 hover:bg-rose-700 text-white">
                {returning ? 'Đang trả…' : 'Trả lại phiếu'}
              </Button>
            </div>
          </div>
        </div>
      )}

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

      {/* KẾT QUẢ IMPORT BÁO CÁO M-INVOICE */}
      {importResult && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4" onClick={() => setImportResult(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-slate-800">Kết quả import báo cáo M-invoice</h3>
              <p className="text-xs text-slate-500 mt-0.5">Đã đọc {importResult.total} hóa đơn trong file.</p>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[140px] rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div className="text-2xl font-bold text-emerald-700">{importResult.ok}</div>
                  <div className="text-xs text-emerald-700">thẻ đã điền số HĐ + chuyển sang <b>Chờ thanh toán</b></div>
                </div>
                <div className="flex-1 min-w-[140px] rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="text-2xl font-bold text-amber-700">{importResult.skipped.length + importResult.failed.length}</div>
                  <div className="text-xs text-amber-700">dòng chưa xử lý — cần làm tay</div>
                </div>
              </div>

              {importResult.failed.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-600 uppercase mb-1.5">Lỗi khi cập nhật ({importResult.failed.length})</p>
                  <div className="rounded-lg border border-red-100 divide-y divide-red-50">
                    {importResult.failed.map((f, i) => (
                      <div key={i} className="px-3 py-2 text-xs flex gap-2"><span className="font-mono font-semibold text-slate-700 shrink-0">HĐ {f.soHD}</span><span className="text-red-600">{f.reason}</span></div>
                    ))}
                  </div>
                </div>
              )}

              {importResult.skipped.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-600 uppercase mb-1.5">Không khớp — cần xử lý tay ({importResult.skipped.length})</p>
                  <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-[40vh] overflow-y-auto">
                    {importResult.skipped.map((s, i) => (
                      <div key={i} className="px-3 py-2 text-xs">
                        <div className="flex gap-2 items-baseline"><span className="font-mono font-semibold text-slate-700 shrink-0">HĐ {s.soHD}</span><span className="text-slate-500 truncate">{s.ten}</span></div>
                        <div className="text-amber-700 mt-0.5">{s.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {importResult.ok === importResult.total && (
                <div className="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-2">✓ Tất cả hóa đơn trong file đều đã khớp và xử lý xong.</div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end shrink-0">
              <Button onClick={() => setImportResult(null)} className="h-9 bg-blue-600 hover:bg-blue-700">Đóng</Button>
            </div>
          </div>
        </div>
      )}

      {/* KẾT QUẢ IMPORT THANH TOÁN (FAST) */}
      {payResult && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4" onClick={() => setPayResult(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-slate-800">Kết quả đối ứng thanh toán (FAST)</h3>
              <p className="text-xs text-slate-500 mt-0.5">Thu = tổng HĐ → tự chuyển "Đã thanh toán". Các trường hợp khác giữ ở "Chờ thanh toán" để đối soát.</p>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0 text-sm">
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[120px] rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
                  <div className="text-2xl font-bold text-indigo-700">{payResult.moved.length}</div>
                  <div className="text-xs text-indigo-700">HĐ thu đủ → chuyển <b>Đã thanh toán</b></div>
                </div>
                <div className="flex-1 min-w-[120px] rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="text-2xl font-bold text-amber-700">{payResult.partial.length + payResult.over.length}</div>
                  <div className="text-xs text-amber-700">HĐ ghi nhận đã thu (giữ ở Chờ thanh toán)</div>
                </div>
                <div className="flex-1 min-w-[120px] rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-2xl font-bold text-slate-700">{payResult.lumps.length}</div>
                  <div className="text-xs text-slate-600">Khoản gộp cần đối chiếu tay</div>
                </div>
              </div>

              {payResult.failed.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-600 uppercase mb-1.5">Lỗi ghi nhận ({payResult.failed.length})</p>
                  <div className="rounded-lg border border-red-100 divide-y divide-red-50">
                    {payResult.failed.map((f: any, i: number) => <div key={i} className="px-3 py-1.5 text-xs flex gap-2"><span className="font-mono font-semibold shrink-0">HĐ {f.hd}</span><span className="text-red-600">{f.reason}</span></div>)}
                  </div>
                </div>
              )}

              {(payResult.partial.length > 0 || payResult.over.length > 0) && (
                <div>
                  <p className="text-xs font-semibold text-amber-600 uppercase mb-1.5">Đã ghi nhận — ở lại Chờ thanh toán</p>
                  <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-[24vh] overflow-y-auto">
                    {payResult.partial.map((p: any, i: number) => <div key={'p' + i} className="px-3 py-1.5 text-xs flex justify-between gap-2"><span className="font-mono font-semibold">HĐ {p.hd}</span><span className="text-amber-700">đã thu {fmtVnd(p.daThu)} / {fmtVnd(p.tong)} · còn {fmtVnd(p.tong - p.daThu)}</span></div>)}
                    {payResult.over.map((p: any, i: number) => <div key={'o' + i} className="px-3 py-1.5 text-xs flex justify-between gap-2"><span className="font-mono font-semibold">HĐ {p.hd}</span><span className="text-rose-600">thu DƯ {fmtVnd(p.daThu - p.tong)} (thu {fmtVnd(p.daThu)} / {fmtVnd(p.tong)}) — kiểm tra</span></div>)}
                  </div>
                </div>
              )}

              {payResult.lumps.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase mb-1.5">Khoản gộp "Thu tiền hàng" — đối chiếu tay theo khách</p>
                  <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-[28vh] overflow-y-auto">
                    {payResult.lumps.map((l: any, i: number) => (
                      <div key={i} className="px-3 py-2 text-xs">
                        <div className="flex justify-between gap-2"><span className="font-medium text-slate-800 truncate">{l.khach}</span><span className="font-semibold text-slate-700 shrink-0">{fmtVnd(l.tien)} đ</span></div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{l.hds.length ? <>HĐ ở Chờ thanh toán: {l.hds.map((h: any) => `${h.hd} (còn ${fmtVnd(h.con)})`).join(' · ')}</> : 'Không thấy HĐ nào của khách này ở Chờ thanh toán'}</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Khoản gộp không ghi số HĐ nên không tự đối ứng — kế toán tự thu tiền cho HĐ tương ứng.</p>
                </div>
              )}

              {payResult.khacCount > 0 && (
                <p className="text-[11px] text-slate-400">Bỏ qua <b>{payResult.khacCount}</b> khoản thu cho HĐ không thuộc "Chờ thanh toán" (đã ở Đã thanh toán / kỳ khác).</p>
              )}
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end shrink-0">
              <Button onClick={() => setPayResult(null)} className="h-9 bg-blue-600 hover:bg-blue-700">Đóng</Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}