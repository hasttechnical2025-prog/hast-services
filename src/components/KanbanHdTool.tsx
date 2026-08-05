"use client"

import { useState, useEffect, useCallback } from "react"
import { Copy, AlertCircle, CheckCircle, Clock, ArrowRight, User, Hash, CheckSquare, Layers, FileText, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  soct_kho_hang: { ten_hang: string } | null
}

type Customer = {
  id: string
  ten_khach_hang: string
  dia_chi: string
  ma_so_thue: string | null
  email_ke_toan: string | null
  ma_khach_cum: string | null
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
  trang_thai_hd: 'Chờ xuất HĐ' | 'Đang xử lý HĐ' | 'Đã lên hóa đơn'
  so_hoa_don: string | null
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

export default function KanbanHdTool({ showNotification }: { showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [grouped, setGrouped] = useState(true) // Bật/tắt tự động gom nhóm theo khách hàng
  const [activeCard, setActiveCard] = useState<{ type: 'single' | 'group', tickets: Ticket[] } | null>(null)
  const [invoiceNum, setInvoiceNum] = useState("")
  const [completing, setCompleting] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/kanban-hd')
      const j = await res.json()
      if (res.ok) {
        setTickets(j.data || [])
      } else {
        showNotification('error', j.error || 'Lỗi tải danh sách Kanban')
      }
    } catch {
      showNotification('error', 'Lỗi kết nối hệ thống')
    } finally {
      setLoading(false)
    }
  }, [showNotification])

  useEffect(() => {
    load()
    // Đăng ký kênh Realtime lắng nghe thay đổi phiếu
    const ch = supabase
      .channel("soct_jobs_kanban")
      .on('broadcast', { event: "changed" }, () => { load() })
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])

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
  const handleDragStart = (e: React.DragEvent, cardData: { id?: string, ids?: string[] }) => {
    e.dataTransfer.setData("text/plain", JSON.stringify(cardData))
  }

  // Thả thẻ (Drop)
  const handleDrop = async (e: React.DragEvent, targetState: 'Chờ xuất HĐ' | 'Đang xử lý HĐ' | 'Đã lên hóa đơn') => {
    e.preventDefault()
    try {
      const raw = e.dataTransfer.getData("text/plain")
      if (!raw) return
      const cardData = JSON.parse(raw)
      const targetIds = cardData.ids || [cardData.id]

      if (targetState === 'Đã lên hóa đơn') {
        // Nếu kéo sang cột hoàn thành -> Bắt buộc mở Modal để nhập số hóa đơn
        const matchedTickets = tickets.filter(t => targetIds.includes(t.id))
        setInvoiceNum("")
        setActiveCard({
          type: cardData.ids ? 'group' : 'single',
          tickets: matchedTickets
        })
      } else {
        // Cập nhật trạng thái kéo thả sang Cột 1 hoặc Cột 2
        const res = await fetch('/api/admin/kanban-hd', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: targetIds, trang_thai_hd: targetState })
        })
        if (res.ok) {
          showNotification('success', 'Đã chuyển trạng thái phiếu')
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

  // Hoàn tất xuất hóa đơn (Modal Submit)
  const handleCompleteInvoice = async () => {
    if (!activeCard) return
    const cleanedInvoice = invoiceNum.trim()
    if (!cleanedInvoice) {
      return showNotification('error', 'Vui lòng nhập Số hóa đơn!')
    }

    setCompleting(true)
    try {
      const targetIds = activeCard.tickets.map(t => t.id)
      const res = await fetch('/api/admin/kanban-hd', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: targetIds,
          trang_thai_hd: 'Đã lên hóa đơn',
          so_hoa_don: cleanedInvoice
        })
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

  // Phân bổ thẻ lên các cột
  const col1Tickets = tickets.filter(t => t.trang_thai_hd === 'Chờ xuất HĐ')
  const col2Tickets = tickets.filter(t => t.trang_thai_hd === 'Đang xử lý HĐ')
  const col3Tickets = tickets.filter(t => t.trang_thai_hd === 'Đã lên hóa đơn')

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
      const kId = t.id_khach_hang
      if (!map.has(kId)) {
        map.set(kId, {
          id: kId,
          customer: t.soct_khach_hang,
          tickets: [],
          trang_thai_hd: state
        })
      }
      map.get(kId)!.tickets.push(t)
    })
    return [...map.values()]
  }

  const cardsCol1 = getColumnCards(col1Tickets, 'Chờ xuất HĐ')
  const cardsCol2 = getColumnCards(col2Tickets, 'Đang xử lý HĐ')
  // Cột 3 (Đã hoàn thành) luôn để đơn lẻ từng phiếu để hiển thị rõ số hóa đơn riêng biệt
  const cardsCol3 = col3Tickets.map(t => ({
    id: t.id,
    customer: t.soct_khach_hang,
    tickets: [t],
    trang_thai_hd: 'Đã lên hóa đơn'
  }))

  const renderCardList = (cards: any[], state: 'Chờ xuất HĐ' | 'Đang xử lý HĐ' | 'Đã lên hóa đơn') => {
    return (
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => handleDrop(e, state)}
        className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50 min-h-[500px] rounded-b-xl border-t border-slate-100"
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
              ? { ids: card.tickets.map((t: any) => t.id) }
              : { id: card.tickets[0].id }

            return (
              <div
                key={card.id}
                draggable
                onDragStart={e => handleDragStart(e, dragData)}
                onClick={() => {
                  if (state === 'Đang xử lý HĐ' || state === 'Đã lên hóa đơn') {
                    setInvoiceNum(card.tickets[0].so_hoa_don || "")
                    setActiveCard({
                      type: count > 1 ? 'group' : 'single',
                      tickets: card.tickets
                    })
                  }
                }}
                className={`bg-white border rounded-lg p-3 shadow-sm hover:shadow transition cursor-grab active:cursor-grabbing border-slate-200 relative overflow-hidden ${state !== 'Chờ xuất HĐ' ? 'hover:bg-slate-50/50' : ''}`}
              >
                {/* Đường viền trang trí trạng thái */}
                <div className={`absolute top-0 left-0 bottom-0 w-1 ${state === 'Chờ xuất HĐ' ? 'bg-blue-500' : state === 'Đang xử lý HĐ' ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>

                <div className="pl-1.5 space-y-2">
                  <div className="font-bold text-slate-800 text-xs leading-snug line-clamp-2">
                    {card.customer?.ten_khach_hang || 'Khách hàng lẻ'}
                  </div>

                  {card.customer?.ma_so_thue && (
                    <div className="text-[10px] text-slate-400 font-mono">
                      MST: {card.customer.ma_so_thue}
                    </div>
                  )}

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
                      <div className="text-[9px] text-slate-400">Trước VAT: {fmtVnd(truocVat)}</div>
                    </div>
                  </div>

                  {state === 'Đã lên hóa đơn' && card.tickets[0].so_hoa_don && (
                    <div className="mt-2 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded px-2 py-1 text-[10px] font-semibold flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      HĐ: {card.tickets[0].so_hoa_don}
                    </div>
                  )}
                </div>
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

  // Gộp các dòng vật tư trùng mã hàng để hóa đơn in gọn gàng
  const aggregatedVatTu: Record<string, { ma_hang: string; ten_hang: string; so_luong: number; don_gia: number; vat: number }> = {}
  modalAllVt.filter(v => !v.da_tra).forEach(v => {
    const k = `${v.ma_hang}_${v.don_gia}`
    if (!aggregatedVatTu[k]) {
      aggregatedVatTu[k] = {
        ma_hang: v.ma_hang,
        ten_hang: v.soct_kho_hang?.ten_hang || v.ma_hang,
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
            <Layers className="w-5 h-5 text-blue-600" /> Quy trình xuất Hóa đơn (Kanban)
          </h2>
          <p className="text-xs text-slate-400">Tech_admin giao việc {`->`} Kế toán xuất hóa đơn trên MISA/Fast/SAPP và dán Số hóa đơn để hoàn tất.</p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={grouped}
              onChange={e => setGrouped(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            Tự động gom nhóm theo khách hàng
          </label>
          <Button onClick={load} disabled={loading} size="sm" variant="outline" className="h-9 gap-1 text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Tải lại
          </Button>
        </div>
      </div>

      {loading && tickets.length === 0 ? (
        <div className="text-center py-24 text-slate-400 text-sm italic bg-white border border-slate-200 rounded-xl shadow-sm">
          Đang tải bảng Kanban...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* CỘT 1: CHỜ XUẤT HĐ */}
          <div className="border border-slate-200 rounded-xl bg-white flex flex-col shadow-sm">
            <div className="p-3 bg-blue-50/50 rounded-t-xl flex justify-between items-center">
              <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> 1. Chờ lên hóa đơn ({cardsCol1.length})
              </h3>
            </div>
            {renderCardList(cardsCol1, 'Chờ xuất HĐ')}
          </div>

          {/* CỘT 2: ĐANG XỬ LÝ HĐ */}
          <div className="border border-slate-200 rounded-xl bg-white flex flex-col shadow-sm">
            <div className="p-3 bg-amber-50/50 rounded-t-xl flex justify-between items-center">
              <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> 2. KT-HC lên hóa đơn ({cardsCol2.length})
              </h3>
            </div>
            {renderCardList(cardsCol2, 'Đang xử lý HĐ')}
          </div>

          {/* CỘT 3: HOÀN THÀNH */}
          <div className="border border-slate-200 rounded-xl bg-white flex flex-col shadow-sm">
            <div className="p-3 bg-emerald-50/50 rounded-t-xl flex justify-between items-center">
              <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" /> 3. Hoàn thành ({cardsCol3.length})
              </h3>
            </div>
            {renderCardList(cardsCol3, 'Đã lên hóa đơn')}
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

              {/* Thông tin khách hàng & MST */}
              <div className="bg-slate-50/70 p-4 rounded-lg border border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Tên khách hàng</div>
                  <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                    {modalKh?.ten_khach_hang || 'Khách hàng lẻ'}
                    <button
                      onClick={() => handleCopy(modalKh?.ten_khach_hang || '', 'ten_kh')}
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
                    {modalKh?.ma_so_thue || <span className="text-slate-400 italic">Chưa khai báo MST</span>}
                    {modalKh?.ma_so_thue && (
                      <button
                        onClick={() => handleCopy(modalKh.ma_so_thue || '', 'mst')}
                        className={`p-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-500 transition ${copiedKey === 'mst' ? 'text-emerald-600 border-emerald-200' : ''}`}
                        title="Copy Mã số thuế"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Địa chỉ xuất hóa đơn</div>
                  <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                    {modalKh?.dia_chi || '—'}
                    {modalKh?.dia_chi && (
                      <button
                        onClick={() => handleCopy(modalKh.dia_chi || '', 'dia_chi')}
                        className={`p-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-500 transition ${copiedKey === 'dia_chi' ? 'text-emerald-600 border-emerald-200' : ''}`}
                        title="Copy Địa chỉ"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Bảng chi tiết sản phẩm / dịch vụ */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Danh sách sản phẩm dịch vụ ({modalDisplayRows.length} mặt hàng)</div>
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
                        return (
                          <tr key={i} className="hover:bg-slate-50/50">
                            <td className="px-3 py-2.5 font-medium">{v.ten_hang}</td>
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
                                <Copy className="w-3 h-3" />
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

              {/* Số hóa đơn đầu vào (Chỉ hiện khi ở cột 2 hoặc để xem lại cột 3) */}
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
                    disabled={activeCard.tickets[0].trang_thai_hd === 'Đã lên hóa đơn'}
                    className="h-10 mt-1 bg-white uppercase font-mono font-bold text-slate-800 border-blue-200 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-blue-600">Lưu ý: Bắt buộc điền đúng Số hóa đơn đã xuất trên phần mềm để lưu vết đối chiếu.</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 shrink-0">
              <Button variant="outline" onClick={() => setActiveCard(null)} className="h-10">Đóng</Button>
              {activeCard.tickets[0].trang_thai_hd === 'Đang xử lý HĐ' && (
                <Button
                  onClick={handleCompleteInvoice}
                  disabled={completing || !invoiceNum.trim()}
                  className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  {completing ? 'Đang xử lý...' : 'Hoàn tất xuất hóa đơn'}
                </Button>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
