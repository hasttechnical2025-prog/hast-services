"use client"

// Module Billing Máy thuê / CPC (admin). Độc lập hoàn toàn với Sổ công tác.
// 4 tab: Đơn giá HĐ · Nhập counter · Hợp đồng khung · Bảng kê (+ xuất Word).
import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import DateField from "@/components/DateField"
import { chotSoDate, counterStatus, CounterStatus } from "@/lib/thue-cpc"

const vnTodayStr = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
// Nhãn ngày chốt gọn cho bảng
const chotLabelShort = (r: any) => r.chot_so_cuoi_thang ? 'Cuối tháng' : (r.chot_so_ngay ? `Ngày ${r.chot_so_ngay}` : '—')
// Badge trạng thái lấy counter
const STATUS_BADGE: Record<CounterStatus, { label: (d: number) => string, cls: string }> = {
  done: { label: () => 'Đã lấy', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  overdue: { label: d => `Quá hạn ${d} ngày`, cls: 'bg-red-50 text-red-700 border-red-200' },
  due_soon: { label: d => d === 0 ? 'Đến ngày hôm nay' : `Còn ${d} ngày`, cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  not_yet: { label: d => `Còn ${d} ngày`, cls: 'bg-slate-50 text-slate-500 border-slate-200' },
  no_date: { label: () => 'Chưa đặt ngày chốt', cls: 'bg-slate-50 text-slate-400 border-slate-200' },
}
const STATUS_RANK: Record<CounterStatus, number> = { overdue: 0, due_soon: 1, not_yet: 2, no_date: 3, done: 4 }

type Notify = (type: 'success' | 'error', message: string) => void

const money = (v: any) => Math.round(Number(v) || 0).toLocaleString('vi-VN')
const fmtInt = (v: any) => (v === null || v === undefined || v === '' ? '—' : (Number(v) || 0).toLocaleString('vi-VN'))
const monthNow = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
// Bỏ dấu tiếng Việt để tìm kiếm fuzzy
const norm = (s: any) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()

// Ô nhập số có phân tách hàng nghìn (#.###). Lưu raw (chuỗi chỉ chứa chữ số), hiển thị có dấu chấm.
function NumInput({ value, onChange, className, placeholder }: { value: any, onChange: (raw: string) => void, className?: string, placeholder?: string }) {
  const raw = (value === null || value === undefined ? '' : String(value)).replace(/\D/g, '')
  const disp = raw ? Number(raw).toLocaleString('vi-VN') : ''
  return <Input inputMode="numeric" placeholder={placeholder} value={disp} onChange={e => onChange(e.target.value.replace(/\D/g, ''))} className={className} />
}

// Combobox tìm kiếm (fuzzy, bỏ dấu). options: {value,label}[]
function SearchSelect({ options, value, onChange, placeholder }: { options: { value: string, label: string }[], value: string, onChange: (v: string) => void, placeholder?: string }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const sel = options.find(o => o.value === value)
  const filtered = q ? options.filter(o => norm(o.label).includes(norm(q))) : options
  return (
    <div className="relative">
      <Input
        value={open ? q : (sel?.label || '')}
        placeholder={placeholder || 'Tìm & chọn…'}
        onChange={e => { setQ(e.target.value); if (!open) setOpen(true) }}
        onFocus={() => { setQ(''); setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="h-9"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-auto bg-white border border-slate-200 rounded-lg shadow-lg text-sm">
          {filtered.length === 0 && <div className="px-3 py-2 text-slate-400">Không tìm thấy</div>}
          {filtered.slice(0, 100).map(o => (
            <div key={o.value} onMouseDown={() => { onChange(o.value); setOpen(false) }} className={`px-3 py-1.5 cursor-pointer hover:bg-blue-50 ${o.value === value ? 'bg-blue-50 font-medium' : ''}`}>{o.label}</div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ThueCpcModule({ showNotification }: { showNotification: Notify }) {
  const [sub, setSub] = useState<'don_gia' | 'counter' | 'khung' | 'bang_ke'>('don_gia')
  const [dueCount, setDueCount] = useState(0) // số máy cần lấy counter kỳ hiện tại (badge tab)
  const tabs: [typeof sub, string][] = [
    ['don_gia', 'Đơn giá HĐ'],
    ['counter', 'Nhập counter'],
    ['khung', 'Hợp đồng khung'],
    ['bang_ke', 'Bảng kê'],
  ]
  // Đếm máy cần lấy counter tháng này để gắn badge lên tab
  useEffect(() => {
    const cur = monthNow()
    const today = vnTodayStr()
    fetch(`/api/admin/thue-cpc/counter?thang_nam=${cur}`).then(r => r.ok ? r.json() : { data: { rows: [] } }).then(j => {
      let n = 0
      for (const r of j.data?.rows || []) {
        const daNhap = r.so_bw != null || r.so_mau != null
        const s = counterStatus(chotSoDate(cur, r.chot_so_ngay, r.chot_so_cuoi_thang), daNhap, today).status
        if (s === 'overdue' || s === 'due_soon') n++
      }
      setDueCount(n)
    }).catch(() => { })
  }, [])
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit mb-5 overflow-x-auto">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)} className={`px-4 py-2 rounded-md font-medium text-sm transition whitespace-nowrap inline-flex items-center gap-1.5 ${sub === k ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
            {l}
            {k === 'counter' && dueCount > 0 && <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">{dueCount}</span>}
          </button>
        ))}
      </div>
      {sub === 'don_gia' && <DonGiaTab showNotification={showNotification} />}
      {sub === 'counter' && <CounterTab showNotification={showNotification} />}
      {sub === 'khung' && <KhungTab showNotification={showNotification} />}
      {sub === 'bang_ke' && <BangKeTab showNotification={showNotification} />}
    </div>
  )
}

// ============================ TAB 1: ĐƠN GIÁ HĐ ============================
function DonGiaTab({ showNotification }: { showNotification: Notify }) {
  const [rows, setRows] = useState<any[]>([])
  const [khung, setKhung] = useState<any[]>([])
  const [nvkd, setNvkd] = useState<string[]>([]) // danh sách NV Kinh doanh (danh mục)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<any | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch('/api/admin/thue-cpc/khach-hang').then(r => r.json()),
        fetch('/api/admin/thue-cpc/hop-dong-khung').then(r => r.json()),
        fetch('/api/admin/danh-muc?nhom=nv_kinh_doanh').then(r => r.json()),
      ])
      setRows(r1.data || [])
      setKhung(r2.data || [])
      setNvkd((r3.data || []).filter((d: any) => d.active).map((d: any) => d.gia_tri))
    } catch { showNotification('error', 'Không tải được danh sách máy thuê/CPC') }
    finally { setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = rows.filter(r => {
    const q = norm(search)
    if (!q) return true
    return norm(r.ten_khach_hang).includes(q) || norm(r.ma_may).includes(q) || norm(r.serial).includes(q) || norm(r.vi_tri_dat_may).includes(q) || norm(r.nv_kinh_doanh).includes(q)
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bold text-slate-800">Đơn giá & định mức hợp đồng thuê / CPC</h3>
          <p className="text-xs text-slate-500">Chỉ các máy có loại HĐ là <b>Máy thuê</b> hoặc <b>Máy CPC</b>.</p>
        </div>
        <Input placeholder="Tìm tên khách / mã máy / serial…" value={search} onChange={e => setSearch(e.target.value)} className="w-64 h-9" />
      </div>

      {loading ? <div className="text-sm text-slate-400 py-8 text-center">Đang tải…</div> : (
        <div className="overflow-x-auto border border-slate-100 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Khách hàng</th>
                <th className="px-3 py-2 text-left">Mã máy</th>
                <th className="px-3 py-2 text-left">Loại</th>
                <th className="px-3 py-2 text-right">Đơn giá Đen</th>
                <th className="px-3 py-2 text-right">Đơn giá Màu</th>
                <th className="px-3 py-2 text-right">Phí thuê/tháng</th>
                <th className="px-3 py-2 text-center">VAT</th>
                <th className="px-3 py-2 text-left">NV Kinh doanh</th>
                <th className="px-3 py-2 text-left">HĐ khung</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-slate-400">Không có máy nào.</td></tr>}
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-700">{r.ten_khach_hang}</div>
                    {r.vi_tri_dat_may && <div className="text-xs text-slate-400">{r.vi_tri_dat_may}</div>}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-500">
                    <div>{r.ma_may || '—'}</div>
                    {r.model && <div className="text-[10px] text-slate-400 font-sans">{r.model}</div>}
                    {r.serial && <div className="text-[10px] text-slate-400">SN: {r.serial}</div>}
                  </td>
                  <td className="px-3 py-2"><span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">{r.loai_hd}</span></td>
                  <td className="px-3 py-2 text-right">{money(r.don_gia_bw)}</td>
                  <td className="px-3 py-2 text-right">{money(r.don_gia_mau)}</td>
                  <td className="px-3 py-2 text-right">{r.phi_thue_thang == null ? '—' : money(r.phi_thue_thang)}</td>
                  <td className="px-3 py-2 text-center">{r.vat_thue_cpc ?? 8}%</td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{r.nv_kinh_doanh || <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{khung.find(k => k.id === r.id_hop_dong_khung)?.ten_hop_dong || '—'}</td>
                  <td className="px-3 py-2 text-right"><button onClick={() => setEditing(r)} className="text-blue-600 hover:underline text-xs font-medium">Sửa</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <DonGiaModal row={editing} khung={khung} nvkd={nvkd} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} showNotification={showNotification} />}
    </div>
  )
}

function DonGiaModal({ row, khung, nvkd, onClose, onSaved, showNotification }: { row: any, khung: any[], nvkd: string[], onClose: () => void, onSaved: () => void, showNotification: Notify }) {
  const [f, setF] = useState<any>({
    nv_kinh_doanh: row.nv_kinh_doanh ?? '',
    phi_thue_thang: row.phi_thue_thang ?? '', don_gia_bw: row.don_gia_bw ?? 0, don_gia_mau: row.don_gia_mau ?? 0,
    dinh_muc_mien_phi_bw: row.dinh_muc_mien_phi_bw ?? 0, dinh_muc_mien_phi_mau: row.dinh_muc_mien_phi_mau ?? 0,
    cam_ket_toi_thieu_bw: row.cam_ket_toi_thieu_bw ?? 0, cam_ket_toi_thieu_mau: row.cam_ket_toi_thieu_mau ?? 0,
    vat_thue_cpc: row.vat_thue_cpc ?? 8, trach_nhiem_ky_thuat: row.trach_nhiem_ky_thuat ?? 'Nội bộ',
    ten_doi_tac_ky_thuat: row.ten_doi_tac_ky_thuat ?? '', ngay_chot_so: row.ngay_chot_so ?? '',
    chot_pick: row.chot_so_cuoi_thang ? 'cuoi' : (row.chot_so_ngay ? String(row.chot_so_ngay) : ''),
    vi_tri_dat_may: row.vi_tri_dat_may ?? '', nguoi_lien_he: row.nguoi_lien_he ?? '', email: row.email ?? '',
    ngay_lap_may: row.ngay_lap_may ?? '', ngay_het_han_hdbt: row.ngay_het_han_hdbt ?? '',
    id_hop_dong_khung: row.id_hop_dong_khung ?? '', serial: row.serial ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      const chot = f.chot_pick === 'cuoi'
        ? { chot_so_ngay: null, chot_so_cuoi_thang: true }
        : (f.chot_pick ? { chot_so_ngay: parseInt(f.chot_pick, 10), chot_so_cuoi_thang: false } : { chot_so_ngay: null, chot_so_cuoi_thang: false })
      const res = await fetch('/api/admin/thue-cpc/khach-hang', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, ...f, ...chot }) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Lỗi lưu')
      showNotification('success', 'Đã lưu đơn giá hợp đồng')
      onSaved()
    } catch (e: any) { showNotification('error', e.message) }
    finally { setSaving(false) }
  }

  // plain=true: số thường (VAT %); mặc định: ô số #.### (đơn giá/phí/định mức/cam kết)
  const numField = (label: string, key: string, plain?: boolean) => (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {plain
        ? <Input type="number" value={f[key]} onChange={e => set(key, e.target.value)} className="h-9 mt-1" />
        : <NumInput value={f[key]} onChange={v => set(key, v)} className="h-9 mt-1" />}
    </label>
  )

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-800">Đơn giá HĐ — {row.ten_khach_hang}</h3>
            <p className="text-xs text-slate-500 font-mono">{row.ma_may} · {row.loai_hd}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none shrink-0" title="Đóng">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <label className="block md:col-span-2">
              <span className="text-xs font-medium text-slate-500">Serial máy</span>
              <Input value={f.serial} onChange={e => set('serial', e.target.value)} className="h-9 mt-1" placeholder="Serial thực của máy (nên có với máy thuê)" />
            </label>
            <div className="hidden md:block" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {numField('Đơn giá Đen (VNĐ/bản)', 'don_gia_bw')}
            {numField('Đơn giá Màu (VNĐ/bản)', 'don_gia_mau')}
            {numField('Phí thuê / tháng', 'phi_thue_thang')}
            {numField('Định mức miễn phí Đen', 'dinh_muc_mien_phi_bw')}
            {numField('Định mức miễn phí Màu', 'dinh_muc_mien_phi_mau')}
            {numField('VAT (%)', 'vat_thue_cpc', true)}
            {numField('Cam kết tối thiểu Đen', 'cam_ket_toi_thieu_bw')}
            {numField('Cam kết tối thiểu Màu', 'cam_ket_toi_thieu_mau')}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Trách nhiệm kỹ thuật</span>
              <select value={f.trach_nhiem_ky_thuat} onChange={e => set('trach_nhiem_ky_thuat', e.target.value)} className="h-9 mt-1 w-full rounded-md border border-slate-200 text-sm px-2 bg-white">
                <option value="Nội bộ">Nội bộ</option>
                <option value="Đối tác ngoài">Đối tác ngoài</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Tên đối tác KT</span>
              <Input value={f.ten_doi_tac_ky_thuat} onChange={e => set('ten_doi_tac_ky_thuat', e.target.value)} className="h-9 mt-1" placeholder="VD: BVN" disabled={f.trach_nhiem_ky_thuat !== 'Đối tác ngoài'} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Ngày chốt số</span>
              <select value={f.chot_pick} onChange={e => set('chot_pick', e.target.value)} className="h-9 mt-1 w-full rounded-md border border-slate-200 text-sm px-2 bg-white">
                <option value="">— Chưa đặt —</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={String(d)}>Ngày {d}</option>)}
                <option value="cuoi">Cuối tháng</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">NV Kinh doanh</span>
              <select value={f.nv_kinh_doanh || ''} onChange={e => set('nv_kinh_doanh', e.target.value)} className="h-9 mt-1 w-full rounded-md border border-slate-200 text-sm px-2 bg-white">
                <option value="">— Chưa gán —</option>
                {nvkd.map(v => <option key={v} value={v}>{v}</option>)}
                {f.nv_kinh_doanh && !nvkd.includes(f.nv_kinh_doanh) && <option value={f.nv_kinh_doanh}>{f.nv_kinh_doanh} (đã ẩn khỏi danh mục)</option>}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Hợp đồng khung</span>
              <select value={f.id_hop_dong_khung || ''} onChange={e => set('id_hop_dong_khung', e.target.value)} className="h-9 mt-1 w-full rounded-md border border-slate-200 text-sm px-2 bg-white">
                <option value="">— Không —</option>
                {khung.map(k => <option key={k.id} value={k.id}>{k.ten_hop_dong}</option>)}
              </select>
            </label>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Thông tin in bảng kê</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <label className="block col-span-2"><span className="text-xs font-medium text-slate-500">Vị trí đặt máy</span><Input value={f.vi_tri_dat_may} onChange={e => set('vi_tri_dat_may', e.target.value)} className="h-9 mt-1" /></label>
              <label className="block"><span className="text-xs font-medium text-slate-500">Người liên hệ</span><Input value={f.nguoi_lien_he} onChange={e => set('nguoi_lien_he', e.target.value)} className="h-9 mt-1" /></label>
              <label className="block"><span className="text-xs font-medium text-slate-500">Email</span><Input value={f.email} onChange={e => set('email', e.target.value)} className="h-9 mt-1" /></label>
              <label className="block col-span-2 md:col-span-1"><span className="text-xs font-medium text-slate-500">Ngày lắp máy</span><div className="mt-1"><DateField value={f.ngay_lap_may || ''} onChange={v => set('ngay_lap_may', v)} heightClass="h-9" /></div></label>
              <label className="block col-span-2 md:col-span-1"><span className="text-xs font-medium text-slate-500">Ngày hết hạn hợp đồng</span><div className="mt-1"><DateField value={f.ngay_het_han_hdbt || ''} onChange={v => set('ngay_het_han_hdbt', v)} heightClass="h-9" /></div></label>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="h-9">Hủy</Button>
          <Button onClick={save} disabled={saving} className="h-9 bg-blue-600 hover:bg-blue-700">{saving ? 'Đang lưu…' : 'Lưu'}</Button>
        </div>
      </div>
    </div>
  )
}

// ============================ TAB 2: NHẬP COUNTER ============================
function CounterTab({ showNotification }: { showNotification: Notify }) {
  const [thang, setThang] = useState(monthNow())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [edits, setEdits] = useState<Record<string, { so_bw: string, so_mau: string, ghi_chu: string }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [onlyDue, setOnlyDue] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const j = await fetch(`/api/admin/thue-cpc/counter?thang_nam=${thang}`).then(r => r.json())
      setData(j.data)
      const e: Record<string, any> = {}
      for (const r of j.data?.rows || []) e[r.id] = { so_bw: r.so_bw ?? '', so_mau: r.so_mau ?? '', ghi_chu: r.ghi_chu ?? '' }
      setEdits(e)
    } catch { showNotification('error', 'Không tải được counter') }
    finally { setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thang])
  useEffect(() => { load() }, [load])

  const saveRow = async (r: any) => {
    setSavingId(r.id)
    try {
      const e = edits[r.id]
      const res = await fetch('/api/admin/thue-cpc/counter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id_khach_hang: r.id, thang_nam: thang, ...e }) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Lỗi lưu')
      // Cập nhật lại dòng vừa lưu -> trạng thái chuyển sang "Đã lấy" ngay
      const bw = e.so_bw === '' || e.so_bw == null ? null : (parseInt(e.so_bw, 10) || 0)
      const mau = e.so_mau === '' || e.so_mau == null ? null : (parseInt(e.so_mau, 10) || 0)
      setData((prev: any) => prev ? { ...prev, rows: prev.rows.map((row: any) => row.id === r.id ? { ...row, so_bw: bw, so_mau: mau, ghi_chu: e.ghi_chu ?? '' } : row) } : prev)
      showNotification('success', `Đã lưu counter ${r.ten_khach_hang}`)
    } catch (e: any) { showNotification('error', e.message) }
    finally { setSavingId(null) }
  }
  const setEdit = (id: string, k: string, v: string) => setEdits(p => ({ ...p, [id]: { ...p[id], [k]: v } }))

  const rows = data?.rows || []
  const today = vnTodayStr()
  // Gắn trạng thái lấy counter cho kỳ đang chọn
  const withStatus = rows.map((r: any) => {
    const daNhap = r.so_bw != null || r.so_mau != null
    const chot = chotSoDate(thang, r.chot_so_ngay, r.chot_so_cuoi_thang)
    const st = counterStatus(chot, daNhap, today)
    return { r, st }
  })
  const counts = withStatus.reduce((a: any, x: any) => { a[x.st.status] = (a[x.st.status] || 0) + 1; return a }, {})
  const canLay = (counts.overdue || 0) + (counts.due_soon || 0)
  const filtered = withStatus
    .filter(({ r, st }: any) => {
      const q = norm(search)
      const okQ = !q || norm(r.ten_khach_hang).includes(q) || norm(r.ma_may).includes(q) || norm(r.serial).includes(q) || norm(r.vi_tri_dat_may).includes(q)
      const okDue = !onlyDue || st.status === 'overdue' || st.status === 'due_soon'
      return okQ && okDue
    })
    .sort((a: any, b: any) => (STATUS_RANK[a.st.status as CounterStatus] - STATUS_RANK[b.st.status as CounterStatus]) || (a.r.ten_khach_hang || '').localeCompare(b.r.ten_khach_hang || ''))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bold text-slate-800">Nhập counter hàng tháng</h3>
          <p className="text-xs text-slate-500">Độc lập với Sổ công tác. Nhập chỉ số công-tơ cuối kỳ; cột <b>Kỳ trước</b> là đầu kỳ tham khảo.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input placeholder="Tìm khách / mã máy / serial / vị trí…" value={search} onChange={e => setSearch(e.target.value)} className="w-64 h-9" />
          <label className="flex items-center gap-2 text-sm text-slate-600">Kỳ
            <input type="month" value={thang} onChange={e => setThang(e.target.value)} className="h-9 px-3 rounded-md border border-slate-200 text-sm bg-white" />
          </label>
        </div>
      </div>

      {/* Banner nhắc lấy counter */}
      {!loading && canLay > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-lg">🔔</span>
          <div className="text-sm text-amber-800 flex-1 min-w-0">
            <b>{canLay} máy</b> cần lấy counter kỳ {thang}
            {(counts.overdue || 0) > 0 && <span className="ml-1">— <b className="text-red-600">{counts.overdue} quá hạn</b></span>}
            {(counts.due_soon || 0) > 0 && <span className="ml-1 text-amber-700">· {counts.due_soon} sắp đến ngày</span>}
            <span className="text-amber-600"> · đã lấy {counts.done || 0}/{rows.length}</span>
          </div>
          <button onClick={() => setOnlyDue(o => !o)} className={`h-8 px-3 rounded-lg text-xs font-semibold border ${onlyDue ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-amber-700 border-amber-300'}`}>
            {onlyDue ? 'Đang lọc: chỉ máy cần lấy' : 'Chỉ hiện máy cần lấy'}
          </button>
        </div>
      )}

      {loading ? <div className="text-sm text-slate-400 py-8 text-center">Đang tải…</div> : (
        <div className="overflow-x-auto border border-slate-100 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Khách hàng</th>
                <th className="px-3 py-2 text-left">Mã máy</th>
                <th className="px-3 py-2 text-center">Ngày chốt</th>
                <th className="px-3 py-2 text-left">Trạng thái</th>
                <th className="px-3 py-2 text-right">Đen kỳ trước</th>
                <th className="px-3 py-2 text-left">Đen kỳ này</th>
                <th className="px-3 py-2 text-right">Màu kỳ trước</th>
                <th className="px-3 py-2 text-left">Màu kỳ này</th>
                <th className="px-3 py-2 text-left">Ghi chú</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-slate-400">{rows.length === 0 ? 'Không có máy thuê/CPC.' : (onlyDue ? 'Không có máy cần lấy.' : 'Không khớp tìm kiếm.')}</td></tr>}
              {filtered.map(({ r, st }: any) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-700">{r.ten_khach_hang}{r.trach_nhiem_ky_thuat === 'Đối tác ngoài' && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">{r.ten_doi_tac_ky_thuat || 'Đối tác'}</span>}</div>
                    {r.vi_tri_dat_may && <div className="text-xs text-slate-400">{r.vi_tri_dat_may}</div>}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-500">
                    <div>{r.ma_may || '—'}</div>
                    {r.model && <div className="text-[10px] text-slate-400 font-sans">{r.model}</div>}
                    {r.serial && <div className="text-[10px] text-slate-400">SN: {r.serial}</div>}
                  </td>
                  <td className="px-3 py-2 text-center whitespace-nowrap text-slate-500">{chotLabelShort(r)}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${STATUS_BADGE[st.status as CounterStatus].cls}`}>{STATUS_BADGE[st.status as CounterStatus].label(st.days)}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-400">{fmtInt(r.so_bw_truoc)}</td>
                  <td className="px-3 py-2"><NumInput value={edits[r.id]?.so_bw ?? ''} onChange={v => setEdit(r.id, 'so_bw', v)} className="h-8 w-28" /></td>
                  <td className="px-3 py-2 text-right text-slate-400">{fmtInt(r.so_mau_truoc)}</td>
                  <td className="px-3 py-2"><NumInput value={edits[r.id]?.so_mau ?? ''} onChange={v => setEdit(r.id, 'so_mau', v)} className="h-8 w-28" /></td>
                  <td className="px-3 py-2"><Input value={edits[r.id]?.ghi_chu ?? ''} onChange={e => setEdit(r.id, 'ghi_chu', e.target.value)} className="h-8 w-40" /></td>
                  <td className="px-3 py-2 text-right"><Button onClick={() => saveRow(r)} disabled={savingId === r.id} className="h-8 text-xs bg-blue-600 hover:bg-blue-700">{savingId === r.id ? '…' : 'Lưu'}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ============================ TAB 3: HỢP ĐỒNG KHUNG ============================
// Hộp thoại xác nhận tự thiết kế (thay confirm() của trình duyệt)
function ConfirmDialog({ open, title, message, confirmLabel, danger, busy, onConfirm, onCancel }: { open: boolean, title: string, message: string, confirmLabel?: string, danger?: boolean, busy?: boolean, onConfirm: () => void, onCancel: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="p-5">
          <div className="flex items-start gap-3">
            {danger && <div className="w-9 h-9 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0 text-lg">⚠</div>}
            <div>
              <h3 className="font-bold text-slate-800">{title}</h3>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">{message}</p>
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy} className="h-9">Hủy</Button>
          <Button onClick={onConfirm} disabled={busy} className={`h-9 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>{busy ? 'Đang xử lý…' : (confirmLabel || 'Xác nhận')}</Button>
        </div>
      </div>
    </div>
  )
}

function KhungTab({ showNotification }: { showNotification: Notify }) {
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<any>({ ten_hop_dong: '', phi_co_ban: 0, vat_thue_cpc: 8, ghi_chu: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState<any | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { const j = await fetch('/api/admin/thue-cpc/hop-dong-khung').then(r => r.json()); setList(j.data || []) }
    catch { showNotification('error', 'Không tải được hợp đồng khung') }
    finally { setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { load() }, [load])

  const reset = () => { setForm({ ten_hop_dong: '', phi_co_ban: 0, vat_thue_cpc: 8, ghi_chu: '' }); setEditingId(null) }
  const save = async () => {
    if (!form.ten_hop_dong.trim()) { showNotification('error', 'Nhập tên hợp đồng'); return }
    setSaving(true)
    try {
      const method = editingId ? 'PUT' : 'POST'
      const body = editingId ? { id: editingId, ...form } : form
      const res = await fetch('/api/admin/thue-cpc/hop-dong-khung', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Lỗi lưu')
      showNotification('success', editingId ? 'Đã cập nhật' : 'Đã tạo hợp đồng khung')
      reset(); load()
    } catch (e: any) { showNotification('error', e.message) }
    finally { setSaving(false) }
  }
  const doDelete = async () => {
    if (!confirmDel) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/thue-cpc/hop-dong-khung?id=${confirmDel.id}`, { method: 'DELETE' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Lỗi xóa')
      showNotification('success', 'Đã xóa'); setConfirmDel(null); load()
    } catch (e: any) { showNotification('error', e.message) }
    finally { setDeleting(false) }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-bold text-slate-800">Hợp đồng khung (gộp nhiều máy → 1 bảng kê)</h3>
        <p className="text-xs text-slate-500">Phí cơ bản cố định + phí thuê riêng của máy phát sinh thêm. Gán máy vào khung ở tab <b>Đơn giá HĐ</b>.</p>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-lg p-4">
        <p className="text-sm font-semibold text-slate-600 mb-3">{editingId ? 'Sửa hợp đồng khung' : 'Thêm hợp đồng khung'}</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="block md:col-span-2"><span className="text-xs font-medium text-slate-500">Tên hợp đồng</span><Input value={form.ten_hop_dong} onChange={e => setForm({ ...form, ten_hop_dong: e.target.value })} className="h-9 mt-1" placeholder="VD: ĐH Anh Quốc" /></label>
          <label className="block"><span className="text-xs font-medium text-slate-500">Phí cơ bản / tháng</span><NumInput value={form.phi_co_ban} onChange={v => setForm({ ...form, phi_co_ban: v })} className="h-9 mt-1" /></label>
          <label className="block"><span className="text-xs font-medium text-slate-500">VAT (%)</span><Input type="number" value={form.vat_thue_cpc} onChange={e => setForm({ ...form, vat_thue_cpc: e.target.value })} className="h-9 mt-1" /></label>
          <label className="block md:col-span-4"><span className="text-xs font-medium text-slate-500">Ghi chú</span><Input value={form.ghi_chu} onChange={e => setForm({ ...form, ghi_chu: e.target.value })} className="h-9 mt-1" /></label>
        </div>
        <div className="flex gap-2 mt-3">
          <Button onClick={save} disabled={saving} className="h-9 bg-blue-600 hover:bg-blue-700">{saving ? 'Đang lưu…' : (editingId ? 'Cập nhật' : 'Thêm')}</Button>
          {editingId && <Button variant="outline" onClick={reset} className="h-9">Hủy</Button>}
        </div>
      </div>

      {loading ? <div className="text-sm text-slate-400 py-6 text-center">Đang tải…</div> : (
        <div className="space-y-3">
          {list.length === 0 && <div className="text-sm text-slate-400 text-center py-4">Chưa có hợp đồng khung nào.</div>}
          {list.map(k => (
            <div key={k.id} className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-bold text-slate-800">{k.ten_hop_dong}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Phí cơ bản: <b>{money(k.phi_co_ban)}</b> · VAT {k.vat_thue_cpc}%{k.ghi_chu ? ` · ${k.ghi_chu}` : ''}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditingId(k.id); setForm({ ten_hop_dong: k.ten_hop_dong, phi_co_ban: k.phi_co_ban, vat_thue_cpc: k.vat_thue_cpc, ghi_chu: k.ghi_chu || '' }) }} className="text-blue-600 hover:underline text-xs font-medium">Sửa</button>
                  <button onClick={() => setConfirmDel(k)} className="text-red-600 hover:underline text-xs font-medium">Xóa</button>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Máy trong khung ({k.mays?.length || 0}): {k.mays?.length ? k.mays.map((m: any) => `${m.ten_khach_hang}${m.ma_may ? ` (${m.ma_may})` : ''}`).join(', ') : '— chưa gán máy nào —'}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        danger
        busy={deleting}
        title="Xóa hợp đồng khung?"
        message={confirmDel ? `Xóa "${confirmDel.ten_hop_dong}"? Các máy đang gán vào khung này sẽ được bỏ gán (không xóa máy).` : ''}
        confirmLabel="Xóa"
        onConfirm={doDelete}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  )
}

// ============================ TAB 4: BẢNG KÊ ============================
function BangKeTab({ showNotification }: { showNotification: Notify }) {
  const [thang, setThang] = useState(monthNow())
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mays, setMays] = useState<any[]>([])
  const [khung, setKhung] = useState<any[]>([])
  const [loai, setLoai] = useState<'rieng' | 'gop'>('rieng')
  const [target, setTarget] = useState('')
  const [soHd, setSoHd] = useState('')
  const [creating, setCreating] = useState(false)
  const [chanTrang, setChanTrang] = useState(true)
  const [detail, setDetail] = useState<any | null>(null)
  const [confirmDel, setConfirmDel] = useState<any | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try { const j = await fetch(`/api/admin/thue-cpc/bang-ke?thang_nam=${thang}`).then(r => r.json()); setList(j.data || []) }
    catch { showNotification('error', 'Không tải được bảng kê') }
    finally { setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thang])
  useEffect(() => { loadList() }, [loadList])
  useEffect(() => {
    Promise.all([
      fetch('/api/admin/thue-cpc/khach-hang').then(r => r.json()),
      fetch('/api/admin/thue-cpc/hop-dong-khung').then(r => r.json()),
    ]).then(([a, b]) => { setMays(a.data || []); setKhung(b.data || []) }).catch(() => { })
  }, [])

  const create = async () => {
    if (!target) { showNotification('error', loai === 'rieng' ? 'Chọn khách hàng' : 'Chọn hợp đồng khung'); return }
    setCreating(true)
    try {
      const body: any = { thang_nam: thang, loai, so_hoa_don_ke_toan: soHd }
      if (loai === 'rieng') body.id_khach_hang = target; else body.id_hop_dong_khung = target
      const res = await fetch('/api/admin/thue-cpc/bang-ke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Lỗi tạo bảng kê')
      showNotification('success', `Đã tạo bảng kê — Tổng sau VAT: ${money(j.data.tong_sau_vat)}`)
      setTarget(''); setSoHd(''); loadList()
    } catch (e: any) { showNotification('error', e.message) }
    finally { setCreating(false) }
  }
  const doDelete = async () => {
    if (!confirmDel) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/thue-cpc/bang-ke?id=${confirmDel.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || 'Lỗi xóa')
      showNotification('success', 'Đã xóa'); setConfirmDel(null); loadList()
    } catch (e: any) { showNotification('error', e.message) }
    finally { setDeleting(false) }
  }
  const exportUrl = (id: string) => `/api/admin/thue-cpc/bang-ke/export?id=${id}&chan_trang=${chanTrang ? '1' : '0'}`

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-bold text-slate-800">Bảng kê thanh toán</h3>
        <label className="flex items-center gap-2 text-sm text-slate-600">Kỳ
          <input type="month" value={thang} onChange={e => setThang(e.target.value)} className="h-9 px-3 rounded-md border border-slate-200 text-sm bg-white" />
        </label>
      </div>

      {/* Tạo bảng kê */}
      <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-600">Tạo bảng kê mới ({thang})</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Loại</span>
            <select value={loai} onChange={e => { setLoai(e.target.value as any); setTarget('') }} className="h-9 mt-1 w-40 rounded-md border border-slate-200 text-sm px-2 bg-white block">
              <option value="rieng">Riêng (1 máy)</option>
              <option value="gop">Gộp (HĐ khung)</option>
            </select>
          </label>
          <label className="block flex-1 min-w-[260px]">
            <span className="text-xs font-medium text-slate-500">{loai === 'rieng' ? 'Khách hàng / máy' : 'Hợp đồng khung'}</span>
            <div className="mt-1">
              <SearchSelect
                value={target}
                onChange={setTarget}
                placeholder={loai === 'rieng' ? 'Tìm khách / mã máy / vị trí…' : 'Tìm hợp đồng khung…'}
                options={loai === 'rieng'
                  ? mays.map(m => ({ value: m.id, label: `${m.ten_khach_hang}${m.ma_may ? ` (${m.ma_may})` : ''}${m.serial ? ` · SN ${m.serial}` : ''}${m.vi_tri_dat_may ? ` · ${m.vi_tri_dat_may}` : ''}` }))
                  : khung.map(k => ({ value: k.id, label: k.ten_hop_dong }))}
              />
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Số HĐ (tùy chọn)</span>
            <Input value={soHd} onChange={e => setSoHd(e.target.value)} className="h-9 mt-1 w-40" />
          </label>
          <Button onClick={create} disabled={creating} className="h-9 bg-blue-600 hover:bg-blue-700">{creating ? 'Đang tính…' : 'Tạo bảng kê'}</Button>
        </div>
      </div>

      {/* Danh sách bảng kê */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-600 ml-auto">
          <input type="checkbox" checked={chanTrang} onChange={e => setChanTrang(e.target.checked)} /> Hiện phần chữ ký khi xuất Word
        </label>
      </div>
      {loading ? <div className="text-sm text-slate-400 py-6 text-center">Đang tải…</div> : (
        <div className="overflow-x-auto border border-slate-100 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Đối tượng</th>
                <th className="px-3 py-2 text-left">Loại</th>
                <th className="px-3 py-2 text-right">Trước VAT</th>
                <th className="px-3 py-2 text-center">VAT</th>
                <th className="px-3 py-2 text-right">Sau VAT</th>
                <th className="px-3 py-2 text-left">Số HĐ</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">Chưa có bảng kê nào cho kỳ {thang}.</td></tr>}
              {list.map(b => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-700">{b.loai === 'gop' ? (b.soct_thue_cpc_hop_dong_khung?.ten_hop_dong || '—') : (b.soct_khach_hang?.ten_khach_hang || '—')}</td>
                  <td className="px-3 py-2 text-xs">{b.loai === 'gop' ? 'Gộp' : 'Riêng'}</td>
                  <td className="px-3 py-2 text-right">{money(b.tong_truoc_vat)}</td>
                  <td className="px-3 py-2 text-center">{b.vat_rate}%</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800">{money(b.tong_sau_vat)}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{b.so_hoa_don_ke_toan || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setDetail(b.id)} className="text-slate-600 hover:underline text-xs font-medium">Xem</button>
                      <a href={exportUrl(b.id)} className="text-emerald-600 hover:underline text-xs font-medium">Tải Word</a>
                      <button onClick={() => setConfirmDel(b)} className="text-red-600 hover:underline text-xs font-medium">Xóa</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && <BangKeDetail id={detail} onClose={() => setDetail(null)} showNotification={showNotification} onChanged={loadList} />}

      <ConfirmDialog
        open={!!confirmDel}
        danger
        busy={deleting}
        title="Xóa bảng kê?"
        message={confirmDel ? `Xóa bảng kê ${confirmDel.loai === 'gop' ? (confirmDel.soct_thue_cpc_hop_dong_khung?.ten_hop_dong || '') : (confirmDel.soct_khach_hang?.ten_khach_hang || '')} kỳ ${thang}? Không thể hoàn tác.` : ''}
        confirmLabel="Xóa"
        onConfirm={doDelete}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  )
}

function BangKeDetail({ id, onClose, showNotification, onChanged }: { id: string, onClose: () => void, showNotification: Notify, onChanged: () => void }) {
  const [bk, setBk] = useState<any | null>(null)
  const [soHd, setSoHd] = useState('')
  useEffect(() => {
    fetch(`/api/admin/thue-cpc/bang-ke?id=${id}`).then(r => r.json()).then(j => { setBk(j.data); setSoHd(j.data?.so_hoa_don_ke_toan || '') }).catch(() => { })
  }, [id])
  const saveSoHd = async () => {
    try {
      const res = await fetch('/api/admin/thue-cpc/bang-ke', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, so_hoa_don_ke_toan: soHd }) })
      if (!res.ok) throw new Error((await res.json()).error || 'Lỗi')
      showNotification('success', 'Đã lưu số hóa đơn'); onChanged()
    } catch (e: any) { showNotification('error', e.message) }
  }
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-8">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Chi tiết bảng kê {bk?.thang_nam}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        {!bk ? <div className="p-6 text-center text-slate-400 text-sm">Đang tải…</div> : (
          <div className="p-5 space-y-4">
            <div className="text-sm text-slate-600">
              Đối tượng: <b>{bk.loai === 'gop' ? bk.soct_thue_cpc_hop_dong_khung?.ten_hop_dong : bk.soct_khach_hang?.ten_khach_hang}</b> · Loại: {bk.loai === 'gop' ? 'Gộp' : 'Riêng'}
            </div>
            <div className="overflow-x-auto border border-slate-100 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase">
                  <tr><th className="px-2 py-1.5 text-left">Máy</th><th className="px-2 py-1.5 text-right">Đen ĐK</th><th className="px-2 py-1.5 text-right">Đen CK</th><th className="px-2 py-1.5 text-right">Đen tính phí</th><th className="px-2 py-1.5 text-right">Màu ĐK</th><th className="px-2 py-1.5 text-right">Màu CK</th><th className="px-2 py-1.5 text-right">Màu tính phí</th><th className="px-2 py-1.5 text-right">Tiền in</th><th className="px-2 py-1.5 text-right">Phí thuê</th><th className="px-2 py-1.5 text-right">Thành tiền</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(bk.ct || []).map((c: any) => (
                    <tr key={c.id}>
                      <td className="px-2 py-1.5">{c.soct_khach_hang?.ten_khach_hang}{c.soct_khach_hang?.ma_may ? ` (${c.soct_khach_hang.ma_may})` : ''}</td>
                      <td className="px-2 py-1.5 text-right">{fmtInt(c.so_bw_dau_ky)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtInt(c.so_bw_cuoi_ky)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtInt(c.so_bw_tinh_phi)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtInt(c.so_mau_dau_ky)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtInt(c.so_mau_cuoi_ky)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtInt(c.so_mau_tinh_phi)}</td>
                      <td className="px-2 py-1.5 text-right">{money(c.tien_ban_in)}</td>
                      <td className="px-2 py-1.5 text-right">{money(c.phi_thue_co_dinh)}</td>
                      <td className="px-2 py-1.5 text-right font-medium">{money(c.thanh_tien)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-6 text-sm">
              <div>Tổng trước VAT: <b>{money(bk.tong_truoc_vat)}</b></div>
              <div>VAT: <b>{bk.vat_rate}%</b></div>
              <div>Tổng sau VAT: <b className="text-blue-700">{money(bk.tong_sau_vat)}</b></div>
            </div>
            <div className="flex items-end gap-2 border-t border-slate-100 pt-3">
              <label className="block"><span className="text-xs font-medium text-slate-500">Số hóa đơn GTGT (kế toán)</span><Input value={soHd} onChange={e => setSoHd(e.target.value)} className="h-9 mt-1 w-56" /></label>
              <Button onClick={saveSoHd} variant="outline" className="h-9">Lưu số HĐ</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
