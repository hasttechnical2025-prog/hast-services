'use client'
import { useState, useRef, useEffect } from 'react'
import { Plus, PenSquare, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Port NGUYÊN DanhMucTool + AliasTool từ admin (y hệt). Gọi lại /api/admin/danh-muc, /api/admin/alias.
const DANH_MUC_NHOMS = [
  { key: 'loai_cong_viec', label: 'Loại công việc' },
  { key: 'loai_hd', label: 'Loại hợp đồng' },
  { key: 'ktv_giam_dinh', label: 'KTV giám định' },
  { key: 'tinh_trang_may', label: 'Tình trạng máy' },
  { key: 'tinh_trang_bao_cao', label: 'Tình trạng báo cáo KTV' },
  { key: 'nv_kinh_doanh', label: 'NV Kinh doanh' },
  { key: 'nha_cung_cap', label: 'Nhà cung cấp' },
  { key: 'hang', label: 'Hãng máy' },
  { key: 'kho_may', label: 'Kho máy' },
]

export function DanhMucTool({ danhMuc, setDanhMuc, onUpdateSuccess, showNotification }: { danhMuc: any[], setDanhMuc: React.Dispatch<React.SetStateAction<any[]>>, onUpdateSuccess: () => void, showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [nhom, setNhom] = useState('loai_cong_viec')
  const [newVal, setNewVal] = useState("")
  const [editId, setEditId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState("")
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingIds = useRef<string[] | null>(null)

  const items = danhMuc.filter(d => d.nhom === nhom)

  const call = async (method: string, body?: any, qs = "") => {
    const res = await fetch('/api/admin/danh-muc' + qs, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    if (res.ok) { onUpdateSuccess(); return true }
    const err = await res.json(); showNotification('error', err.error); return false
  }

  const addVal = async () => {
    if (!newVal.trim()) return
    if (await call('POST', { nhom, gia_tri: newVal.trim() })) { setNewVal(""); showNotification('success', "Đã thêm giá trị.") }
  }
  const saveEdit = async () => {
    if (!editId || !editVal.trim()) return
    if (await call('PUT', { id: editId, gia_tri: editVal.trim() })) setEditId(null)
  }
  const moveItem = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= items.length) return
    const ids = items.map(i => i.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    const orderOf = new Map(ids.map((id, i) => [id, i + 1]))
    setDanhMuc(prev => prev
      .map(d => d.nhom === nhom && orderOf.has(d.id) ? { ...d, thu_tu: orderOf.get(d.id) } : d)
      .sort((a, b) => a.nhom === b.nhom ? a.thu_tu - b.thu_tu : String(a.nhom).localeCompare(String(b.nhom))))
    pendingIds.current = ids
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const toSave = pendingIds.current; pendingIds.current = null
      if (!toSave) return
      try {
        const res = await fetch('/api/admin/danh-muc', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: toSave }) })
        if (!res.ok) { const e = await res.json(); showNotification('error', e.error || 'Lỗi lưu thứ tự'); onUpdateSuccess() }
      } catch { showNotification('error', 'Lỗi kết nối!'); onUpdateSuccess() }
    }, 500)
  }
  return (
    <div className="space-y-6">
      <div className="border border-slate-200 rounded-lg p-6 bg-white space-y-4">
        <h3 className="text-lg font-semibold text-slate-700">Danh mục dropdown</h3>
        <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-lg w-max max-w-full overflow-x-auto">
          {DANH_MUC_NHOMS.map(n => (
            <button key={n.key} onClick={() => { setNhom(n.key); setEditId(null) }} className={`px-3 py-1.5 rounded-md text-xs transition whitespace-nowrap ${nhom === n.key ? 'bg-white text-blue-700 font-bold shadow-sm ring-1 ring-blue-300' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-medium'}`}>{n.label}</button>
          ))}
        </div>

        <div className="flex gap-2">
          <Input placeholder="Thêm giá trị mới..." className="bg-white" value={newVal} onChange={(e) => setNewVal(e.target.value)} />
          <Button onClick={addVal} className="gap-1 shrink-0"><Plus className="w-4 h-4" /> Thêm</Button>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden max-h-[400px] overflow-y-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide sticky top-0 border-b border-slate-200">
              <tr><th className="px-4 py-2 font-semibold">Giá trị</th><th className="px-4 py-2 font-semibold text-center w-28 whitespace-nowrap">Trạng thái</th><th className="px-4 py-2 font-semibold text-right w-40 whitespace-nowrap">Thao tác</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">Nhóm này chưa có giá trị. Thêm ở trên.</td></tr>
              ) : items.map((it, idx) => (
                <tr key={it.id} className={`hover:bg-slate-50 ${it.active ? '' : 'opacity-50'}`}>
                  <td className="px-4 py-2">
                    {editId === it.id ? (
                      <div className="flex gap-2">
                        <Input value={editVal} onChange={(e) => setEditVal(e.target.value)} className="h-8 bg-white" />
                        <Button onClick={saveEdit} className="h-8 text-xs px-3">Lưu</Button>
                        <Button variant="outline" onClick={() => setEditId(null)} className="h-8 text-xs px-3">Hủy</Button>
                      </div>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="text-slate-300 text-xs tabular-nums w-5 shrink-0 text-right">{idx + 1}</span>
                        <span className="font-medium text-slate-800">{it.gia_tri}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button onClick={() => call('PUT', { id: it.id, active: !it.active })} className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-semibold border ${it.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                      {it.active ? 'Đang dùng' : 'Đã ẩn'}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button onClick={() => moveItem(idx, -1)} disabled={idx === 0} title="Lên" className="text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:hover:text-slate-400 p-1"><ChevronUp className="w-4 h-4" /></button>
                    <button onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1} title="Xuống" className="text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:hover:text-slate-400 p-1"><ChevronDown className="w-4 h-4" /></button>
                    <button onClick={() => { setEditId(it.id); setEditVal(it.gia_tri) }} className="text-blue-500 hover:text-blue-700 p-1 ml-1"><PenSquare className="w-4 h-4" /></button>
                    <button onClick={() => call('DELETE', undefined, `?id=${it.id}`)} className="text-red-500 hover:text-red-700 p-1 ml-1"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export function AliasTool({ showNotification }: { showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [items, setItems] = useState<{ tu_khoa: string, mo_rong: string }[]>([])
  const [tu, setTu] = useState(''), [mo, setMo] = useState(''), [working, setWorking] = useState(false)

  const load = async () => {
    try { const r = await fetch('/api/admin/alias'); const j = await r.json(); if (r.ok) setItems(j.data || []); else showNotification('error', j.error) }
    catch { showNotification('error', 'Lỗi kết nối!') }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    if (!tu.trim() || !mo.trim()) return showNotification('error', 'Nhập đủ từ khóa và cụm từ mở rộng')
    setWorking(true)
    try {
      const r = await fetch('/api/admin/alias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tu_khoa: tu, mo_rong: mo }) })
      const j = await r.json()
      if (r.ok) { setTu(''); setMo(''); showNotification('success', 'Đã thêm biệt danh.'); load() } else showNotification('error', j.error)
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setWorking(false) }
  }
  const del = async (k: string) => {
    try { const r = await fetch('/api/admin/alias?tu_khoa=' + encodeURIComponent(k), { method: 'DELETE' }); if (r.ok) load(); else { const j = await r.json(); showNotification('error', j.error) } }
    catch { showNotification('error', 'Lỗi kết nối!') }
  }

  return (
    <div className="border border-slate-200 rounded-lg p-6 bg-white space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-700">Biệt danh cho Trợ lý AI</h3>
        <p className="text-sm text-slate-500">Giúp trợ lý hiểu viết tắt / tên gọi nội bộ khi tra cứu khách hàng. VD: <b>tccb</b> → <b>Tổ chức cán bộ</b>, <b>pv06</b> → <b>Cục Hồ sơ nghiệp vụ</b>.</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input placeholder="Từ khóa (VD: tccb)" className="bg-white sm:w-48" value={tu} onChange={e => setTu(e.target.value)} />
        <Input placeholder="Cụm từ đầy đủ (VD: Tổ chức cán bộ)" className="bg-white" value={mo} onChange={e => setMo(e.target.value)} />
        <Button onClick={add} disabled={working} className="gap-1 shrink-0"><Plus className="w-4 h-4" /> Thêm</Button>
      </div>
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden max-h-[320px] overflow-y-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide sticky top-0 border-b border-slate-200">
            <tr><th className="px-4 py-2">Từ khóa</th><th className="px-4 py-2">Mở rộng thành</th><th className="px-4 py-2 w-20 text-right">Thao tác</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">Chưa có biệt danh. Thêm ở trên.</td></tr>
            ) : items.map(it => (
              <tr key={it.tu_khoa} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-mono text-slate-700">{it.tu_khoa}</td>
                <td className="px-4 py-2 text-slate-700">{it.mo_rong}</td>
                <td className="px-4 py-2 text-right"><button onClick={() => del(it.tu_khoa)} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-4 h-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
