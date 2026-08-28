"use client"

// Module Billing Máy thuê / CPC (admin). Độc lập hoàn toàn với Sổ công tác.
// 2 tab: "Danh sách máy" (Đơn giá HĐ + Hợp đồng khung — thiết lập) · "Nhập counter"
// (nhập chỉ số + ước tính tiền live + Tổng doanh số theo NV/kỹ thuật + Bảng kê/xuất Word/Đẩy Kanban).
import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import DateField from "@/components/DateField"
import MonthField from "@/components/MonthField"
import { chotSoDate, counterStatus, CounterStatus, kyTruoc, tinhDongMay } from "@/lib/thue-cpc"
import { useRealtimeRefetch } from "@/lib/useRealtime"
import { Save, FileText, RefreshCw, ArrowRight, Check, PenSquare } from "lucide-react"

const THUECPC_TOPIC = "soct_thuecpc"
const DATA_EVENT = "changed"

// Màu badge loại HĐ — Máy thuê vs Máy CPC dùng màu khác nhau cho dễ nhận biết
const loaiHdBadgeCls = (loai: string | null | undefined) =>
  loai === 'Máy CPC' ? 'bg-amber-50 text-amber-700 border-amber-200'
    : loai === 'Máy thuê' ? 'bg-violet-50 text-violet-700 border-violet-200'
      : 'bg-slate-100 text-slate-600 border-slate-200'

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
const monthNow = () => {
  const d = new Date()
  if (d.getDate() <= 20) {
    // Mẹo an toàn: Đưa ngày về mùng 1 trước khi lùi tháng để tránh lỗi tràn lịch JS
    d.setDate(1)
    d.setMonth(d.getMonth() - 1)
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
// Bỏ dấu tiếng Việt để tìm kiếm fuzzy
const norm = (s: any) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()

// Ô nhập số có phân tách hàng nghìn (#.###). Lưu raw (chuỗi chỉ chứa chữ số), hiển thị có dấu chấm.
function NumInput({ value, onChange, className, placeholder, disabled, title }: { value: any, onChange: (raw: string) => void, className?: string, placeholder?: string, disabled?: boolean, title?: string }) {
  const raw = (value === null || value === undefined ? '' : String(value)).replace(/\D/g, '')
  const disp = raw ? Number(raw).toLocaleString('vi-VN') : ''
  return <Input inputMode="numeric" placeholder={placeholder} title={title} disabled={disabled} value={disp} onChange={e => onChange(e.target.value.replace(/\D/g, ''))} className={className} />
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

export default function ThueCpcModule({ showNotification, canSub }: { showNotification: Notify, canSub?: (g: string) => boolean }) {
  const canS = canSub || (() => true)
  const [sub, setSub] = useState<'danh_sach' | 'counter'>('danh_sach')
  const [dueCount, setDueCount] = useState(0) // số máy cần lấy counter (badge tab) — theo kỳ đang chọn
  const [counterThang, setCounterThang] = useState(monthNow()) // kỳ đang chọn ở tab Nhập counter (nâng lên để badge bám theo)
  const [badgeVer, setBadgeVer] = useState(0) // tăng sau mỗi lần lưu counter -> badge tính lại
  const [refreshVer, setRefreshVer] = useState(0) // realtime: tăng khi có thay đổi -> BÁO NHẸ cho CounterTab (KHÔNG remount, tránh trôi danh sách đang nhập)
  useRealtimeRefetch(THUECPC_TOPIC, DATA_EVENT, () => { setRefreshVer(v => v + 1); setBadgeVer(v => v + 1) })
  // Gộp 4 tab cháu cũ -> 2: "Danh sách máy" (đơn giá + hợp đồng khung), "Nhập counter" (counter + bảng kê).
  // Quyền giữ theo key cũ: mỗi tab mới hiện nếu có ÍT NHẤT một phần con được phép.
  const allTabs: [typeof sub, string, boolean][] = [
    ['danh_sach', 'Danh sách máy', canS('don_gia') || canS('khung')],
    ['counter', 'Nhập counter', canS('counter') || canS('bang_ke')],
  ]
  const tabs = allTabs.filter(([, , ok]) => ok)
  const active = tabs.some(([k]) => k === sub) ? sub : (tabs[0]?.[0] ?? sub)
  // Đếm máy cần lấy counter cho KỲ ĐANG CHỌN để gắn badge lên tab
  useEffect(() => {
    const today = vnTodayStr()
    fetch(`/api/admin/thue-cpc/counter?thang_nam=${counterThang}`).then(r => r.ok ? r.json() : { data: { rows: [] } }).then(j => {
      let n = 0
      for (const r of j.data?.rows || []) {
        const daNhap = r.so_bw != null || r.so_mau != null
        const s = counterStatus(chotSoDate(counterThang, r.chot_so_ngay, r.chot_so_cuoi_thang), daNhap, today).status
        if (s === 'overdue' || s === 'due_soon') n++
      }
      setDueCount(n)
    }).catch(() => { })
  }, [counterThang, badgeVer])
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit mb-5 overflow-x-auto">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)} className={`px-4 py-2 rounded-md font-medium text-sm transition whitespace-nowrap inline-flex items-center gap-1.5 ${active === k ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
            {l}
            {k === 'counter' && dueCount > 0 && <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">{dueCount}</span>}
          </button>
        ))}
      </div>
      {active === 'danh_sach' && (
        <div className="space-y-8">
          {canS('don_gia') && <DonGiaTab showNotification={showNotification} />}
          {canS('khung') && <div className="pt-2 border-t border-slate-100"><KhungTab showNotification={showNotification} /></div>}
        </div>
      )}
      {active === 'counter' && (
        <div className="space-y-8">
          {canS('counter') && <CounterTab showNotification={showNotification} thang={counterThang} setThang={setCounterThang} onSaved={() => setBadgeVer(v => v + 1)} refreshVer={refreshVer} />}
          {canS('bang_ke') && <div className="pt-2 border-t border-slate-100"><BangKeTab showNotification={showNotification} thang={counterThang} refreshVer={refreshVer} /></div>}
        </div>
      )}
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
                <th className="px-3 py-2 text-right">Thao tác</th>
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
                  <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full border ${loaiHdBadgeCls(r.loai_hd)}`}>{r.loai_hd}</span></td>
                  <td className="px-3 py-2 text-right">{money(r.don_gia_bw)}</td>
                  <td className="px-3 py-2 text-right">{money(r.don_gia_mau)}</td>
                  <td className="px-3 py-2 text-right">{r.phi_thue_thang == null ? '—' : money(r.phi_thue_thang)}</td>
                  <td className="px-3 py-2 text-center">{r.vat_thue_cpc ?? 8}%</td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{r.nv_kinh_doanh || <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{khung.find(k => k.id === r.id_hop_dong_khung)?.ten_hop_dong || '—'}</td>
                  <td className="px-3 py-2 text-right"><button onClick={() => setEditing(r)} title="Sửa" className="text-blue-500 hover:text-blue-700 p-1.5 bg-blue-50 hover:bg-blue-100 rounded-md transition"><PenSquare className="w-4 h-4" /></button></td>
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
    kieu_ky: row.kieu_ky ?? 'thang', ten_may_hd: row.ten_may_hd ?? '',
    vi_tri_dat_may: row.vi_tri_dat_may ?? '', nguoi_lien_he: row.nguoi_lien_he ?? '', email: row.email ?? '',
    ngay_lap_may: row.ngay_lap_may ?? '', ngay_het_han_hdbt: row.ngay_het_han_hdbt ?? '',
    id_hop_dong_khung: row.id_hop_dong_khung ?? '', serial: row.serial ?? '',
    // Chưa xác định (null) -> coi như máy màu, không khóa gì
    may_mau: row.may_mau !== false,
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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div>
            <h3 className="font-bold text-slate-800">Đơn giá HĐ — {row.ten_khach_hang}</h3>
            <p className="text-xs text-slate-500 font-mono">{row.ma_may} · {row.loai_hd}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none shrink-0" title="Đóng">✕</button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* NHÓM 1 — Thông tin máy + Đơn giá & định mức (gộp 1 khối, 4 cột cho gọn chiều cao) */}
          <section>
            <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Thông tin máy · Đơn giá</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="block lg:col-span-2">
                <span className="text-xs font-medium text-slate-500">Serial máy</span>
                <Input value={f.serial} onChange={e => set('serial', e.target.value)} className="h-9 mt-1" placeholder="Serial thực của máy (nên có với máy thuê)" />
              </label>
              <label className="block lg:col-span-2">
                <span className="text-xs font-medium text-slate-500">Loại máy</span>
                <select value={f.may_mau ? 'mau' : 'den'} onChange={e => set('may_mau', e.target.value === 'mau')} className="h-9 mt-1 w-full rounded-md border border-slate-200 text-sm px-2 bg-white">
                  <option value="mau">Máy màu</option>
                  <option value="den">Máy đen trắng</option>
                </select>
                <span className="text-[10px] text-slate-400">Đen trắng → khóa ô counter Màu</span>
              </label>
              {numField('Đơn giá Đen (VNĐ/bản)', 'don_gia_bw')}
              {numField('Đơn giá Màu (VNĐ/bản)', 'don_gia_mau')}
              {numField('Phí thuê / tháng', 'phi_thue_thang')}
              {numField('VAT (%)', 'vat_thue_cpc', true)}
              {numField('Định mức miễn phí Đen', 'dinh_muc_mien_phi_bw')}
              {numField('Định mức miễn phí Màu', 'dinh_muc_mien_phi_mau')}
              {numField('Cam kết tối thiểu Đen', 'cam_ket_toi_thieu_bw')}
              {numField('Cam kết tối thiểu Màu', 'cam_ket_toi_thieu_mau')}
            </div>

            {/* Định mức miễn phí và cam kết tối thiểu là 2 kiểu HĐ khác nhau — 1 máy chỉ nên có 1
                trong 2 (theo cùng loại đen/màu). Nhập cả 2 thường là nhầm; cảnh báo để rà lại
                (không chặn cứng). Nếu vẫn lưu cả 2, hệ thống ưu tiên CAM KẾT tối thiểu. */}
            {(() => {
              const nz = (v: any) => Number(v) > 0
              const conflictBw = nz(f.dinh_muc_mien_phi_bw) && nz(f.cam_ket_toi_thieu_bw)
              const conflictMau = nz(f.dinh_muc_mien_phi_mau) && nz(f.cam_ket_toi_thieu_mau)
              if (!conflictBw && !conflictMau) return null
              const loai = [conflictBw ? 'Đen' : '', conflictMau ? 'Màu' : ''].filter(Boolean).join(' và ')
              return (
                <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  ⚠ Loại <b>{loai}</b> đang có <b>cả</b> Định mức miễn phí <b>và</b> Cam kết tối thiểu — một máy chỉ nên theo <b>một</b> kiểu. Vui lòng kiểm tra lại. (Nếu vẫn lưu, hệ thống ưu tiên <b>Cam kết tối thiểu</b>.)
                </div>
              )
            })()}
          </section>

          {/* NHÓM 2 — Cấu hình hợp đồng (kỹ thuật · kinh doanh · kỳ chốt số) */}
          <section className="border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Cấu hình hợp đồng</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Ngày chốt số</span>
                <select value={f.chot_pick} onChange={e => set('chot_pick', e.target.value)} className="h-9 mt-1 w-full rounded-md border border-slate-200 text-sm px-2 bg-white">
                  <option value="">— Chưa đặt —</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={String(d)}>Ngày {d}</option>)}
                  <option value="cuoi">Cuối tháng</option>
                </select>
              </label>
              <label className="block lg:col-span-3">
                <span className="text-xs font-medium text-slate-500">Cách ghi kỳ (dòng thuê máy)</span>
                <select value={f.kieu_ky} onChange={e => set('kieu_ky', e.target.value)} className="h-9 mt-1 w-full rounded-md border border-slate-200 text-sm px-2 bg-white">
                  <option value="thang">Tháng M/YYYY</option>
                  <option value="tu_den">Từ ngày … đến ngày (tự tính theo chốt số)</option>
                </select>
                <span className="text-[10px] text-slate-400">Chọn &quot;Từ ngày…đến ngày&quot; cho khách chốt số giữa tháng — tự nhảy kỳ mỗi tháng.</span>
              </label>
            </div>
          </section>

          <section className="border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Thông tin in bảng kê</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <label className="block col-span-2 md:col-span-4">
                <span className="text-xs font-medium text-slate-500">Tên máy trên hóa đơn</span>
                <Input value={f.ten_may_hd} onChange={e => set('ten_may_hd', e.target.value)} className="h-9 mt-1" placeholder={`Để trống = dùng model (${row.model || 'model máy'}). VD: Konica Minolta bizhub C258`} />
                <span className="text-[10px] text-slate-400">Ghi vào dòng &quot;Dịch vụ thuê máy …&quot;. Cho phép thêm hãng tùy ý (Konica / Konica Minolta) — đặt 1 lần, dùng mãi.</span>
              </label>
              <label className="block col-span-2"><span className="text-xs font-medium text-slate-500">Vị trí đặt máy</span><Input value={f.vi_tri_dat_may} onChange={e => set('vi_tri_dat_may', e.target.value)} className="h-9 mt-1" /></label>
              <label className="block"><span className="text-xs font-medium text-slate-500">Người liên hệ</span><Input value={f.nguoi_lien_he} onChange={e => set('nguoi_lien_he', e.target.value)} className="h-9 mt-1" /></label>
              <label className="block"><span className="text-xs font-medium text-slate-500">Email liên hệ (in bảng kê)</span><Input value={f.email} onChange={e => set('email', e.target.value)} className="h-9 mt-1" placeholder="Email người liên hệ — KHÁC email nhận hóa đơn" title="Email này CHỈ in trên bảng kê Thuê/CPC (liên hệ). Email nhận HÓA ĐƠN khai ở Khách cụm / điểm máy." /></label>
              <label className="block col-span-2 md:col-span-1"><span className="text-xs font-medium text-slate-500">Ngày lắp máy</span><div className="mt-1"><DateField value={f.ngay_lap_may || ''} onChange={v => set('ngay_lap_may', v)} heightClass="h-9" /></div></label>
              <label className="block col-span-2 md:col-span-1"><span className="text-xs font-medium text-slate-500">Ngày hết hạn hợp đồng</span><div className="mt-1"><DateField value={f.ngay_het_han_hdbt || ''} onChange={v => set('ngay_het_han_hdbt', v)} heightClass="h-9" /></div></label>
            </div>
          </section>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={onClose} className="h-9">Hủy</Button>
          <Button onClick={save} disabled={saving} className="h-9 bg-blue-600 hover:bg-blue-700">{saving ? 'Đang lưu…' : 'Lưu'}</Button>
        </div>
      </div>
    </div>
  )
}

// ============================ TAB 2: NHẬP COUNTER ============================
function CounterTab({ showNotification, thang, setThang, onSaved, refreshVer = 0 }: { showNotification: Notify, thang: string, setThang: (v: string) => void, onSaved: () => void, refreshVer?: number }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [edits, setEdits] = useState<Record<string, { so_bw: string, so_mau: string, ghi_chu: string }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [pushingId, setPushingId] = useState<string | null>(null)      // đang đẩy Kanban
  const [bkByMaMay, setBkByMaMay] = useState<Record<string, any>>({})   // bảng kê RIÊNG của kỳ theo mã máy (suy trạng thái kỳ)
  const [pending, setPending] = useState(false)                         // có cập nhật từ máy khác -> banner
  const lastActionRef = useRef(0)                                       // mốc thao tác của CHÍNH máy này (để bỏ qua echo broadcast)
  const [search, setSearch] = useState('')
  const [onlyDue, setOnlyDue] = useState(false)
  const [nvFilter, setNvFilter] = useState('all') // 'all' (mặc định) | 'ky_thuat' | tên NV cụ thể
  const [showGhiChu, setShowGhiChu] = useState(false) // cột Ghi chú mặc định ẩn (ít dùng, đỡ tràn bảng)

  // Máy thuộc KỸ THUẬT = NV kinh doanh = "Kỹ thuật" HOẶC để trống.
  const laKyThuat = (r: any) => { const nv = String(r.nv_kinh_doanh || '').trim(); return nv === '' || nv === 'Kỹ thuật' }
  // TRẠNG THÁI KỲ của 1 máy (chân lý an toàn cho kthc + user theo dõi): suy từ counter + bảng kê + phiếu.
  const kyStatus = (r: any): { key: string, label: string, cls: string } => {
    if (r.id_hop_dong_khung) return { key: 'khung', label: 'HĐ khung', cls: 'bg-violet-50 text-violet-700 border-violet-200' }
    const hasCounter = r.so_bw != null || r.so_mau != null
    const bk = bkByMaMay[r.ma_may]
    if (!bk) return hasCounter
      ? { key: 'da_chot', label: 'Đã chốt số', cls: 'bg-blue-50 text-blue-700 border-blue-200' }
      : { key: 'chua_chot', label: 'Chưa chốt', cls: 'bg-slate-50 text-slate-500 border-slate-200' }
    if (!bk.id_cong_viec) return { key: 'da_lap', label: 'Đã lập BK', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
    const p = bk.soct_cong_viec
    if (p?.so_hoa_don || p?.trang_thai_hd === 'Đã lên hóa đơn' || p?.trang_thai_hd === 'Đã thanh toán')
      return { key: 'da_hd', label: 'Đã lên HĐ', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    return { key: 'da_day', label: 'Đã đẩy kế toán', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' }
  }
  // Ước tính tiền kỳ này của 1 máy LẺ (không thuộc HĐ khung) — dùng đúng công thức server (tinhDongMay).
  const uocTinh = (r: any) => {
    if (r.id_hop_dong_khung) return null // máy thuộc HĐ khung -> tính ở bảng kê gộp bên dưới
    const e = edits[r.id] || {} as any
    const pInt = (v: any) => (v === '' || v == null ? null : (parseInt(String(v), 10) || 0))
    const cThis = { so_bw: pInt(e.so_bw), so_mau: r.may_mau === false ? null : pInt(e.so_mau) }
    const cPrev = { so_bw: r.so_bw_truoc, so_mau: r.so_mau_truoc }
    return tinhDongMay({
      id: r.id,
      don_gia_bw: r.don_gia_bw, don_gia_mau: r.don_gia_mau,
      dinh_muc_mien_phi_bw: r.dinh_muc_mien_phi_bw, dinh_muc_mien_phi_mau: r.dinh_muc_mien_phi_mau,
      cam_ket_toi_thieu_bw: r.cam_ket_toi_thieu_bw, cam_ket_toi_thieu_mau: r.cam_ket_toi_thieu_mau,
      phi_thue_thang: r.phi_thue_thang, vat_thue_cpc: r.vat_thue_cpc,
    }, cThis, cPrev)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const j = await fetch(`/api/admin/thue-cpc/counter?thang_nam=${thang}`).then(r => r.json())
      setData(j.data)
      const e: Record<string, any> = {}
      for (const r of j.data?.rows || []) e[r.id] = { so_bw: r.so_bw ?? '', so_mau: r.so_mau ?? '', ghi_chu: r.ghi_chu ?? '' }
      setEdits(e)
      // Nạp bảng kê RIÊNG của kỳ theo mã máy -> suy trạng thái kỳ (lập BK / đã đẩy / đã lên HĐ).
      try {
        const bk = await fetch(`/api/admin/thue-cpc/bang-ke?thang_nam=${thang}`).then(r => r.json())
        const m: Record<string, any> = {}
        for (const b of bk.data || []) if (b.loai === 'rieng' && b.soct_khach_hang?.ma_may) m[b.soct_khach_hang.ma_may] = b
        setBkByMaMay(m)
      } catch { /* không chặn nếu lỗi */ }
      setPending(false)
    } catch { showNotification('error', 'Không tải được counter') }
    finally { setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thang])
  useEffect(() => { load() }, [load])
  // Realtime: có thay đổi -> BÁO NHẸ (banner), KHÔNG tự tải lại. Bỏ qua "echo" của chính thao tác vừa rồi (<2.5s).
  useEffect(() => {
    if (refreshVer === 0) return
    if (Date.now() - lastActionRef.current < 2500) return
    setPending(true)
  }, [refreshVer])

  const saveRow = async (r: any) => {
    setSavingId(r.id)
    lastActionRef.current = Date.now() // đánh dấu thao tác của mình -> bỏ qua echo broadcast
    try {
      // Máy đen trắng: không lưu counter màu (kể cả giá trị cũ còn sót trong state)
      const e = r.may_mau === false ? { ...edits[r.id], so_mau: '' } : edits[r.id]
      const res = await fetch('/api/admin/thue-cpc/counter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id_khach_hang: r.id, thang_nam: thang, ...e }) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Lỗi lưu')
      // Cập nhật lại dòng vừa lưu -> trạng thái chuyển sang "Đã lấy" ngay
      const bw = e.so_bw === '' || e.so_bw == null ? null : (parseInt(e.so_bw, 10) || 0)
      const mau = e.so_mau === '' || e.so_mau == null ? null : (parseInt(e.so_mau, 10) || 0)
      setData((prev: any) => prev ? { ...prev, rows: prev.rows.map((row: any) => row.id === r.id ? { ...row, so_bw: bw, so_mau: mau, ghi_chu: e.ghi_chu ?? '' } : row) } : prev)
      onSaved() // cập nhật lại badge trên tab
      showNotification('success', `Đã lưu counter ${r.ten_khach_hang}`)
    } catch (e: any) { showNotification('error', e.message) }
    finally { setSavingId(null) }
  }

  // Tải Word KHÔNG phá bảng kê đã đẩy (giữ trạng thái an toàn):
  //  - Đã đẩy (có phiếu) -> tải ĐÚNG bảng kê đã đẩy (không tạo lại -> không làm mất link, không tạo phiếu trùng).
  //  - Chưa đẩy -> làm mới bảng kê theo counter hiện tại (xóa+tạo an toàn vì chưa có phiếu) rồi tải.
  //  - Chưa có -> tạo rồi tải.
  const exportQuick = async (r: any) => {
    setExportingId(r.id)
    lastActionRef.current = Date.now()
    try {
      const listRes = await fetch(`/api/admin/thue-cpc/bang-ke?thang_nam=${thang}`).then(res => res.json())
      const existing = (listRes.data || []).find((b: any) => b.loai === 'rieng' && b.soct_khach_hang?.ma_may === r.ma_may)
      let bkId: string
      if (existing?.id_cong_viec) {
        bkId = existing.id // ĐÃ ĐẨY -> giữ nguyên, chỉ tải
      } else {
        if (existing) await fetch(`/api/admin/thue-cpc/bang-ke?id=${existing.id}`, { method: 'DELETE' }) // chưa đẩy -> làm mới
        const createRes = await fetch('/api/admin/thue-cpc/bang-ke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thang_nam: thang, loai: 'rieng', id_khach_hang: r.id }) })
        const createData = await createRes.json()
        if (!createRes.ok) throw new Error(createData.error || 'Lỗi tạo bảng kê')
        bkId = createData.data.id
        setBkByMaMay(m => ({ ...m, [r.ma_may]: createData.data })) // cập nhật trạng thái -> "Đã lập BK"
      }
      const a = document.createElement('a')
      a.href = `/api/admin/thue-cpc/bang-ke/export?id=${bkId}&chan_trang=0`
      a.click()
      showNotification('success', existing?.id_cong_viec ? 'Đã tải bảng kê (bản đã đẩy).' : 'Đã lập & tải bảng kê.')
    } catch (err: any) {
      showNotification('error', err.message || 'Lỗi xuất bảng kê')
    } finally {
      setExportingId(null)
    }
  }

  // Đẩy sang Kanban IN-PLACE: đảm bảo có bảng kê rieng phản ánh counter hiện tại rồi tạo phiếu Kanban.
  // Đã đẩy trước đó (bảng kê có id_cong_viec) -> đánh dấu, không tạo trùng. KHÔNG tải lại cả danh sách.
  const pushKanban = async (r: any) => {
    setPushingId(r.id)
    lastActionRef.current = Date.now()
    try {
      const listRes = await fetch(`/api/admin/thue-cpc/bang-ke?thang_nam=${thang}`).then(res => res.json())
      const existing = (listRes.data || []).find((b: any) => b.loai === 'rieng' && b.soct_khach_hang?.ma_may === r.ma_may)
      if (existing?.id_cong_viec) { // đã đẩy trước đó -> đồng bộ trạng thái, KHÔNG đẩy lại (chống trùng)
        setBkByMaMay(m => ({ ...m, [r.ma_may]: existing }))
        showNotification('success', `${r.ten_khach_hang} đã đẩy Kanban trước đó`)
        return
      }
      // Chưa đẩy: làm mới bảng kê theo counter hiện tại rồi đẩy
      let bkId = existing?.id
      if (existing) await fetch(`/api/admin/thue-cpc/bang-ke?id=${existing.id}`, { method: 'DELETE' })
      const createRes = await fetch('/api/admin/thue-cpc/bang-ke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thang_nam: thang, loai: 'rieng', id_khach_hang: r.id }) })
      const createData = await createRes.json()
      if (!createRes.ok) throw new Error(createData.error || 'Lỗi tạo bảng kê')
      bkId = createData.data.id
      const res = await fetch('/api/admin/thue-cpc/bang-ke/day-kanban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: bkId }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Lỗi đẩy Kanban')
      // Cập nhật trạng thái TẠI CHỖ -> "Đã đẩy kế toán" (không tải lại cả danh sách)
      setBkByMaMay(m => ({ ...m, [r.ma_may]: { ...createData.data, id_cong_viec: d.id_cong_viec, soct_cong_viec: { trang_thai_hd: 'Chờ xuất HĐ', so_hoa_don: null } } }))
      showNotification('success', `Đã đẩy ${r.ten_khach_hang} sang Kanban cho kế toán`)
    } catch (err: any) {
      showNotification('error', err.message || 'Lỗi đẩy Kanban')
    } finally {
      setPushingId(null)
    }
  }

  const setEdit = (id: string, k: string, v: string) => setEdits(p => ({ ...p, [id]: { ...p[id], [k]: v } }))

  const rows = data?.rows || []
  const today = vnTodayStr()
  // Nhãn cột theo ĐÚNG kỳ đang chọn (tránh user quên đang ở kỳ nào): "Đen kỳ T7" / "Đen kỳ T6"
  const thangLabel = (ym: string) => { const m = parseInt((ym || '').split('-')[1], 10); return m ? `T${m}` : 'trước' }
  const tThis = thangLabel(thang)
  const tPrev = thangLabel(kyTruoc(thang))
  // Gắn trạng thái lấy counter cho kỳ đang chọn
  const withStatus = rows.map((r: any) => {
    const daNhap = r.so_bw != null || r.so_mau != null
    const chot = chotSoDate(thang, r.chot_so_ngay, r.chot_so_cuoi_thang)
    const st = counterStatus(chot, daNhap, today)
    return { r, st }
  })
  const counts = withStatus.reduce((a: any, x: any) => { a[x.st.status] = (a[x.st.status] || 0) + 1; return a }, {})
  const canLay = (counts.overdue || 0) + (counts.due_soon || 0)
  // Danh sách NV kinh doanh (cho bộ lọc doanh số)
  const nvList: string[] = Array.from(new Set(rows.map((r: any) => String(r.nv_kinh_doanh || '').trim()).filter((v: string) => v && v !== 'Kỹ thuật'))) as string[]
  nvList.sort()
  const okNv = (r: any) => nvFilter === 'all' || (nvFilter === 'ky_thuat' ? laKyThuat(r) : String(r.nv_kinh_doanh || '').trim() === nvFilter)
  // Tổng ước tính theo bộ lọc NV — CHỈ máy lẻ (HĐ khung tính riêng ở Bảng kê gộp).
  const tongUocTinh = rows.filter((r: any) => okNv(r) && !r.id_hop_dong_khung)
    .reduce((s: number, r: any) => s + (uocTinh(r)?.thanh_tien || 0), 0)
  const soMayLoc = rows.filter((r: any) => okNv(r)).length
  const filtered = withStatus
    .filter(({ r, st }: any) => {
      const q = norm(search)
      const okQ = !q || norm(r.ten_khach_hang).includes(q) || norm(r.ma_may).includes(q) || norm(r.serial).includes(q) || norm(r.vi_tri_dat_may).includes(q)
      const okDue = !onlyDue || st.status === 'overdue' || st.status === 'due_soon'
      return okQ && okDue && okNv(r)
    })
    .sort((a: any, b: any) => (STATUS_RANK[a.st.status as CounterStatus] - STATUS_RANK[b.st.status as CounterStatus]) || (a.r.ten_khach_hang || '').localeCompare(b.r.ten_khach_hang || ''))

  return (
    <div className="space-y-4">
      {/* Realtime báo NHẸ: có thay đổi từ máy khác -> người dùng chủ động tải lại (không tự trôi danh sách đang nhập) */}
      {pending && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 flex items-center gap-3 text-sm text-blue-800">
          <RefreshCw className="w-4 h-4" />
          <span className="flex-1">Có cập nhật mới từ nơi khác.</span>
          <button onClick={() => load()} className="h-8 px-3 rounded-md bg-blue-600 text-white text-xs font-semibold">Tải lại</button>
          <button onClick={() => setPending(false)} className="text-blue-400 hover:text-blue-600 text-xs">Bỏ qua</button>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bold text-slate-800">Nhập counter hàng tháng</h3>
          <p className="text-xs text-slate-500">Nhập chỉ số cuối kỳ; số nhỏ dưới ô là <b>đầu kỳ</b> (kỳ trước) tham khảo.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input placeholder="Tìm khách / mã máy / serial / vị trí…" value={search} onChange={e => setSearch(e.target.value)} className="w-56 h-9" />
          <button onClick={() => setShowGhiChu(v => !v)} className={`h-9 px-3 rounded-md text-xs font-medium border whitespace-nowrap ${showGhiChu ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-500 border-slate-200'}`} title="Bật/tắt cột Ghi chú">Ghi chú</button>
          <label className="flex items-center gap-2 text-sm text-slate-600">Kỳ
            <MonthField value={thang} onChange={setThang} className="h-9 w-40" />
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

      {/* Tổng ước tính theo Nhân viên phụ trách (mặc định Kỹ thuật) — chỉ máy lẻ; HĐ khung tính ở Bảng kê */}
      {!loading && (
        <div className="flex items-center gap-3 flex-wrap bg-slate-50 border border-slate-100 rounded-lg px-4 py-3">
          <label className="text-sm text-slate-600 flex items-center gap-2">Doanh số nhóm
            <select value={nvFilter} onChange={e => setNvFilter(e.target.value)} className="h-9 rounded-md border border-slate-200 text-sm px-2 bg-white">
              <option value="all">Tất cả</option>
              <option value="ky_thuat">Kỹ thuật</option>
              {nvList.map((nv: string) => <option key={nv} value={nv}>{nv}</option>)}
            </select>
          </label>
          <div className="ml-auto text-right">
            <div className="text-[11px] text-slate-500">Tổng ước tính kỳ {thang} · {soMayLoc} máy</div>
            <div className="text-xl font-bold text-blue-700">{tongUocTinh.toLocaleString('vi-VN')} đ</div>
          </div>
        </div>
      )}
      {!loading && nvFilter !== 'all' && <p className="text-[11px] text-slate-400 -mt-2">Tổng chỉ tính máy LẺ; máy thuộc Hợp đồng khung tính ở phần Bảng kê bên dưới.</p>}

      {loading ? <div className="text-sm text-slate-400 py-8 text-center">Đang tải…</div> : (
        <div className="overflow-x-auto border border-slate-100 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left min-w-[180px]">Khách hàng</th>
                <th className="px-3 py-2 text-left">Mã máy</th>
                <th className="px-3 py-2 text-center">Ngày chốt</th>
                <th className="px-3 py-2 text-left">Trạng thái</th>
                <th className="px-3 py-2 text-left">Đen kỳ {tThis}</th>
                <th className="px-3 py-2 text-left">Màu kỳ {tThis}</th>
                {showGhiChu && <th className="px-3 py-2 text-left">Ghi chú</th>}
                <th className="px-3 py-2 text-right">Ước tính kỳ</th>
                <th className="px-3 py-2 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && <tr><td colSpan={showGhiChu ? 9 : 8} className="px-3 py-6 text-center text-slate-400">{rows.length === 0 ? 'Không có máy thuê/CPC.' : (onlyDue ? 'Không có máy cần lấy.' : 'Không khớp tìm kiếm.')}</td></tr>}
              {filtered.map(({ r, st }: any) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-700">{r.ten_khach_hang}{r.trach_nhiem_ky_thuat === 'Đối tác ngoài' && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">{r.ten_doi_tac_ky_thuat || 'Đối tác'}</span>}</div>
                    {r.vi_tri_dat_may && <div className="text-xs text-slate-400">{r.vi_tri_dat_may}</div>}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-500">
                    <div>{r.ma_may || '—'}</div>
                    {/* Model tô màu để nhìn phát biết liền: máy MÀU = tím hồng, ĐEN TRẮNG = xám đậm */}
                    {r.model && <div className={`text-[10px] font-sans font-semibold ${r.may_mau === false ? 'text-slate-500' : 'text-fuchsia-600'}`} title={r.may_mau === false ? 'Máy đen trắng' : 'Máy màu'}>{r.model}</div>}
                    {r.serial && <div className="text-[10px] text-slate-400">SN: {r.serial}</div>}
                  </td>
                  <td className="px-3 py-2 text-center whitespace-nowrap text-slate-500">{chotLabelShort(r)}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${STATUS_BADGE[st.status as CounterStatus].cls}`}>{STATUS_BADGE[st.status as CounterStatus].label(st.days)}</span>
                  </td>
                  <td className="px-3 py-2">
                    <NumInput value={edits[r.id]?.so_bw ?? ''} onChange={v => setEdit(r.id, 'so_bw', v)} className="h-8 w-24" />
                    <div className="text-[10px] text-slate-400 mt-0.5">đầu kỳ: {fmtInt(r.so_bw_truoc)}</div>
                  </td>
                  <td className="px-3 py-2">
                    <NumInput value={r.may_mau === false ? '' : (edits[r.id]?.so_mau ?? '')} onChange={v => setEdit(r.id, 'so_mau', v)}
                      disabled={r.may_mau === false} title={r.may_mau === false ? 'Máy đen trắng — không có counter màu' : undefined}
                      className={`h-8 w-24 ${r.may_mau === false ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`} />
                    <div className="text-[10px] text-slate-400 mt-0.5">{r.may_mau === false ? 'máy đen trắng' : `đầu kỳ: ${fmtInt(r.so_mau_truoc)}`}</div>
                  </td>
                  {showGhiChu && <td className="px-3 py-2"><Input value={edits[r.id]?.ghi_chu ?? ''} onChange={e => setEdit(r.id, 'ghi_chu', e.target.value)} className="h-8 w-40" /></td>}
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {r.id_hop_dong_khung ? (
                      <span className="text-[10px] text-violet-600" title="Máy thuộc HĐ khung — tính gộp ở Bảng kê">HĐ khung</span>
                    ) : (() => {
                      const d = uocTinh(r)
                      if (!d) return <span className="text-slate-300">—</span>
                      const sb = (d.so_bw_tinh_phi || 0) + (d.so_mau_tinh_phi || 0)
                      return <div><div className="font-semibold text-slate-700">{Math.round(d.thanh_tien).toLocaleString('vi-VN')} đ</div><div className="text-[10px] text-slate-400">{sb.toLocaleString('vi-VN')} bản tính phí</div></div>
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {(() => {
                      const stt = kyStatus(r)
                      const daDay = stt.key === 'da_day' || stt.key === 'da_hd'
                      const noCounter = r.so_bw === null && r.so_mau === null
                      return (
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-[9px] font-normal px-1.5 py-0.5 rounded-full border whitespace-nowrap ${stt.cls}`}>{stt.label}</span>
                          <div className="flex justify-end gap-1.5">
                            <Button onClick={() => saveRow(r)} disabled={savingId === r.id} className="h-8 w-8 p-0 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center justify-center shrink-0" title="Lưu chỉ số counter">
                              {savingId === r.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            </Button>
                            {!r.id_hop_dong_khung && (
                              <>
                                <Button onClick={() => exportQuick(r)} disabled={exportingId === r.id || noCounter}
                                  className="h-8 w-8 p-0 bg-emerald-600 hover:bg-emerald-700 text-white rounded flex items-center justify-center shrink-0 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                                  title={noCounter ? 'Cần lưu counter trước' : (daDay ? 'Tải bảng kê (bản đã đẩy)' : 'Lập & tải bảng kê (.docx)')}>
                                  {exportingId === r.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                                </Button>
                                {daDay ? (
                                  <div className="h-8 w-8 flex items-center justify-center text-emerald-600 shrink-0" title="Đã đẩy sang Kanban — sửa phải Thu hồi phiếu ở Kanban"><Check className="w-4 h-4" /></div>
                                ) : (
                                  <Button onClick={() => pushKanban(r)} disabled={pushingId === r.id || noCounter}
                                    className="h-8 w-8 p-0 bg-indigo-600 hover:bg-indigo-700 text-white rounded flex items-center justify-center shrink-0 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                                    title={noCounter ? 'Cần lưu counter trước khi đẩy' : 'Đẩy sang Kanban cho kế toán lên hóa đơn'}>
                                    {pushingId === r.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                  </td>
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
  const [form, setForm] = useState<any>({ ten_hop_dong: '', phi_co_ban: 0, vat_thue_cpc: 8, don_gia_bw: 0, don_gia_mau: 0, mien_phi_bw: 0, mien_phi_mau: 0, card_reader: 0, ten_dv_thue_may: '', ten_dv_dau_doc: '', ghi_chu: '' })
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

  const reset = () => { setForm({ ten_hop_dong: '', phi_co_ban: 0, vat_thue_cpc: 8, don_gia_bw: 0, don_gia_mau: 0, mien_phi_bw: 0, mien_phi_mau: 0, card_reader: 0, ten_dv_thue_may: '', ten_dv_dau_doc: '', ghi_chu: '' }); setEditingId(null) }
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
          <label className="block"><span className="text-xs font-medium text-slate-500">Đơn giá Đen (VNĐ/bản)</span><NumInput value={form.don_gia_bw} onChange={v => setForm({ ...form, don_gia_bw: v })} className="h-9 mt-1" /></label>
          <label className="block"><span className="text-xs font-medium text-slate-500">Đơn giá Màu (VNĐ/bản)</span><NumInput value={form.don_gia_mau} onChange={v => setForm({ ...form, don_gia_mau: v })} className="h-9 mt-1" /></label>
          <label className="block"><span className="text-xs font-medium text-slate-500">Miễn phí Đen</span><NumInput value={form.mien_phi_bw} onChange={v => setForm({ ...form, mien_phi_bw: v })} className="h-9 mt-1" /></label>
          <label className="block"><span className="text-xs font-medium text-slate-500">Miễn phí Màu</span><NumInput value={form.mien_phi_mau} onChange={v => setForm({ ...form, mien_phi_mau: v })} className="h-9 mt-1" /></label>
          <label className="block"><span className="text-xs font-medium text-slate-500">Card reader / option</span><NumInput value={form.card_reader} onChange={v => setForm({ ...form, card_reader: v })} className="h-9 mt-1" /></label>
          {/* 2 ô tên dịch vụ trên HĐ — cùng 1 chức năng nên đặt chung 1 hàng, ngay dưới Card reader */}
          <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block"><span className="text-xs font-medium text-slate-500">Tên DV thuê máy (trên HĐ)</span><Input value={form.ten_dv_thue_may} onChange={e => setForm({ ...form, ten_dv_thue_may: e.target.value })} className="h-9 mt-1" placeholder="Trống = Dịch vụ thuê máy" /><span className="text-[10px] text-slate-400">KHÔNG gõ tháng — hệ thống tự ghép kỳ. VD: Dịch vụ thuê máy Photocopy</span></label>
            <label className="block"><span className="text-xs font-medium text-slate-500">Tên DV đầu đọc thẻ (trên HĐ)</span><Input value={form.ten_dv_dau_doc} onChange={e => setForm({ ...form, ten_dv_dau_doc: e.target.value })} className="h-9 mt-1" placeholder="Trống = Dịch vụ đầu đọc thẻ" /><span className="text-[10px] text-slate-400">Hệ thống tự ghép kỳ vào cuối. VD: Dịch vụ thuê đầu đọc thẻ</span></label>
          </div>
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
                  <button onClick={() => { setEditingId(k.id); setForm({ ten_hop_dong: k.ten_hop_dong, phi_co_ban: k.phi_co_ban, vat_thue_cpc: k.vat_thue_cpc, don_gia_bw: k.don_gia_bw ?? 0, don_gia_mau: k.don_gia_mau ?? 0, mien_phi_bw: k.mien_phi_bw ?? 0, mien_phi_mau: k.mien_phi_mau ?? 0, card_reader: k.card_reader ?? 0, ten_dv_thue_may: k.ten_dv_thue_may || '', ten_dv_dau_doc: k.ten_dv_dau_doc || '', ghi_chu: k.ghi_chu || '' }) }} className="text-blue-600 hover:underline text-xs font-medium">Sửa</button>
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
function BangKeTab({ showNotification, thang: thangProp, refreshVer = 0 }: { showNotification: Notify, thang?: string, refreshVer?: number }) {
  // Kỳ có thể do màn "Nhập counter" điều khiển (đồng bộ 1 kỳ); nếu chạy độc lập thì tự giữ state.
  const [thangState, setThang] = useState(monthNow())
  const thang = thangProp ?? thangState
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mays, setMays] = useState<any[]>([])
  const [khung, setKhung] = useState<any[]>([])
  const [loai, setLoai] = useState<'rieng' | 'gop'>('rieng')
  const [target, setTarget] = useState('')
  const [soHd, setSoHd] = useState('')
  const [creating, setCreating] = useState(false)
  const [chanTrang, setChanTrang] = useState(false)
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
  // Có thay đổi (VD đẩy Kanban từ màn counter) -> tải lại danh sách bảng kê (list, không có ô đang gõ nên an toàn).
  const firstRef = useRef(true)
  useEffect(() => { if (firstRef.current) { firstRef.current = false; return } loadList() }, [refreshVer]) // eslint-disable-line react-hooks/exhaustive-deps
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
        {thangProp
          ? <span className="text-xs text-slate-400">Kỳ theo màn Nhập counter: <b className="text-slate-600">{thang}</b></span>
          : <label className="flex items-center gap-2 text-sm text-slate-600">Kỳ<MonthField value={thang} onChange={setThang} className="h-9 w-40" /></label>}
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
                <th className="px-3 py-2 text-right">Thao tác</th>
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
                    <div className="flex gap-2 justify-end items-center">
                      <button onClick={() => setDetail(b.id)} className="text-slate-600 hover:underline text-xs font-medium">Xem</button>
                      <a href={exportUrl(b.id)} className="text-emerald-600 hover:underline text-xs font-medium">Tải Word</a>
                      {b.id_cong_viec
                        ? <span className="text-slate-400 text-xs font-medium" title="Đã tạo phiếu Kanban cho bảng kê này">Đã đẩy ✓</span>
                        : <button
                            onClick={async () => {
                              try {
                                const res = await fetch('/api/admin/thue-cpc/bang-ke/day-kanban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.id }) })
                                const j = await res.json()
                                if (res.ok) { showNotification('success', 'Đã đẩy sang Kanban (kthc lên hóa đơn).'); loadList() }
                                else showNotification('error', j.error || 'Lỗi đẩy Kanban')
                              } catch { showNotification('error', 'Lỗi kết nối') }
                            }}
                            className="text-blue-600 hover:underline text-xs font-medium" title="Sinh phiếu đẩy sang Kanban cho kế toán lên hóa đơn">Đẩy Kanban</button>}
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
