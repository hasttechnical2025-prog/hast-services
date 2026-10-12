'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardList, CheckCircle2, Clock, Wallet, RefreshCw, Plus, Pencil, Trash2, MapPin, Send, Hand } from 'lucide-react'
import DateField from '@/components/DateField'
import { useConfirm } from '@/components/ConfirmDialog'
import { fmtThoiLuong } from '@/lib/thoi-gian'
import { phieuTaoChip, buoiGio, PHIEU_TAO_TONE } from '@/lib/phieu-tao'
import { JOBS_TOPIC, JOBS_EVENT } from '@/lib/realtime'
import { useRealtimeRefetch } from '@/lib/useRealtime'
import { useShared } from '@/features/_shell/SharedDataProvider'
import { useSession } from '@/features/_shell/SessionProvider'
import {
  StatCard, StatRow, DataTable, type Column, SearchInput, Card, Toolbar,
  Badge, DateText, fmtMoney, normVi,
} from '@/ui'
import { listJobs, deleteJob } from './api'
import { JobFormModal } from './JobForm'
import { LoaiViecCell } from './LoaiViecCell'
import { todayVN, jobTien, LOAI_CV_FALLBACK, type Job } from './types'

const STATUSES = ['Chờ nhận', 'Đã nhận', 'Đang làm', 'Hoàn thành', 'Chưa hoàn thành']

// Badge trạng thái — màu khớp bản admin hiện tại (Đã nhận = tím, Đang làm = xanh dương…).
function statusCls(k: string): string {
  if (k === 'Hoàn thành') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (k === 'Đang làm') return 'bg-blue-50 text-blue-700 border-blue-200'
  if (k === 'Chưa hoàn thành') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (k === 'Đã nhận') return 'bg-violet-50 text-violet-700 border-violet-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

export function GiaoViecModule({ notify }: { notify: (type: 'success' | 'error', msg: string) => void }) {
  const { customers, inventory, users, dmOptions } = useShared()
  const { user } = useSession()
  const role = user?.role || ''
  const canCreate = ['admin', 'tech_admin', 'staff'].includes(role)
  const canDelete = role !== 'staff'   // admin/tech_admin (parity: non-staff)
  const { confirm, confirmNode } = useConfirm()

  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [tuNgay, setTuNgay] = useState(todayVN())
  const [denNgay, setDenNgay] = useState(todayVN())
  const [q, setQ] = useState('')
  const [report, setReport] = useState('')
  const [ktvId, setKtvId] = useState('')
  const [status, setStatus] = useState('')
  const [hoaDon, setHoaDon] = useState('')     // '', 'co', 'khong'
  const [loaiViec, setLoaiViec] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Job | null>(null)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      // report có giá trị -> tìm TOÀN CỤC theo số phiếu (bỏ khoảng ngày); ngược lại lọc theo khoảng ngày.
      const data = await listJobs(report.trim() ? { report, ket_qua: status || undefined } : { tuNgay, denNgay, ket_qua: status || undefined })
      setJobs(data)
    } catch (e: any) {
      if (e?.message !== 'UNAUTH') notify('error', e?.message || 'Lỗi tải danh sách')
    } finally { setLoading(false) }
  }, [tuNgay, denNgay, status, report, notify])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch(JOBS_TOPIC, JOBS_EVENT, () => load(true), true, 30000)

  const loaiOptions = dmOptions('loai_cong_viec', LOAI_CV_FALLBACK)

  // Lọc client (kết hợp AND) — khớp filteredJobs admin.
  const filtered = useMemo(() => {
    let out = jobs
    if (ktvId) out = out.filter(j => j.ktv_id === ktvId || j.ktv2_id === ktvId)
    if (loaiViec) out = out.filter(j => j.loai_cong_viec === loaiViec)
    if (hoaDon) out = out.filter(j => jobTien(j).coHD === (hoaDon === 'co'))
    const nq = normVi(q)
    if (nq) out = out.filter(j => normVi([j.soct_khach_hang?.ten_khach_hang, j.soct_khach_hang?.dia_chi, j.soct_khach_hang?.vi_tri_dat_may, j.ma_may].join(' ')).includes(nq))
    return out
  }, [jobs, ktvId, loaiViec, hoaDon, q])

  // KPI — khớp jobStats admin (tính trên danh sách ĐÃ lọc).
  const stats = useMemo(() => {
    let done = 0, doing = 0, waiting = 0, unassigned = 0, revenue = 0, revenueHD = 0
    for (const j of filtered) {
      if (j.ket_qua === 'Hoàn thành') done++
      else if (j.ket_qua === 'Đang làm' || j.ket_qua === 'Đã nhận') doing++
      else if (j.ket_qua === 'Chờ nhận') waiting++
      if (!j.ktv_id) unassigned++
      const { tong, coHD } = jobTien(j)
      revenue += tong
      if (coHD) revenueHD += tong
    }
    return { total: filtered.length, done, doing, waiting, unassigned, revenue, revenueHD }
  }, [filtered])

  const canEditJob = (j: Job) => ['Chờ nhận', 'Đã nhận'].includes(j.ket_qua) || role === 'admin'
  const openCreate = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (j: Job) => {
    if (!canEditJob(j)) { notify('error', 'KTV đã bắt đầu việc — không thể sửa phiếu này.'); return }
    setEditing(j); setFormOpen(true)
  }
  const onDelete = async (j: Job) => {
    const ok = await confirm(`Xóa phiếu ${j.report || ''}${j.ma_may ? ` (máy ${j.ma_may})` : ''}?\nHành động này không thể hoàn tác.`, { confirmLabel: 'Xóa phiếu', danger: true })
    if (!ok) return
    try { await deleteJob(j.id); notify('success', 'Đã xóa phiếu.'); load(true) }
    catch (e: any) { notify('error', e?.message || 'Lỗi xóa phiếu') }
  }

  const clearFilters = () => { setQ(''); setReport(''); setKtvId(''); setStatus(''); setHoaDon(''); setLoaiViec(''); setTuNgay(todayVN()); setDenNgay(todayVN()) }
  const filterActive = !!(q || report || ktvId || status || hoaDon || loaiViec)

  const columns: Column<Job>[] = [
    {
      key: 'ngay', header: 'Ngày', sortValue: j => j.ngay,
      render: j => {
        const chip = phieuTaoChip(j.created_at, j.ngay, j.so_lan_cuon, j.ket_qua)
        return (
          <div className="whitespace-nowrap">
            <DateText value={j.ngay} />
            {chip && <div className={`mt-0.5 block w-fit text-[8px] leading-tight font-medium border rounded px-1 py-px ${PHIEU_TAO_TONE[chip.tone]}`} title={chip.title}>{chip.label}</div>}
          </div>
        )
      },
    },
    {
      key: 'khach', header: 'Khách hàng', sortValue: j => j.soct_khach_hang?.ten_khach_hang || '',
      render: j => (
        <div className="min-w-0">
          <div className="font-medium text-slate-800 truncate">{j.soct_khach_hang?.ten_khach_hang || '—'}</div>
          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 truncate"><MapPin className="w-3 h-3 shrink-0" />{j.soct_khach_hang?.vi_tri_dat_may || j.soct_khach_hang?.dia_chi || ''}</div>
        </div>
      ),
    },
    {
      key: 'ma_may', header: 'Mã máy', sortValue: j => j.ma_may || '',
      render: j => <div><div className="font-mono text-xs">{j.ma_may || '-'}</div>{j.soct_khach_hang?.model && <div className="text-[11px] text-slate-400 mt-0.5">{j.soct_khach_hang.model}</div>}</div>,
    },
    { key: 'loai', header: 'Loại việc', sortValue: j => j.loai_cong_viec, render: j => <span className="flex items-center gap-1"><LoaiViecCell job={j} />{j.mien_phi && <Badge tone="violet">MF</Badge>}</span> },
    {
      key: 'ktv', header: 'KTV', sortValue: j => j.soct_users?.full_name || '',
      render: j => j.soct_users?.full_name
        ? <div><div className="font-medium text-slate-800">{j.soct_users.full_name}</div>{j.ktv2?.full_name && <div className="text-[11px] text-slate-500 mt-0.5">+ {j.ktv2.full_name} <span className="text-[10px] text-slate-400 italic">(kèm)</span></div>}</div>
        : <span className="text-amber-600 italic">Chưa giao</span>,
    },
    { key: 'km', header: 'KM', align: 'center', sortValue: j => Number(j.km) || 0, render: j => <span className="text-xs">{j.km ? `${Number(j.km).toLocaleString('vi-VN')} km` : '0 km'}</span> },
    { key: 'tg', header: 'TG xử lý', align: 'center', sortValue: j => Number(j.so_phut_xu_ly) || 0, render: j => <span className="text-xs text-slate-500">{fmtThoiLuong(j.so_phut_xu_ly)}</span> },
    {
      key: 'bao_cao', header: 'Báo cáo HĐ', sortValue: j => jobTien(j).tong,
      render: j => {
        const allVt = j.soct_chi_tiet_vat_tu || []
        const active = allVt.filter(v => !v.da_tra)
        const returned = allVt.length - active.length
        const { tong, coHD } = jobTien(j)
        return (
          <div className="text-xs">
            {j.report && <div className="text-slate-700">Phiếu: {j.report}</div>}
            {active.length > 0 && <div className={coHD ? 'text-emerald-600' : 'text-amber-600'}>{coHD ? 'Có HĐ' : 'Chưa HĐ'}: {fmtMoney(tong)} đ</div>}
            {returned > 0 && <div className="text-indigo-600 text-[11px] font-medium">↩ Đã trả kho {returned}/{allVt.length}</div>}
          </div>
        )
      },
    },
    {
      key: 'ket_qua', header: 'Trạng thái', sortValue: j => j.ket_qua,
      render: j => {
        const chip = j.ket_qua === 'Hoàn thành' ? buoiGio(j.hoan_thanh_luc) : null
        return (
          <div className="flex items-start gap-1.5 whitespace-nowrap">
            <div className="inline-flex flex-col items-center gap-0.5">
              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${statusCls(j.ket_qua)}`}>{j.ket_qua}</span>
              {chip && <span className={`text-[8px] leading-tight font-medium border rounded px-1 py-px ${PHIEU_TAO_TONE[chip.tone]}`} title={`Hoàn thành ${chip.title}`}>{chip.label}</span>}
            </div>
            {j.nguon_nhan === 'giao' && <span title="Giao trực tiếp cho KTV" className="inline-flex text-indigo-500 mt-1"><Send className="w-3.5 h-3.5" /></span>}
            {j.nguon_nhan === 'tu_nhan' && <span title="KTV tự nhận trên app" className="inline-flex text-emerald-500 mt-1"><Hand className="w-3.5 h-3.5" /></span>}
          </div>
        )
      },
    },
    {
      key: 'actions', header: 'Thao tác', align: 'right',
      render: j => (
        <div className="inline-flex gap-1">
          {(['Chờ nhận', 'Đã nhận'].includes(j.ket_qua) || role === 'admin') && (
            <button onClick={() => openEdit(j)} title={['Chờ nhận', 'Đã nhận'].includes(j.ket_qua) ? 'Sửa phiếu' : 'Sửa phiếu (admin)'} className="w-7 h-7 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 flex items-center justify-center"><Pencil className="w-3.5 h-3.5" /></button>
          )}
          {canDelete && <button onClick={() => onDelete(j)} title="Xóa phiếu" className="w-7 h-7 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>}
        </div>
      ),
    },
  ]

  const selCls = 'h-8 px-2.5 text-xs rounded-md border border-slate-200 bg-slate-50/50 focus:bg-white outline-none'

  return (
    <div className="space-y-4">
      <StatRow>
        <StatCard label="Tổng việc" value={stats.total.toLocaleString('vi-VN')} sub={`trên ${jobs.length.toLocaleString('vi-VN')} tất cả`} tone="blue" icon={ClipboardList} />
        <StatCard label="Hoàn thành" value={stats.done.toLocaleString('vi-VN')} tone="emerald" icon={CheckCircle2} />
        <StatCard label="Đang làm / Chờ" value={(stats.doing + stats.waiting).toLocaleString('vi-VN')} sub={`${stats.unassigned.toLocaleString('vi-VN')} chưa giao`} tone="amber" icon={Clock} />
        <StatCard label="Phát sinh tiền" value={`${fmtMoney(stats.revenue)} đ`} sub={`có HĐ: ${fmtMoney(stats.revenueHD)} đ`} tone="indigo" icon={Wallet} />
      </StatRow>

      <Card>
        <Toolbar
          left={<>
            <SearchInput value={q} onChange={setQ} placeholder="Tìm mã máy, tên khách…" className="w-52" />
            <input value={report} onChange={e => setReport(e.target.value)} placeholder="Số phiếu…" className={`${selCls} w-28`} />
            <DateField value={tuNgay} onChange={setTuNgay} className="w-32" />
            <span className="text-slate-400 text-xs">→</span>
            <DateField value={denNgay} onChange={setDenNgay} className="w-32" />
            <select className={selCls} value={loaiViec} onChange={e => setLoaiViec(e.target.value)}>
              <option value="">Loại việc: Tất cả</option>
              {loaiOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <select className={selCls} value={ktvId} onChange={e => setKtvId(e.target.value)}>
              <option value="">KTV: Tất cả</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
            <select className={selCls} value={hoaDon} onChange={e => setHoaDon(e.target.value)}>
              <option value="">HĐ: Tất cả</option>
              <option value="co">Có HĐ</option>
              <option value="khong">Chưa HĐ</option>
            </select>
            <select className={selCls} value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">Trạng thái: Tất cả</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {filterActive && <button onClick={clearFilters} className="text-xs text-rose-600 hover:underline">Bỏ lọc</button>}
            <span className="text-[11px] text-slate-400">{filtered.length}/{jobs.length} việc</span>
          </>}
          right={<>
            <button onClick={() => load()} className="h-8 px-3 rounded-md border border-slate-200 text-slate-600 text-xs font-medium flex items-center gap-1.5 hover:bg-slate-50"><RefreshCw className="w-3.5 h-3.5" /> Tải lại</button>
            {canCreate && <button onClick={openCreate} className="h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1.5 shadow-xs"><Plus className="w-3.5 h-3.5" /> Giao việc mới</button>}
          </>}
        />
        <DataTable
          columns={columns} rows={filtered} rowKey={(j) => j.id} loading={loading}
          defaultSort={{ key: 'ngay', asc: false }}
          empty={filterActive ? 'Không có việc khớp bộ lọc.' : 'Chưa có công việc nào.'}
        />
      </Card>

      {formOpen && (
        <JobFormModal
          editingJob={editing}
          onClose={() => setFormOpen(false)}
          onSaved={(msg) => { setFormOpen(false); notify('success', msg); load(true) }}
          notify={notify}
          customers={customers} inventory={inventory} users={users} loaiOptions={loaiOptions}
          canEdit={!editing || canEditJob(editing)}
        />
      )}
      {confirmNode}
    </div>
  )
}
