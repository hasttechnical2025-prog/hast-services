'use client'
// Bản v2 của "Vật tư tiêu hao máy thuê" (port từ /admin MucMayThueTool + MucRow).
// Tự fetch mucMap qua /api/admin/muc-may-thue; dữ liệu customers/inventory/committed lấy từ useShared.
// Bỏ header tiêu đề (đã có tên tab). Giữ nguyên nghiệp vụ: gán Mực/Trống theo model + định lượng + counter.
import { useState, useEffect, useCallback } from 'react'
import { X, Droplets } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { SearchInput } from '@/ui'
import { MaterialCombobox } from '@/features/giao-viec/MaterialCombobox'

// Nhãn counter theo loại (dùng cho cả bản sửa và bản chỉ-đọc)
const LOAI_LABEL: Record<string, string> = { bw: 'BW', mau: 'Màu', tong: 'Tổng' }

function MucRow({ r, inv, kd, busy, onSave, onRemove, readOnly }: {
  r: any; inv: any; kd: number; busy: boolean; readOnly?: boolean
  onSave: (id: string, dinh_luong: string, loai: string, nhom: string, dinh_luong_dau: string) => void; onRemove: (id: string) => void
}) {
  const [dl, setDl] = useState<string>(r.dinh_luong != null ? String(r.dinh_luong) : '')
  const [dlDau, setDlDau] = useState<string>(r.dinh_luong_dau != null ? String(r.dinh_luong_dau) : '')
  const [loai, setLoai] = useState<string>(r.loai || 'bw')
  const [nhom, setNhom] = useState<string>(r.nhom || 'muc')
  const dirty = (dl !== (r.dinh_luong != null ? String(r.dinh_luong) : '')) || (dlDau !== (r.dinh_luong_dau != null ? String(r.dinh_luong_dau) : '')) || (loai !== (r.loai || 'bw')) || (nhom !== (r.nhom || 'muc'))
  // BẢN CHỈ-ĐỌC (office): tất cả control -> chữ/badge tĩnh. Giữ "Có sẵn N" (đỏ nếu ≤0).
  if (readOnly) {
    const groupTrong = (r.nhom || 'muc') === 'trong'
    return (
      <div className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${kd <= 0 ? 'bg-red-50/60 border-red-200' : groupTrong ? 'bg-violet-100 border-violet-300' : 'bg-slate-50 border-slate-200'}`}>
        <span className="font-mono font-semibold text-slate-700 shrink-0">{r.ma_hang}</span>
        <span className="text-slate-600 truncate min-w-0 flex-1" title={inv?.ten_hang}>{inv?.ten_hang || '—'}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          <span className={`px-1.5 py-0.5 rounded-full border font-semibold ${groupTrong ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>{groupTrong ? 'Trống' : 'Mực'}</span>
          <span className="text-slate-600 whitespace-nowrap" title="Định lượng: số trang/hộp mực thay (nhà SX)">{r.dinh_luong ? `${Number(r.dinh_luong).toLocaleString('vi-VN')} tr/hộp` : <span className="text-slate-400 italic">chưa có định lượng</span>}</span>
          {r.dinh_luong_dau ? <span className="text-amber-700 whitespace-nowrap" title="Dung lượng hộp theo máy (factory) lắp lúc lắp máy">(hộp máy {Number(r.dinh_luong_dau).toLocaleString('vi-VN')})</span> : null}
          <span className="px-1.5 py-0.5 rounded-full border bg-slate-100 text-slate-600 border-slate-200 font-medium" title="Counter tính theo">{LOAI_LABEL[r.loai || 'bw'] || 'BW'}</span>
          <span className={`whitespace-nowrap font-semibold ${kd <= 0 ? 'text-red-600' : 'text-slate-400'}`} title="Số lượng còn dùng được = tồn kho − đang giữ">{kd <= 0 ? '⚠ ' : ''}Có sẵn {kd}</span>
        </span>
      </div>
    )
  }
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${kd <= 0 ? 'bg-red-50/60 border-red-200' : nhom === 'trong' ? 'bg-violet-100 border-violet-300' : 'bg-slate-50 border-slate-200'}`}>
      <span className="font-mono font-semibold text-slate-700 shrink-0">{r.ma_hang}</span>
      <span className="text-slate-600 truncate min-w-0 flex-1" title={inv?.ten_hang}>{inv?.ten_hang || '—'}</span>
      <span className="text-slate-400 shrink-0 whitespace-nowrap" title="Số lượng còn dùng được = tồn kho − đang giữ">Có sẵn {kd}</span>
      <span className="flex items-center gap-1.5 shrink-0">
        <select value={nhom} onChange={(e) => setNhom(e.target.value)} title="Nhóm vật tư" className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs">
          <option value="muc">Mực</option>
          <option value="trong">Trống</option>
        </select>
        <Input value={dl ? Number(dl).toLocaleString('vi-VN') : ''} onChange={(e) => setDl(e.target.value.replace(/\D/g, ''))} placeholder="Định lượng" title="Số trang/hộp mực thay (nhà SX)" className="h-7 w-24 text-right bg-white" inputMode="numeric" />
        <Input value={dlDau ? Number(dlDau).toLocaleString('vi-VN') : ''} onChange={(e) => setDlDau(e.target.value.replace(/\D/g, ''))} placeholder="Hộp theo máy" title="Dung lượng HỘP THEO MÁY lắp lúc lắp máy (factory) — thường nhỏ hơn, vd Fuji ~9.000. Để trống = dùng như Định lượng." className="h-7 w-24 text-right bg-amber-50/60 border-amber-200" inputMode="numeric" />
        <select value={loai} onChange={(e) => setLoai(e.target.value)} title="Counter tính theo" className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs">
          <option value="bw">BW</option>
          <option value="mau">Màu</option>
          <option value="tong">Tổng</option>
        </select>
        {dirty && <button type="button" disabled={busy} onClick={() => onSave(r.id, dl, loai, nhom, dlDau)} className="h-7 px-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold">Lưu</button>}
        <button type="button" disabled={busy} onClick={() => onRemove(r.id)} className="hover:bg-red-100 rounded p-1 text-slate-400 hover:text-red-600" title="Bỏ vật tư"><X className="w-3.5 h-3.5" /></button>
      </span>
    </div>
  )
}

export default function MucMayThueTool({ customers, inventory, committed, showNotification, readOnly }: {
  customers: any[], inventory: any[], committed: Record<string, number>,
  showNotification: (t: 'success' | 'error', m: string) => void, readOnly?: boolean
}) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [mucMap, setMucMap] = useState<any[]>([])

  const fetchMucMap = useCallback(() => {
    fetch('/api/admin/muc-may-thue')
      .then(r => r.ok ? r.json() : [])
      .then(d => setMucMap(Array.isArray(d) ? d : (d.data || d.items || [])))
      .catch(() => {})
  }, [])
  useEffect(() => { fetchMucMap() }, [fetchMucMap])

  // Model máy thuê/CPC (distinct) + số máy.
  const models = (() => {
    const m = new Map<string, number>()
    for (const c of customers) {
      if (['Máy thuê', 'Máy CPC'].includes(String(c.loai_hd || '').trim()) && c.model && String(c.model).trim()) {
        const k = String(c.model).trim()
        m.set(k, (m.get(k) || 0) + 1)
      }
    }
    return [...m.entries()].map(([model, so]) => ({ model, so })).sort((a, b) => a.model.localeCompare(b.model))
  })()
  const ql = q.trim().toLowerCase()
  const shown = ql ? models.filter(m => m.model.toLowerCase().includes(ql)) : models
  // Sắp CỐ ĐỊNH trong mỗi model: Mực trước, Trống sau; rồi theo mã hàng -> không "nhảy" khi thêm/refetch.
  const maByModel = (model: string) => mucMap.filter(r => r.model_may === model)
    .slice().sort((a, b) => String(a.nhom || 'muc').localeCompare(String(b.nhom || 'muc')) || String(a.ma_hang).localeCompare(String(b.ma_hang)))

  const addMuc = async (model: string, ma_hang: string) => {
    if (!ma_hang) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/muc-may-thue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model_may: model, ma_hang }) })
      if (res.ok) { fetchMucMap() } else { const j = await res.json(); showNotification('error', j.error || 'Không thêm được') }
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setBusy(false) }
  }
  const removeMuc = async (id: string) => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/muc-may-thue?id=' + encodeURIComponent(id), { method: 'DELETE' })
      if (res.ok) { fetchMucMap() } else showNotification('error', 'Không xóa được')
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setBusy(false) }
  }
  const saveYield = async (id: string, dinh_luong: string, loai: string, nhom: string, dinh_luong_dau: string) => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/muc-may-thue', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, dinh_luong, loai, nhom, dinh_luong_dau }) })
      if (res.ok) { showNotification('success', 'Đã lưu định lượng vật tư.'); fetchMucMap() } else { const j = await res.json(); showNotification('error', j.error || 'Lỗi lưu') }
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <p className="text-xs text-slate-500 flex items-start gap-1.5 flex-1 min-w-[260px]">
          <Droplets className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          {readOnly
            ? <span>Định mức vật tư tiêu hao (<b>Mực</b>/<b>Trống</b>) theo từng model máy thuê — <b>định lượng</b> (trang/hộp), <b>counter theo</b> (BW/Màu/Tổng) và <b>tồn khả dụng</b>. Dùng để hệ thống cảnh báo khi sắp cần thay. <i>Chỉ xem.</i></span>
            : <span>Gán mã vật tư (<b>Mực</b>/<b>Trống</b>) cho từng model + <b>định lượng</b> (trang/hộp) &amp; <b>counter theo</b> (BW/Màu/Tổng) để cảnh báo sắp cần thay. Khả dụng ≤ 0 → chuông cảnh báo tồn. <i>Trống đen máy màu → Tổng; trống màu → Màu; máy đen trắng → BW.</i></span>}
        </p>
        <SearchInput value={q} onChange={setQ} placeholder="Tìm model máy..." className="w-full sm:w-64" />
      </div>
      <div className="space-y-2">
        {shown.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">{models.length === 0 ? 'Chưa có model máy thuê/CPC nào.' : 'Không có model khớp tìm kiếm.'}</p>
        ) : shown.map(({ model, so }) => {
          const rows = maByModel(model)
          return (
            <div key={model} className="bg-white border border-slate-200 rounded-lg p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-slate-800">{model}</span>
                <span className="text-xs text-slate-500">{so} máy</span>
              </div>
              <div className="space-y-1.5 mb-2">
                {rows.length === 0 ? <span className="text-xs text-slate-400 italic">Chưa gán mực</span> : rows.map((r: any) => {
                  const inv = inventory.find(i => i.ma_hang === r.ma_hang)
                  const kd = (Number(inv?.ton_kho) || 0) - (committed[r.ma_hang] || 0)
                  return <MucRow key={r.id} r={r} inv={inv} kd={kd} busy={busy} onSave={saveYield} onRemove={removeMuc} readOnly={readOnly} />
                })}
              </div>
              {!readOnly && (
                <div className="max-w-md">
                  <MaterialCombobox inventory={inventory} value="" onChange={(ma) => addMuc(model, ma)} committed={committed} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
