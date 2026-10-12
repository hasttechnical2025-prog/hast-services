'use client'
import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TableLoading } from '@/ui'

// Port NGUYÊN TroLyLogTool từ admin (y hệt). Gọi lại /api/admin/tro-ly.
const TROLY_TOOL_LABEL: Record<string, string> = {
  tonKho: 'Tồn kho', datHang: 'Đặt hàng', donHang: 'Đơn đặt hàng', congNo: 'Công nợ', giamDinh: 'Giám định',
  baoTri: 'Bảo trì', thueCpc: 'Thuê/CPC', counter: 'Lấy counter', counterMay: 'Counter máy', giaBan: 'Giá bán', phieu: 'Số phiếu',
  congViec: 'Công việc', vatTuMay: 'Vật tư máy', khachHang: 'Khách hàng', none: 'Không rõ',
}

export function TroLyLogTool({ showNotification }: { showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [rows, setRows] = useState<any[]>([])
  const [miss, setMiss] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async (onlyMiss: boolean) => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/tro-ly' + (onlyMiss ? '?miss=1' : ''))
      const j = await r.json()
      if (r.ok) setRows(j.data || []); else showNotification('error', j.error)
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setLoading(false) }
  }
  useEffect(() => { load(miss) }, [miss]) // eslint-disable-line react-hooks/exhaustive-deps

  const fmtDt = (s: string) => {
    const d = new Date(s); if (isNaN(d.getTime())) return s
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
  }

  return (
    <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-slate-700">Nhật ký Trợ lý AI</h3>
          <p className="text-sm text-slate-500">Xem user hỏi gì. Lọc <b>câu trượt</b> (không hiểu / 0 kết quả) để thêm biệt danh hoặc báo lập trình bổ sung.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
          <input type="checkbox" checked={miss} onChange={e => setMiss(e.target.checked)} className="w-4 h-4 accent-blue-600" /> Chỉ xem câu trượt
        </label>
        <Button variant="outline" onClick={() => load(miss)} className="gap-1 h-9"><RefreshCw className="w-4 h-4" /> Tải lại</Button>
      </div>
      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto max-h-[520px] overflow-y-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide sticky top-0 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 whitespace-nowrap">Thời gian</th>
              <th className="px-3 py-2 whitespace-nowrap">Người hỏi</th>
              <th className="px-3 py-2">Câu hỏi</th>
              <th className="px-3 py-2 whitespace-nowrap">Loại</th>
              <th className="px-3 py-2 text-center whitespace-nowrap">Kết quả</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <TableLoading colSpan={5} />
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Chưa có câu hỏi nào.</td></tr>
            ) : rows.map(r => {
              const truot = r.tool === 'none' || r.so_ket_qua === 0
              return (
                <tr key={r.id} className={`hover:bg-slate-50 ${truot ? 'bg-amber-50/40' : ''}`}>
                  <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap align-top">{fmtDt(r.created_at)}</td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap align-top">{r.nguoi_hoi || '—'}</td>
                  <td className="px-3 py-2 align-top">
                    <div className="text-slate-800">{r.cau_hoi}</div>
                    {r.tra_loi && <div className="text-xs text-slate-500 mt-0.5">↳ {r.tra_loi}</div>}
                    {r.tham_so && r.tham_so !== '{}' && <div className="text-[11px] text-slate-400 mt-0.5 font-mono">AI hiểu: {r.tham_so}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap align-top"><span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{TROLY_TOOL_LABEL[r.tool] || r.tool || '—'}</span></td>
                  <td className="px-3 py-2 text-center whitespace-nowrap align-top">
                    {truot ? <span className="text-xs font-semibold text-amber-700">trượt</span> : <span className="text-xs text-emerald-700">{r.so_ket_qua} dòng</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
