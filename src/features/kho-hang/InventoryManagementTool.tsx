'use client'
import { useState, useEffect, useMemo } from 'react'
import { Package, Boxes, AlertTriangle, Trash2, ChevronUp, ChevronDown, ToggleLeft, ToggleRight, PenSquare, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ConfirmDialog'
import { usePaged, ListFrame, useColView, StatCard, StatRow, SearchInput, type ColDef } from '@/ui'

// Port NGUYÊN InventoryManagementTool từ admin (y hệt), gọi lại /api/admin/kho-hang.
// Thay confirmDelete + ClearAllButton bằng useConfirm nội bộ.
const INVENTORY_COLS: ColDef[] = [
  { key: 'ma_hang', label: 'Mã hàng', locked: true },
  { key: 'ten_hang', label: 'Tên vật tư', locked: true },
  { key: 'model', label: 'Model máy' },
  { key: 'hang', label: 'Hãng' },
  { key: 'ton_kho', label: 'Tồn kho' },
  { key: 'trang_thai', label: 'Trạng thái' },
  { key: 'thaotac', label: 'Thao tác', locked: true },
]

export function InventoryManagementTool({ inventory, lowStock = 0, onUpdateSuccess, showNotification, danhMuc }: { inventory: any[], lowStock?: number, onUpdateSuccess: () => void, showNotification: (type: 'success' | 'error', msg: string) => void, danhMuc: any[] }) {
  const col = useColView('inventory', INVENTORY_COLS)
  const { confirm, confirmNode } = useConfirm()
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'discontinued'>('all')
  const [searchTerm, setSearchTerm] = useState("")
  const [sortField, setSortField] = useState<string>("ma_hang")
  const [sortAsc, setSortAsc] = useState<boolean>(true)

  const handleSort = (field: string) => {
    if (sortField === field) setSortAsc(prev => !prev)
    else { setSortField(field); setSortAsc(true) }
  }

  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      if (statusFilter === 'active' && item.ngung_su_dung) return false
      if (statusFilter === 'discontinued' && !item.ngung_su_dung) return false
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase()
        const matchMH = (item.ma_hang || '').toLowerCase().includes(q)
        const matchTH = (item.ten_hang || '').toLowerCase().includes(q)
        const matchModel = (item.model || '').toLowerCase().includes(q)
        const matchThayThe = (item.ma_thay_the || '').toLowerCase().includes(q)
        if (!matchMH && !matchTH && !matchModel && !matchThayThe) return false
      }
      return true
    })
  }, [inventory, statusFilter, searchTerm])

  const sortedInventory = useMemo(() => {
    const list = [...filteredInventory]
    list.sort((a, b) => {
      let cmp = 0
      if (sortField === 'ma_hang') cmp = String(a.ma_hang || '').localeCompare(String(b.ma_hang || ''), 'vi', { numeric: true, sensitivity: 'base' })
      else if (sortField === 'ten_hang') cmp = String(a.ten_hang || '').localeCompare(String(b.ten_hang || ''), 'vi', { numeric: true, sensitivity: 'base' })
      else if (sortField === 'model') {
        const mA = String(a.model || '').trim(), mB = String(b.model || '').trim()
        if (!mA && mB) return 1; if (mA && !mB) return -1
        cmp = mA.localeCompare(mB, 'vi', { numeric: true, sensitivity: 'base' })
      } else if (sortField === 'hang') {
        const hA = String(a.hang || '').trim(), hB = String(b.hang || '').trim()
        if (!hA && hB) return 1; if (hA && !hB) return -1
        cmp = hA.localeCompare(hB, 'vi', { numeric: true, sensitivity: 'base' })
      } else if (sortField === 'ton_kho') cmp = (Number(a.ton_kho) || 0) - (Number(b.ton_kho) || 0)
      else if (sortField === 'trang_thai') cmp = (a.ngung_su_dung ? 1 : 0) - (b.ngung_su_dung ? 1 : 0)
      if (cmp === 0) cmp = String(a.ma_hang || '').localeCompare(String(b.ma_hang || ''))
      return sortAsc ? cmp : -cmp
    })
    return list
  }, [filteredInventory, sortField, sortAsc])

  const paged = usePaged(sortedInventory)
  const [formData, setFormData] = useState({ ma_hang: "", ten_hang: "", model: "", hang: "", ton_kho: 0, ngung_su_dung: false, ma_thay_the: "" })

  const dmOptions = (nhom: string, fallback: string[]) => {
    const items = danhMuc.filter(d => d.nhom === nhom && d.active).map(d => d.gia_tri)
    return items.length > 0 ? items : fallback
  }
  const hangOptions = dmOptions('hang', ['Konica', 'Fuji', 'Epson', 'Khác'])
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [highlightMH, setHighlightMH] = useState("")
  const [pendingScroll, setPendingScroll] = useState("")
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => {
    if (!pendingScroll) return
    const el = document.getElementById('inv-' + pendingScroll)
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setPendingScroll("") }
  }, [pendingScroll, paged.page, sortedInventory])

  const dupItem = !isEditing && formData.ma_hang.trim() ? inventory.find(i => i.ma_hang === formData.ma_hang.trim().toUpperCase()) : undefined

  const resetForm = () => { setFormData({ ma_hang: "", ten_hang: "", model: "", hang: "", ton_kho: 0, ngung_su_dung: false, ma_thay_the: "" }); setIsEditing(false) }
  const openAdd = () => { resetForm(); setFormOpen(true) }
  const closeForm = () => { resetForm(); setFormOpen(false) }

  const handleEdit = (item: any) => {
    setFormData({ ma_hang: item.ma_hang, ten_hang: item.ten_hang, model: item.model || "", hang: item.hang || "", ton_kho: item.ton_kho || 0, ngung_su_dung: !!item.ngung_su_dung, ma_thay_the: item.ma_thay_the || "" })
    setIsEditing(true)
    setHighlightMH(item.ma_hang)
    setFormOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/admin/kho-hang', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) })
      if (res.ok) { const ma = formData.ma_hang.trim().toUpperCase(); showNotification('success', isEditing ? "Cập nhật vật tư thành công!" : "Thêm vật tư mới thành công!"); setHighlightMH(ma); setPendingScroll(ma); resetForm(); setFormOpen(false); onUpdateSuccess() }
      else { const err = await res.json(); showNotification('error', err.error) }
    } catch { showNotification('error', "Lỗi kết nối!") } finally { setLoading(false) }
  }

  const onDeleteItem = async (ma_hang: string) => {
    if (!(await confirm(`Xóa vật tư "${ma_hang}" khỏi kho?\nHành động này không thể hoàn tác.`, { confirmLabel: 'Xóa', danger: true }))) return
    try {
      const res = await fetch(`/api/admin/kho-hang?ma_hang=${encodeURIComponent(ma_hang)}`, { method: 'DELETE' })
      if (res.ok) { showNotification('success', 'Đã xóa vật tư.'); onUpdateSuccess() } else { const j = await res.json().catch(() => ({})); showNotification('error', j.error || 'Xóa không thành công') }
    } catch { showNotification('error', 'Lỗi kết nối!') }
  }
  const onClearAll = async () => {
    if (!(await confirm(`Xóa TOÀN BỘ ${inventory.length} vật tư trong kho?\nHành động này không thể hoàn tác.`, { confirmLabel: 'Xóa tất cả', danger: true }))) return
    const res = await fetch('/api/admin/kho-hang?all=1', { method: 'DELETE' })
    if (res.ok) { showNotification('success', 'Đã xóa toàn bộ vật tư.'); onUpdateSuccess() } else showNotification('error', 'Xóa không thành công')
  }

  const invTon = inventory.reduce((s, i) => s + (Number(i.ton_kho) || 0), 0)
  const invLow = lowStock > 0 ? inventory.filter(i => (Number(i.ton_kho) || 0) > 0 && (Number(i.ton_kho) || 0) <= lowStock).length : 0
  const invOut = inventory.filter(i => (Number(i.ton_kho) || 0) <= 0).length
  const invDiscontinued = inventory.filter(i => i.ngung_su_dung).length
  const invActive = inventory.length - invDiscontinued

  const sortCls = (f: string, extra = '') => `px-4 py-3 font-semibold cursor-pointer select-none transition-colors ${extra} ${sortField === f ? 'text-blue-600 font-bold bg-blue-50/60' : 'hover:bg-slate-100 hover:text-slate-700'}`
  const ind = (f: string) => sortField === f && (sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)

  return (
    <div className="space-y-6">
      <StatRow>
        <StatCard label="Mã hàng" value={inventory.length.toLocaleString('vi-VN')} sub="đầu mục vật tư" tone="blue" icon={Package} />
        <StatCard label="Tổng tồn" value={invTon.toLocaleString('vi-VN')} sub="đơn vị trong kho" tone="indigo" icon={Boxes} />
        <StatCard label="Sắp hết" value={invLow.toLocaleString('vi-VN')} sub={lowStock > 0 ? `tồn ≤ ${lowStock.toLocaleString('vi-VN')}` : 'chưa đặt ngưỡng'} tone="amber" icon={AlertTriangle} />
        <StatCard label="Hết hàng" value={invOut.toLocaleString('vi-VN')} sub="tồn = 0" tone="rose" icon={Trash2} />
      </StatRow>
      <ListFrame paged={paged} unit="mã hàng" toolbar={<div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'discontinued')} className="h-9 px-2 rounded-md border border-slate-200 bg-white text-xs text-slate-700 outline-none">
            <option value="all">Tất cả ({inventory.length})</option>
            <option value="active">Đang dùng ({invActive})</option>
            <option value="discontinued">Ngưng dùng ({invDiscontinued})</option>
          </select>
          <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Tìm mã, tên, model, mã tương đương..." className="w-52 sm:w-60" />
          {(statusFilter !== 'all' || searchTerm) && <button type="button" onClick={() => { setStatusFilter('all'); setSearchTerm('') }} className="h-9 px-2.5 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition" title="Bỏ lọc">Bỏ lọc</button>}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={openAdd} className="h-9 gap-1.5 text-xs"><Plus className="w-4 h-4" /> Thêm mới</Button>
          <Button variant="outline" onClick={onClearAll} disabled={inventory.length === 0} title="Xóa toàn bộ vật tư trong kho" className="h-9 px-3 gap-1.5 text-xs border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400"><Trash2 className="w-4 h-4" /> Xóa toàn bộ</Button>
        </div>
      </div>}>
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200 shadow-sm">
            <tr>
              {col.show('ma_hang') && <th onClick={() => handleSort('ma_hang')} className={sortCls('ma_hang')}><div className="inline-flex items-center gap-1"><span>Mã hàng</span>{ind('ma_hang')}</div></th>}
              {col.show('ten_hang') && <th onClick={() => handleSort('ten_hang')} className={sortCls('ten_hang')}><div className="inline-flex items-center gap-1"><span>Tên vật tư</span>{ind('ten_hang')}</div></th>}
              {col.show('model') && <th onClick={() => handleSort('model')} className={sortCls('model')}><div className="inline-flex items-center gap-1"><span>Model</span>{ind('model')}</div></th>}
              {col.show('hang') && <th onClick={() => handleSort('hang')} className={sortCls('hang')}><div className="inline-flex items-center gap-1"><span>Hãng</span>{ind('hang')}</div></th>}
              {col.show('ton_kho') && <th onClick={() => handleSort('ton_kho')} className={sortCls('ton_kho', 'text-center')}><div className="inline-flex items-center justify-center gap-1"><span>Tồn kho</span>{ind('ton_kho')}</div></th>}
              {col.show('trang_thai') && <th onClick={() => handleSort('trang_thai')} className={sortCls('trang_thai', 'text-center whitespace-nowrap')}><div className="inline-flex items-center justify-center gap-1"><span>Trạng thái</span>{ind('trang_thai')}</div></th>}
              {col.show('thaotac') && <th className="px-4 py-3 font-semibold text-center w-24">Thao tác</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedInventory.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">{inventory.length === 0 ? 'Kho hàng đang trống.' : 'Không tìm thấy vật tư khớp bộ lọc.'}</td></tr>
            ) : paged.pageItems.map((item) => (
              <tr key={item.ma_hang} id={'inv-' + item.ma_hang} className={`transition-colors ${highlightMH === item.ma_hang ? 'bg-amber-100' : 'hover:bg-slate-50'} ${item.ngung_su_dung ? 'bg-amber-50/20' : ''}`}>
                {col.show('ma_hang') && <td className="px-4 py-3 font-mono font-medium text-slate-700">{item.ma_hang}{item.ma_thay_the && <div className="text-[10px] font-normal text-blue-600 mt-0.5" title={`Mã tương đương: ${item.ma_thay_the}`}>≡ {item.ma_thay_the}</div>}</td>}
                {col.show('ten_hang') && <td className="px-4 py-3 font-medium text-slate-800">{item.ten_hang}</td>}
                {col.show('model') && <td className="px-4 py-3">{item.model || <span className="text-slate-400 italic">Dùng chung</span>}</td>}
                {col.show('hang') && <td className="px-4 py-3">{item.hang || <span className="text-slate-400 italic">—</span>}</td>}
                {col.show('ton_kho') && <td className="px-4 py-3 text-center"><span className={`px-2 py-1 rounded-full text-xs font-bold ${item.ton_kho <= lowStock ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>{item.ton_kho}</span></td>}
                {col.show('trang_thai') && <td className="px-4 py-3 text-center whitespace-nowrap">{item.ngung_su_dung ? (<span title={item.ma_thay_the ? `Không sử dụng · Mã tương đương: ${item.ma_thay_the}` : "Không sử dụng"} className="inline-flex items-center justify-center cursor-help text-slate-400 hover:text-slate-600 transition"><ToggleLeft className="w-6 h-6" /></span>) : (<span title="Đang dùng" className="inline-flex items-center justify-center cursor-help text-emerald-600 hover:text-emerald-700 transition"><ToggleRight className="w-6 h-6" /></span>)}</td>}
                {col.show('thaotac') && <td className="px-4 py-3"><div className="flex items-center justify-center gap-2 whitespace-nowrap">
                  <button onClick={() => handleEdit(item)} title="Sửa" className="text-blue-500 hover:text-blue-700 p-1.5 bg-blue-50 hover:bg-blue-100 rounded-md transition"><PenSquare className="w-4 h-4" /></button>
                  <button onClick={() => onDeleteItem(item.ma_hang)} title="Xóa" className="text-red-500 hover:text-red-700 p-1.5 bg-red-50 hover:bg-red-100 rounded-md transition"><Trash2 className="w-4 h-4" /></button>
                </div></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </ListFrame>

      {/* Modal Thêm / Sửa vật tư — thay cho form nằm cố định trên trang */}
      {formOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><Package className="w-5 h-5 text-blue-600" /> {isEditing ? 'Sửa vật tư' : 'Thêm vật tư mới'}</h3>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleSave} className="overflow-y-auto p-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Mã hàng *</label>
                  <Input required value={formData.ma_hang} onChange={(e) => setFormData({ ...formData, ma_hang: e.target.value.toUpperCase() })} disabled={isEditing} placeholder="VD: DR017" className={`bg-white h-9 ${dupItem ? 'border-amber-400 focus:ring-amber-400' : ''}`} />
                  {dupItem && (
                    <div className="t3 text-amber-600 flex items-center gap-1 flex-wrap mt-1">⚠ Đã có.<button type="button" onClick={() => handleEdit(dupItem)} className="underline font-medium">Sửa</button></div>
                  )}
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-600">Tên hàng / Vật tư *</label>
                  <Input required value={formData.ten_hang} onChange={(e) => setFormData({ ...formData, ten_hang: e.target.value })} placeholder="VD: Trống lấy ảnh DR017" className="bg-white h-9" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Model</label>
                  <Input value={formData.model} onChange={(e) => setFormData({ ...formData, model: e.target.value })} placeholder="VD: PP 7136" className="bg-white h-9" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Hãng</label>
                  <select value={formData.hang} onChange={(e) => setFormData({ ...formData, hang: e.target.value })} className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm bg-white outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="">-- Chọn hãng --</option>
                    {hangOptions.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">SL Tồn *</label>
                  <Input type="number" required value={formData.ton_kho} onChange={(e) => setFormData({ ...formData, ton_kho: parseInt(e.target.value) || 0 })} className="bg-white h-9 text-center px-1" />
                </div>
              </div>
              {isEditing && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-600">Mã tương đương <span className="font-normal text-slate-400">(nhiều mã cách nhau dấu phẩy)</span></label>
                    <Input value={formData.ma_thay_the} onChange={(e) => setFormData({ ...formData, ma_thay_the: e.target.value.toUpperCase() })} placeholder="VD: AC79090, TN628" className="bg-white h-9 font-mono" />
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none h-9">
                    <input type="checkbox" checked={formData.ngung_su_dung} onChange={(e) => setFormData({ ...formData, ngung_su_dung: e.target.checked })} className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500" />
                    <span className={formData.ngung_su_dung ? 'text-amber-700 font-bold' : ''}>Ngưng sử dụng (Mã cũ)</span>
                  </label>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={closeForm} className="h-9 text-xs">Hủy</Button>
                <Button type="submit" disabled={loading} className="h-9 text-xs px-4 font-medium">{loading ? 'Lưu...' : isEditing ? 'Cập nhật' : 'Thêm mới'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {confirmNode}
    </div>
  )
}
