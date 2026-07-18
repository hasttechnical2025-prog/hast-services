"use client"

import { useState, type ReactNode } from "react"
import { Download, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// soPhieu / srcIds: CHỈ dùng hiển thị & khoanh vùng phiếu trong app (Công nợ) — KHÔNG
// đưa vào file báo giá .docx (bị lọc bỏ khi xuất). Giám định không dùng 2 field này.
export type BaoGiaRow = { ten: string; dvt: string; sl: number; gia: number; vat: number; gc: string; soPhieu?: string; srcIds?: string[] }

export const emptyBaoGiaRow = (): BaoGiaRow => ({ ten: '', dvt: 'Cái', sl: 1, gia: 0, vat: 8, gc: '' })

const fmtN = (x: any) => (Number(x) || 0).toLocaleString('vi-VN')
const digits = (s: string) => s.replace(/[^\d]/g, '')
const asciiFile = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'khach'

// Soạn & xuất báo giá .docx (4 trang: giá gốc + 3 báo giá cạnh tranh theo % tự nhập).
// Dùng chung cho Tài chính > Công nợ và Theo dõi máy > Giám định — chỉ khác nguồn nạp `rows`.
export default function BaoGiaEditor({
  rows, onRowsChange, khachHang, onKhachHangChange, diaChi, onDiaChiChange,
  showNotification, onExported, toolbarExtra, footerExtra, emptyText, canExport = true, showSoPhieu = false,
}: {
  rows: BaoGiaRow[]
  onRowsChange: (rows: BaoGiaRow[]) => void
  khachHang: string
  onKhachHangChange: (v: string) => void
  diaChi: string
  onDiaChiChange: (v: string) => void
  showNotification: (type: 'success' | 'error', msg: string) => void
  onExported?: () => void
  toolbarExtra?: ReactNode
  footerExtra?: ReactNode
  emptyText?: string
  canExport?: boolean
  showSoPhieu?: boolean
}) {
  const [markups, setMarkups] = useState({ a: '3', b: '5', c: '6' })
  const [nam, setNam] = useState(String(new Date().getFullYear()))
  const [exporting, setExporting] = useState(false)

  const upd = (i: number, f: keyof BaoGiaRow, v: any) => onRowsChange(rows.map((r, idx) => idx === i ? { ...r, [f]: v } : r))
  const addRow = () => onRowsChange([...rows, emptyBaoGiaRow()])
  const delRow = (i: number) => onRowsChange(rows.filter((_, idx) => idx !== i))

  const baseCong = rows.reduce((s, r) => s + (Number(r.sl) || 0) * (Number(r.gia) || 0), 0)
  const baseThue = Math.round(rows.reduce((s, r) => s + (Number(r.sl) || 0) * (Number(r.gia) || 0) * (Number(r.vat) || 0) / 100, 0))

  const exportQuote = async () => {
    if (!canExport || rows.length === 0) return showNotification('error', 'Chưa có dữ liệu báo giá.')
    setExporting(true)
    try {
      const res = await fetch('/api/admin/bao-gia', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          khach_hang: khachHang, dia_chi: diaChi, nam,
          // Chỉ gửi các field của báo giá — bỏ soPhieu/srcIds (chỉ dùng nội bộ app)
          rows: rows.map(r => ({ ten: r.ten, dvt: r.dvt, sl: r.sl, gia: r.gia, vat: r.vat, gc: r.gc })),
          markups: [parseFloat(markups.a) || 0, parseFloat(markups.b) || 0, parseFloat(markups.c) || 0],
        }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); showNotification('error', j.error || 'Xuất thất bại'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob); const a = document.createElement('a')
      a.href = url; a.download = `Bao-gia-${asciiFile(khachHang || 'khach')}.docx`; a.click(); URL.revokeObjectURL(url)
      showNotification('success', 'Đã xuất báo giá .docx.')
      onExported?.()
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setExporting(false) }
  }

  return (
    <>
      <div className="p-4 border-b border-slate-200 bg-slate-50/50 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Kính gửi</label>
            <Input value={khachHang} onChange={e => onKhachHangChange(e.target.value)} className="bg-white" placeholder="Tên hiển thị trên báo giá" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Địa chỉ</label>
            <Input value={diaChi} onChange={e => onDiaChiChange(e.target.value)} className="bg-white" />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {toolbarExtra}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Năm báo giá</label>
            <Input value={nam} onChange={e => setNam(digits(e.target.value))} className="bg-white w-24" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">% cạnh tranh (3 báo giá)</label>
            <div className="flex gap-1">
              <Input value={markups.a} onChange={e => setMarkups({ ...markups, a: e.target.value })} className="bg-white w-16 text-center" />
              <Input value={markups.b} onChange={e => setMarkups({ ...markups, b: e.target.value })} className="bg-white w-16 text-center" />
              <Input value={markups.c} onChange={e => setMarkups({ ...markups, c: e.target.value })} className="bg-white w-16 text-center" />
            </div>
          </div>
          <Button variant="outline" onClick={addRow} className="gap-1 h-9"><Plus className="w-4 h-4" /> Thêm dòng</Button>
          <div className="ml-auto">
            <Button onClick={exportQuote} disabled={exporting || !canExport} className="gap-2 h-9"><Download className="w-4 h-4" /> {exporting ? 'Đang xuất...' : 'Xuất báo giá (.docx)'}</Button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 w-8">TT</th>
              {showSoPhieu && <th className="px-2 py-2 w-20">Số phiếu</th>}
              <th className="px-3 py-2">Tên hàng hóa</th>
              <th className="px-2 py-2 w-16">ĐVT</th>
              <th className="px-2 py-2 w-14 text-center">SL</th>
              <th className="px-3 py-2 w-28 text-right">Đơn giá</th>
              <th className="px-2 py-2 w-14 text-center">VAT%</th>
              <th className="px-3 py-2 w-28 text-right">Thành tiền</th>
              <th className="px-3 py-2 w-36">Ghi chú</th>
              <th className="px-2 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={showSoPhieu ? 10 : 9} className="px-4 py-6 text-center text-slate-400">{emptyText || 'Chưa có dòng nào. Bấm "Thêm dòng" để nhập thủ công.'}</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
                {showSoPhieu && <td className="px-2 py-1.5 text-xs font-mono text-slate-500 whitespace-nowrap">{r.soPhieu || '—'}</td>}
                <td className="px-3 py-1.5"><Input value={r.ten} onChange={e => upd(i, 'ten', e.target.value)} className="h-8 bg-white" /></td>
                <td className="px-2 py-1.5"><Input value={r.dvt} onChange={e => upd(i, 'dvt', e.target.value)} className="h-8 bg-white" /></td>
                <td className="px-2 py-1.5"><Input value={String(r.sl)} onChange={e => upd(i, 'sl', parseInt(digits(e.target.value)) || 0)} className="h-8 bg-white text-center" /></td>
                <td className="px-3 py-1.5"><Input value={fmtN(r.gia)} onChange={e => upd(i, 'gia', parseInt(digits(e.target.value)) || 0)} className="h-8 bg-white text-right" /></td>
                <td className="px-2 py-1.5"><Input value={String(r.vat)} onChange={e => upd(i, 'vat', parseFloat(e.target.value.replace(',', '.')) || 0)} className="h-8 bg-white text-center" /></td>
                <td className="px-3 py-1.5 text-right font-medium text-slate-700 whitespace-nowrap">{fmtN((Number(r.sl) || 0) * (Number(r.gia) || 0))}</td>
                <td className="px-3 py-1.5"><Input value={r.gc} onChange={e => upd(i, 'gc', e.target.value)} className="h-8 bg-white" /></td>
                <td className="px-2 py-1.5 text-center"><button onClick={() => delRow(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
          <span>Cộng: <b className="text-slate-800">{fmtN(baseCong)} đ</b></span>
          <span>Thuế GTGT: <b className="text-slate-800">{fmtN(baseThue)} đ</b></span>
          <span>Tổng cộng: <b className="text-slate-800">{fmtN(baseCong + baseThue)} đ</b></span>
        </div>
        {footerExtra && <div className="flex gap-2">{footerExtra}</div>}
      </div>
    </>
  )
}
