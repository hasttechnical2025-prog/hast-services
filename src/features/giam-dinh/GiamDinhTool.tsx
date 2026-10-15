'use client'
import { useState, useEffect } from 'react'
import { ClipboardCheck, Plus, Trash2, RefreshCw, Search, Clock, CheckCircle2, Wallet, Wrench, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import DateField from '@/components/DateField'
import BaoGiaEditor, { type BaoGiaRow } from '@/components/BaoGiaEditor'
import { MaterialCombobox } from '@/features/giao-viec/MaterialCombobox'
import { useRealtimeRefetch } from '@/lib/useRealtime'
import { GIAMDINH_TOPIC, DATA_EVENT } from '@/lib/realtime'
import { usePaged, Pagination, StatCard, StatRow, BoxLoading } from '@/ui'

// Port NGUYÊN GiamDinhTool từ admin/page.tsx (y hệt), gọi lại /api/admin/giam-dinh + /api/admin/bao-gia.
function modelNumber(model: string) { const m = (model || '').match(/\d+/); return m ? m[0] : '' }
function matchModelGD(itemModel: string, custModel: string) {
  const num = modelNumber(custModel)
  if (!num) return true
  return (itemModel || '').includes(num)
}

export function GiamDinhTool({ customers, inventory, ktvOptions, tinhTrangOptions, showNotification }: { customers: any[], inventory: any[], ktvOptions: string[], tinhTrangOptions: string[], showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const emptyForm = { ma_may: "", ngay_giam_dinh: new Date().toISOString().split('T')[0], ktv_giam_dinh: "", vi_tri: "", so_dem: "", tinh_trang_may: "", da_bao_gia: false, ghi_chu: "" }
  const [form, setForm] = useState(emptyForm)
  const [vatTu, setVatTu] = useState<{ ma_hang: string, so_luong: string, ghi_chu: string }[]>([])
  const [onlyModel, setOnlyModel] = useState(true)
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [closing, setClosing] = useState<{ id: string, so_report: string, ngay_thay: string } | null>(null)
  const [gdFilters, setGdFilters] = useState({ maMay: "", trangThai: "cho_thay", baoGia: "" })
  const [quoteGd, setQuoteGd] = useState<any | null>(null)
  const [quoteRows, setQuoteRows] = useState<BaoGiaRow[]>([])
  const [quoteKh, setQuoteKh] = useState('')
  const [quoteDiaChi, setQuoteDiaChi] = useState('')
  const [tab, setTab] = useState<'nhap' | 'ds'>('ds')

  const cust = form.ma_may.trim() ? customers.find(c => c.ma_may && c.ma_may.toLowerCase() === form.ma_may.trim().toLowerCase()) : undefined
  const filteredInventory = onlyModel && cust?.model ? inventory.filter(i => matchModelGD(i.model, cust.model)) : inventory

  const gdNorm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
  const filteredRecords = records.filter(r => {
    const f = gdFilters
    if (f.maMay) {
      const toks = gdNorm(f.maMay).trim().split(/\s+/).filter(Boolean)
      const hay = gdNorm(`${r.ma_may || ''} ${r.soct_khach_hang?.ten_khach_hang || ''} ${r.soct_khach_hang?.dia_chi || ''} ${r.soct_khach_hang?.model || ''} ${r.ktv_giam_dinh || ''} ${r.tinh_trang_may || ''}`)
      if (!toks.every(t => hay.includes(t))) return false
    }
    if (f.trangThai === 'cho_thay' && r.da_thay) return false
    if (f.trangThai === 'da_thay' && !r.da_thay) return false
    if (f.baoGia === 'co' && !r.da_bao_gia) return false
    if (f.baoGia === 'chua' && r.da_bao_gia) return false
    return true
  })
  const gdFilterActive = !!(gdFilters.maMay || gdFilters.trangThai !== 'cho_thay' || gdFilters.baoGia !== 'chua')
  const gdPaged = usePaged(filteredRecords)
  const gdStats = {
    total: filteredRecords.length,
    choThay: filteredRecords.filter(r => !r.da_thay).length,
    daThay: filteredRecords.filter(r => r.da_thay).length,
    daBaoGia: filteredRecords.filter(r => r.da_bao_gia).length,
  }

  const fetchRecords = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/giam-dinh')
      const json = await res.json()
      setRecords(json.data || [])
    } catch { showNotification('error', "Không tải được danh sách giám định") }
    finally { setLoading(false) }
  }
  useEffect(() => { fetchRecords() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useRealtimeRefetch(GIAMDINH_TOPIC, DATA_EVENT, () => fetchRecords())

  const addVt = () => setVatTu(prev => [...prev, { ma_hang: "", so_luong: "1", ghi_chu: "" }])
  const updateVt = (i: number, field: 'ma_hang' | 'so_luong' | 'ghi_chu', val: string) => {
    setVatTu(prev => prev.map((v, idx) => idx === i ? { ...v, [field]: val } : v))
  }
  const removeVt = (i: number) => setVatTu(prev => prev.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    if (!form.ma_may.trim()) return showNotification('error', "Nhập mã máy")
    setSaving(true)
    try {
      const res = await fetch('/api/admin/giam-dinh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, id_khach_hang: cust?.id || null, vat_tu: vatTu.filter(v => v.ma_hang) })
      })
      if (res.ok) {
        showNotification('success', "Đã lưu biên bản giám định.")
        setForm(emptyForm); setVatTu([]); fetchRecords()
      } else {
        const err = await res.json(); showNotification('error', err.error)
      }
    } catch { showNotification('error', "Lỗi kết nối!") }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/giam-dinh?id=${id}`, { method: 'DELETE' })
      if (res.ok) fetchRecords(); else showNotification('error', "Xóa không thành công")
    } catch { showNotification('error', "Lỗi kết nối!") }
  }

  const handleClose = async () => {
    if (!closing) return
    if (!closing.so_report.trim()) return showNotification('error', "Nhập số phiếu (report)")
    try {
      const res = await fetch('/api/admin/giam-dinh', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: closing.id, da_thay: true, ngay_thay: closing.ngay_thay, so_report: closing.so_report })
      })
      if (res.ok) { showNotification('success', "Đã đóng biên bản (đã thay)."); setClosing(null); fetchRecords() }
      else { const err = await res.json(); showNotification('error', err.error) }
    } catch { showNotification('error', "Lỗi kết nối!") }
  }

  const toggleBaoGia = async (r: any) => {
    const res = await fetch('/api/admin/giam-dinh', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, da_bao_gia: !r.da_bao_gia }) })
    if (res.ok) fetchRecords(); else showNotification('error', "Cập nhật không thành công")
  }

  const openQuote = async (r: any) => {
    const vts: any[] = r.soct_giam_dinh_vat_tu || []
    setQuoteGd(r)
    setQuoteKh(r.soct_khach_hang?.ten_khach_hang || '')
    setQuoteDiaChi(r.soct_khach_hang?.dia_chi || '')
    const base: BaoGiaRow[] = vts.map(v => ({
      ten: v.soct_kho_hang?.ten_hang || v.ma_hang || '',
      dvt: 'Cái',
      sl: Number(v.so_luong) || 1,
      gia: 0,
      vat: 8,
      gc: v.ghi_chu || '',
    }))
    setQuoteRows(base)
    try {
      const mas = Array.from(new Set(vts.map(v => v.ma_hang).filter(Boolean)))
      if (mas.length === 0) return
      const res = await fetch(`/api/admin/bao-gia?ma_hang=${encodeURIComponent(mas.join(','))}`)
      const j = await res.json()
      if (!res.ok) return
      const goiY: Record<string, { don_gia: number, vat: number }> = j.data || {}
      setQuoteRows(vts.map((v, i) => {
        const g = goiY[v.ma_hang]
        return g ? { ...base[i], gia: g.don_gia, vat: g.vat } : base[i]
      }))
    } catch { /* không có gợi ý thì để 0, nhập tay */ }
  }

  const fmtDate = (s: string) => { if (!s) return ''; const d = new Date(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-slate-200">
        <button onClick={() => setTab('nhap')} className={`px-4 py-2 font-medium text-sm transition whitespace-nowrap border-b-2 ${tab === 'nhap' ? 'border-blue-600 text-blue-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Nhập biên bản</button>
        <button onClick={() => setTab('ds')} className={`px-4 py-2 font-medium text-sm transition whitespace-nowrap border-b-2 ${tab === 'ds' ? 'border-blue-600 text-blue-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Danh sách</button>
      </div>
      {tab === 'nhap' && (
      <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-4">

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Mã máy *</label>
            <Input placeholder="Nhập mã máy" value={form.ma_may} onChange={(e) => setForm({ ...form, ma_may: e.target.value })} className="bg-white" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Khách hàng (tự tra theo mã máy)</label>
            <div className="h-10 flex items-center px-3 rounded-md border border-slate-200 bg-slate-100 text-sm text-slate-600 overflow-hidden whitespace-nowrap text-ellipsis">
              {cust ? cust.ten_khach_hang : <span className="text-slate-400 italic">Chưa khớp mã máy</span>}
            </div>
            {cust && (
              <div className="flex flex-wrap gap-2 text-xs pt-1">
                {cust.model && <span className="text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-100">Model: <b>{cust.model}</b></span>}
                {cust.dia_chi && <span className="text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-100 max-w-full truncate" title={cust.dia_chi}>Địa chỉ: <b>{cust.dia_chi}</b></span>}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Ngày giám định</label>
            <DateField value={form.ngay_giam_dinh} onChange={(v) => setForm({ ...form, ngay_giam_dinh: v })} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">KTV giám định</label>
            <Input list="gd-ktv-list" placeholder="VD: Đức Thể" value={form.ktv_giam_dinh} onChange={(e) => setForm({ ...form, ktv_giam_dinh: e.target.value })} className="bg-white" />
            <datalist id="gd-ktv-list">{ktvOptions.map(o => <option key={o} value={o} />)}</datalist>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Vị trí đặt máy</label>
            <Input placeholder="VD: P.115" value={form.vi_tri} onChange={(e) => setForm({ ...form, vi_tri: e.target.value })} className="bg-white" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Số đếm</label>
            <Input inputMode="numeric" placeholder="VD: 538000" value={form.so_dem} onChange={(e) => setForm({ ...form, so_dem: e.target.value })} className="bg-white" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Tình trạng máy</label>
            <Input list="gd-tt-list" placeholder="VD: Bản in vệt đen, kẹt giấy..." value={form.tinh_trang_may} onChange={(e) => setForm({ ...form, tinh_trang_may: e.target.value })} className="bg-white" />
            <datalist id="gd-tt-list">{tinhTrangOptions.map(o => <option key={o} value={o} />)}</datalist>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center gap-3 flex-wrap">
            <h4 className="text-sm font-semibold text-slate-700">Vật tư đề xuất thay</h4>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                <input type="checkbox" checked={onlyModel} onChange={(e) => setOnlyModel(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                Chỉ vật tư hợp model
              </label>
              <Button type="button" variant="outline" size="sm" onClick={addVt} className="h-8 text-xs gap-1"><Plus className="w-3 h-3" /> Thêm</Button>
            </div>
          </div>
          <div className="p-4 space-y-2">
            {vatTu.length === 0 ? (
              <p className="text-sm text-slate-400 italic text-center py-1">Chưa có vật tư đề xuất.</p>
            ) : vatTu.map((vt, i) => (
              <div key={i} className="flex gap-2 items-end">
                <div className="flex-1">
                  <MaterialCombobox inventory={filteredInventory} value={vt.ma_hang} onChange={(v) => updateVt(i, 'ma_hang', v)} />
                </div>
                <div className="w-20">
                  <Input type="number" min="1" className="h-9 bg-white" value={vt.so_luong} onChange={(e) => updateVt(i, 'so_luong', e.target.value)} />
                </div>
                <button type="button" onClick={() => removeVt(i)} className="text-slate-400 hover:text-red-500 p-2 shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={form.da_bao_gia} onChange={(e) => setForm({ ...form, da_bao_gia: e.target.checked })} className="w-4 h-4 accent-blue-600" />
            Đã báo giá
          </label>
          <Button onClick={handleSave} disabled={saving} className="h-10 gap-2 bg-emerald-600 hover:bg-emerald-700">{saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />} {saving ? 'Đang lưu…' : 'Lưu biên bản'}</Button>
        </div>
      </div>
      )}

      {tab === 'ds' && (
      <div className="space-y-3">
        <StatRow>
          <StatCard label="Biên bản" value={gdStats.total.toLocaleString('vi-VN')} sub={`trên ${records.length.toLocaleString('vi-VN')} tất cả`} tone="blue" icon={ClipboardCheck} />
          <StatCard label="Chờ thay" value={gdStats.choThay.toLocaleString('vi-VN')} sub="chưa thay vật tư" tone="amber" icon={Clock} />
          <StatCard label="Đã thay" value={gdStats.daThay.toLocaleString('vi-VN')} sub="đã xử lý xong" tone="emerald" icon={CheckCircle2} />
          <StatCard label="Đã báo giá" value={gdStats.daBaoGia.toLocaleString('vi-VN')} sub="đã gửi khách" tone="indigo" icon={Wallet} />
        </StatRow>
        <div className="flex flex-wrap items-center gap-2 px-1">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Lọc theo mã máy / khách / địa chỉ..." className="pl-9 pr-7 bg-white h-9 text-xs" value={gdFilters.maMay} onChange={(e) => setGdFilters({ ...gdFilters, maMay: e.target.value })} />
            {gdFilters.maMay && (
              <button type="button" onClick={() => setGdFilters({ ...gdFilters, maMay: '' })} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-semibold" title="Xóa tìm kiếm">✕</button>
            )}
          </div>
          <select value={gdFilters.trangThai} onChange={(e) => setGdFilters({ ...gdFilters, trangThai: e.target.value })} className="h-9 px-2 rounded-md border border-slate-200 text-xs bg-white outline-none">
            <option value="">Trạng thái: Tất cả</option>
            <option value="cho_thay">Chờ thay</option>
            <option value="da_thay">Đã thay</option>
          </select>
          <select value={gdFilters.baoGia} onChange={(e) => setGdFilters({ ...gdFilters, baoGia: e.target.value })} className="h-9 px-2 rounded-md border border-slate-200 text-xs bg-white outline-none">
            <option value="">Báo giá: Tất cả</option>
            <option value="chua">Chưa báo giá</option>
            <option value="co">Đã báo giá</option>
          </select>
          {gdFilterActive && <button onClick={() => setGdFilters({ maMay: "", trangThai: "", baoGia: "" })} className="text-xs text-red-600 hover:underline font-medium">Bỏ lọc</button>}
        </div>
        <Pagination top page={gdPaged.page} pageCount={gdPaged.pageCount} total={gdPaged.total} perPage={gdPaged.perPage} onPage={gdPaged.setPage} onPerPage={gdPaged.setPerPage} />
        {loading ? (
          <BoxLoading label="Đang tải giám định..." />
        ) : records.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-400 text-sm">Chưa có biên bản giám định nào.</div>
        ) : filteredRecords.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-400 text-sm">Không có biên bản khớp bộ lọc.</div>
        ) : gdPaged.pageItems.map((r) => (
          <div key={r.id} className={`bg-white rounded-lg border p-4 space-y-2 ${r.da_thay ? 'border-slate-200 opacity-75' : 'border-amber-200'}`}>
            <div className="flex justify-between items-start gap-3 flex-wrap">
              <div>
                <div className="t1 font-medium text-slate-800">{r.soct_khach_hang?.ten_khach_hang || 'Không rõ khách hàng'}</div>
                <div className="t2 text-slate-500">Mã máy <span className="font-mono">{r.ma_may}</span> · {r.soct_khach_hang?.model || '-'} · GĐ {fmtDate(r.ngay_giam_dinh)}{r.ktv_giam_dinh ? ` · ${r.ktv_giam_dinh}` : ''}</div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <span className={`whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-semibold border ${r.da_bao_gia ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                  {r.da_bao_gia ? 'Đã báo giá' : 'Chưa báo giá'}
                </span>
                <span className={`whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-semibold border ${r.da_thay ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                  {r.da_thay ? `Đã thay${r.so_report ? ` · ${r.so_report}` : ''}` : 'Chờ thay'}
                </span>
              </div>
            </div>

            {r.tinh_trang_may && <div className="text-xs text-slate-600">Tình trạng: {r.tinh_trang_may}{r.so_dem ? ` · Số đếm ${Number(r.so_dem).toLocaleString('vi-VN')}` : ''}</div>}

            {r.soct_giam_dinh_vat_tu?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {r.soct_giam_dinh_vat_tu.map((v: any) => (
                  <span key={v.id} className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1">
                    <span className="font-mono text-slate-700">{v.ma_hang}</span> {v.soct_kho_hang?.ten_hang || ''} <span className="text-slate-400">×{v.so_luong}</span>
                  </span>
                ))}
              </div>
            )}

            {closing && closing.id === r.id ? (
              <div className="flex items-end gap-2 flex-wrap border-t border-slate-100 pt-2">
                <div><label className="text-xs text-slate-500 block mb-1">Số phiếu *</label><Input value={closing.so_report} onChange={(e) => setClosing({ ...closing, so_report: e.target.value })} className="h-9 bg-white w-36" placeholder="VD: 956807" /></div>
                <div><label className="text-xs text-slate-500 block mb-1">Ngày thay</label><DateField value={closing.ngay_thay} onChange={(v) => setClosing({ ...closing, ngay_thay: v })} heightClass="h-9" className="w-36" /></div>
                <Button onClick={handleClose} className="h-9 bg-emerald-600 hover:bg-emerald-700">Xác nhận đã thay</Button>
                <Button variant="outline" onClick={() => setClosing(null)} className="h-9">Hủy</Button>
              </div>
            ) : (
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-2">
                {(r.soct_giam_dinh_vat_tu || []).length > 0 && (
                  <Button variant="outline" onClick={() => openQuote(r)} title="Làm báo giá" className="h-8 w-8 p-0 border-blue-200 text-blue-700 hover:bg-blue-50">
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button variant="outline" onClick={() => toggleBaoGia(r)} title={r.da_bao_gia ? 'Bỏ đánh dấu đã báo giá' : 'Đánh dấu đã báo giá'} className={`h-8 w-8 p-0 ${r.da_bao_gia ? 'text-slate-600' : 'border-blue-200 text-blue-700 hover:bg-blue-50'}`}><CheckCircle2 className="w-3.5 h-3.5" /></Button>
                {!r.da_thay && <Button variant="outline" onClick={() => setClosing({ id: r.id, so_report: r.so_report || "", ngay_thay: new Date().toISOString().split('T')[0] })} title="Đóng biên bản (đã thay vật tư)" className="h-8 w-8 p-0 border-emerald-200 text-emerald-700 hover:bg-emerald-50"><Wrench className="w-3.5 h-3.5" /></Button>}
                <button onClick={() => handleDelete(r.id)} className="text-red-500 hover:text-red-700 p-1.5 bg-red-50 hover:bg-red-100 rounded-md transition"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        ))}
        <Pagination page={gdPaged.page} pageCount={gdPaged.pageCount} total={gdPaged.total} perPage={gdPaged.perPage} onPage={gdPaged.setPage} />
      </div>
      )}

      {quoteGd && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Báo giá vật tư giám định</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Máy <b className="font-mono text-slate-700">{quoteGd.ma_may}</b>
                  {quoteGd.soct_khach_hang?.model ? ` · ${quoteGd.soct_khach_hang.model}` : ''}
                  {quoteGd.ngay_giam_dinh ? ` · giám định ${fmtDate(quoteGd.ngay_giam_dinh)}` : ''}
                  {' · giá gợi ý theo lần bán gần nhất, sửa được'}
                </p>
              </div>
              <button onClick={() => setQuoteGd(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>
            <div className="overflow-y-auto">
              <BaoGiaEditor
                rows={quoteRows}
                onRowsChange={setQuoteRows}
                khachHang={quoteKh}
                onKhachHangChange={setQuoteKh}
                diaChi={quoteDiaChi}
                onDiaChiChange={setQuoteDiaChi}
                showNotification={showNotification}
                emptyText="Biên bản này chưa có vật tư đề xuất thay."
                onExported={async () => {
                  if (!quoteGd.da_bao_gia) {
                    await fetch('/api/admin/giam-dinh', {
                      method: 'PUT', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id: quoteGd.id, da_bao_gia: true }),
                    })
                  }
                  setQuoteGd(null)
                  fetchRecords()
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
