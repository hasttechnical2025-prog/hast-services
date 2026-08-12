"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RefreshCw, Search, PenSquare, X } from "lucide-react"

// Kho máy thuê: danh sách biên bản giám định máy thuê/CPC lấy từ app Techbot (bảng
// `inspections`, chung Supabase). Xem + sửa tình trạng/khách khi máy được cho thuê lại.
type Insp = {
  id: string
  serial: string
  model: string
  khach_hang: string
  dia_chi: string
  tinh_trang: string
  counter: string
  ktv: string
  ngay: string
}

const norm = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
const fmtDate = (s: string) => { if (!s) return ''; const d = new Date(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` }

export default function KhoMayThueTool({ showNotification }: { showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [rows, setRows] = useState<Insp[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [editing, setEditing] = useState<Insp | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/kho-may-thue')
      const j = await res.json()
      if (res.ok) setRows(j.data || [])
      else showNotification('error', j.error || 'Lỗi tải danh sách')
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setLoading(false) }
  }, [showNotification])

  useEffect(() => { fetchList() }, [fetchList])

  // Tìm không dấu, token-AND trên serial + model + khách + địa chỉ + KTV.
  const filtered = useMemo(() => {
    const toks = norm(q.trim()).split(/\s+/).filter(Boolean)
    if (!toks.length) return rows
    return rows.filter(r => {
      const hay = norm(`${r.serial} ${r.model} ${r.khach_hang} ${r.dia_chi} ${r.ktv}`)
      return toks.every(t => hay.includes(t))
    })
  }, [rows, q])

  const save = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/kho-may-thue', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, khach_hang: editing.khach_hang, dia_chi: editing.dia_chi, tinh_trang: editing.tinh_trang, counter: editing.counter }),
      })
      if (res.ok) { showNotification('success', 'Đã cập nhật biên bản.'); setEditing(null); fetchList() }
      else { const e = await res.json(); showNotification('error', e.error || 'Lỗi lưu') }
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm serial / khách / model..." className="pl-9 bg-white w-72" />
        </div>
        <Button variant="outline" onClick={fetchList} disabled={loading} className="gap-1 h-9">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
        </Button>
        <span className="text-sm text-slate-500 ml-auto">{filtered.length} máy</span>
      </div>

      <p className="text-xs text-slate-400">Nguồn: biên bản giám định do app Techbot lập (dùng chung dữ liệu, cập nhật tức thời).</p>

      <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Serial</th>
              <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Model</th>
              <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Khách hàng</th>
              <th className="text-left px-3 py-2 font-semibold">Tình trạng</th>
              <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Counter</th>
              <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">KTV</th>
              <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Ngày</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center text-slate-400 py-8">Đang tải...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center text-slate-400 py-8">Không có biên bản nào.</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60 align-top">
                <td className="px-3 py-2 font-mono whitespace-nowrap">{r.serial || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.model || '—'}</td>
                <td className="px-3 py-2">{r.khach_hang || '—'}</td>
                <td className="px-3 py-2 min-w-[16rem] text-slate-600">{r.tinh_trang || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.counter || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.ktv || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.ngay)}</td>
                <td className="px-3 py-2">
                  <button onClick={() => setEditing({ ...r })} className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap"><PenSquare className="w-3.5 h-3.5" /> Sửa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onMouseDown={() => setEditing(null)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-4" onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Cập nhật biên bản</h3>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-slate-500">
              Máy <b className="font-mono">{editing.serial || '—'}</b> · {editing.model || '—'} · lập {fmtDate(editing.ngay)}
            </p>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Khách hàng (đang cho thuê)</label>
                <Input value={editing.khach_hang} onChange={e => setEditing({ ...editing, khach_hang: e.target.value })} className="bg-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Địa chỉ</label>
                <Input value={editing.dia_chi} onChange={e => setEditing({ ...editing, dia_chi: e.target.value })} className="bg-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Counter (đen / màu)</label>
                <Input value={editing.counter} onChange={e => setEditing({ ...editing, counter: e.target.value })} className="bg-white" placeholder="VD: 12.000 / 3.400" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Tình trạng máy</label>
                <textarea value={editing.tinh_trang} onChange={e => setEditing({ ...editing, tinh_trang: e.target.value })} rows={4} className="w-full p-2.5 rounded-md border border-slate-200 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Hủy</Button>
              <Button onClick={save} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
