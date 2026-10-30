'use client'
import { useState, useEffect } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePaged, ListFrame, useColView, ColumnMenu, TableLoading, type ColDef } from '@/ui'

// Port NGUYÊN AuditLogsTool từ admin (y hệt). Gọi lại /api/admin/audit-logs.
const AUDIT_COLS: ColDef[] = [
  { key: 'thoi_gian', label: 'Thời gian', locked: true },
  { key: 'nguoi_dung', label: 'Người dùng' },
  { key: 'hanh_dong', label: 'Hành động', locked: true },
  { key: 'chi_tiet', label: 'Chi tiết' },
]

export function AuditLogsTool({ showNotification }: { showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [limit, setLimit] = useState('50')
  const col = useColView('audit', AUDIT_COLS)
  const paged = usePaged(logs)

  const fetchLogs = async (lim: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/audit-logs?limit=${lim === 'all' ? '0' : lim}`)
      const j = await res.json()
      if (res.ok) setLogs(j.data || []); else showNotification('error', j.error)
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setLoading(false) }
  }
  useEffect(() => { fetchLogs(limit) }, [limit]) // eslint-disable-line react-hooks/exhaustive-deps

  const fmtTs = (s: string) => { const d = new Date(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}` }

  const exportTxt = () => {
    const lines = logs.map(l => `${fmtTs(l.created_at)}\t${l.user_name || ''} (${l.user_role || ''})\t${l.action}\t${l.detail || ''}`)
    const txt = ['Thời gian\tNgười dùng\tHành động\tChi tiết', ...lines].join('\r\n')
    const blob = new Blob(['﻿' + txt], { type: 'text/plain;charset=utf-8;' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.txt`; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <ListFrame paged={paged} unit="bản ghi" toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Tải về</span>
          <select value={limit} onChange={e => setLimit(e.target.value)} className="h-9 px-2 rounded-md border border-slate-200 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
            <option value="10">10</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="all">Toàn bộ</option>
          </select>
          <div className="ml-auto flex items-center gap-2">
            <ColumnMenu view={col} />
            <Button variant="outline" onClick={exportTxt} className="gap-2 h-9"><Download className="w-4 h-4" /> Xuất nhật ký (.txt)</Button>
          </div>
        </div>
      }>
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200">
            <tr>
              {col.show('thoi_gian') && <th className="px-4 py-2 whitespace-nowrap">Thời gian</th>}
              {col.show('nguoi_dung') && <th className="px-4 py-2">Người dùng</th>}
              {col.show('hanh_dong') && <th className="px-4 py-2">Hành động</th>}
              {col.show('chi_tiet') && <th className="px-4 py-2">Chi tiết</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && logs.length === 0 ? (
              <TableLoading colSpan={4} label="Đang tải audit..." />
            ) : logs.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Chưa có log nào.</td></tr>
            ) : paged.pageItems.map(l => (
              <tr key={l.id} className="hover:bg-slate-50">
                {col.show('thoi_gian') && <td className="px-4 py-2 whitespace-nowrap text-xs">{fmtTs(l.created_at)}</td>}
                {col.show('nguoi_dung') && <td className="px-4 py-2 whitespace-nowrap">{l.user_name || '—'} <span className="text-xs text-slate-400 uppercase">{l.user_role}</span></td>}
                {col.show('hanh_dong') && <td className="px-4 py-2 font-medium text-slate-700 whitespace-nowrap">{l.action}</td>}
                {col.show('chi_tiet') && <td className="px-4 py-2 text-xs text-slate-500">{l.detail}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </ListFrame>
    </div>
  )
}
