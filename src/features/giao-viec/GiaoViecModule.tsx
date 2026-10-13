'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardList, CheckCircle2, Clock, Wallet, RefreshCw, Plus, Pencil, Trash2, MapPin, Send, Hand, Search, Hash, FileDown, CalendarArrowDown, CopyX, Boxes, ChevronLeft } from 'lucide-react'
import DateField from '@/components/DateField'
import { useConfirm } from '@/components/ConfirmDialog'
import { fmtThoiLuong } from '@/lib/thoi-gian'
import { phieuTaoChip, buoiGio, PHIEU_TAO_TONE } from '@/lib/phieu-tao'
import { exportRowsToExcel } from '@/lib/excel'
import { JOBS_TOPIC, JOBS_EVENT } from '@/lib/realtime'
import { useRealtimeRefetch } from '@/lib/useRealtime'
import LamTiepBanner from '@/components/LamTiepBanner'
import { useShared } from '@/features/_shell/SharedDataProvider'
import { useSession } from '@/features/_shell/SessionProvider'
import {
  StatCard, StatRow, DataTable, type Column, type ColumnFilter, Card,
  DateText, fmtMoney, fmtDate,
} from '@/ui'
import { listJobs, deleteJob, dedupeInfo, dedupeRun } from './api'
import { JobFormModal } from './JobForm'
import { LoaiViecCell } from './LoaiViecCell'
import { ChungTuButton } from './ChungTuButton'
import { TraKhoModal } from './TraKhoModal'
import { todayVN, jobTien, LOAI_CV_FALLBACK, type Job } from './types'

const STATUSES = ['Chờ nhận', 'Đã nhận', 'Đang làm', 'Hoàn thành', 'Chưa hoàn thành']

function statusCls(k: string): string {
  if (k === 'Hoàn thành') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (k === 'Đang làm') return 'bg-blue-50 text-blue-700 border-blue-200'
  if (k === 'Chưa hoàn thành') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (k === 'Đã nhận') return 'bg-violet-50 text-violet-700 border-violet-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

export function GiaoViecModule({ notify }: { notify: (type: 'success' | 'error', msg: string) => void }) {
  const { customers, inventory, users, committed, dmOptions, refetchInventory } = useShared()
  const { user } = useSession()
  const role = user?.role || ''
  const canCreate = ['admin', 'tech_admin', 'staff'].includes(role)
  const canDelete = role !== 'staff'                 // admin/tech_admin
  const canAdminTools = ['admin', 'tech_admin'].includes(role)  // Cuốn ngày
  const isAdmin = role === 'admin'                    // Xóa phiếu trùng
  const { confirm, confirmNode } = useConfirm()

  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  // 3 bộ lọc SERVER (dòng 1)
  const [tuNgay, setTuNgay] = useState(todayVN())
  const [denNgay, setDenNgay] = useState(todayVN())
  const [q, setQ] = useState('')          // tìm mã máy / tên khách (toàn cục)
  const [report, setReport] = useState('') // số phiếu (toàn cục, bỏ qua ngày)
  // 4 bộ lọc CLIENT (trong cột, dạng phễu)
  const [colFilters, setColFilters] = useState<Record<string, string>>({})
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Job | null>(null)
  const [busyTool, setBusyTool] = useState(false)
  const [traJobId, setTraJobId] = useState<string | null>(null)
  const [futureJobs, setFutureJobs] = useState<Job[]>([])   // phiếu đặt trước (ngay >= ngày mai), chưa hoàn thành

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const data = await listJobs({ tuNgay, denNgay, q, report })
      setJobs(data)
    } catch (e: any) {
      if (e?.message !== 'UNAUTH') notify('error', e?.message || 'Lỗi tải danh sách')
    } finally { setLoading(false) }
  }, [tuNgay, denNgay, q, report, notify])

  // Đổi bộ lọc server -> debounce nạp lại dữ liệu.
  useEffect(() => { const t = setTimeout(() => load(), 300); return () => clearTimeout(t) }, [load])

  // Phiếu đặt trước (ngày mai trở đi, chưa hoàn thành) — độc lập bộ lọc ngày để luôn nhắc.
  const tomorrow = useMemo(() => new Date(Date.parse(todayVN() + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10), [])
  const loadFuture = useCallback(() => {
    listJobs({ tuNgay: tomorrow, ket_qua: 'Chờ nhận,Đã nhận,Đang làm,Chưa hoàn thành' }).then(setFutureJobs).catch(() => {})
  }, [tomorrow])
  useEffect(() => { loadFuture() }, [loadFuture])

  useRealtimeRefetch(JOBS_TOPIC, JOBS_EVENT, () => { load(true); loadFuture() }, true, 30000)

  const loaiOptions = dmOptions('loai_cong_viec', LOAI_CV_FALLBACK)

  // Định nghĩa phễu lọc cột (option + test). Dùng cho CẢ việc lọc (module) và vẽ phễu (DataTable).
  const filterDefs = useMemo(() => {
    const defs: Record<string, ColumnFilter<Job>> = {
      loai: { title: 'Loại việc', options: loaiOptions.map(o => ({ value: o, label: o, test: (j: Job) => j.loai_cong_viec === o })) },
      ktv: {
        title: 'KTV', options: [
          { value: 'none', label: 'Chưa giao', test: (j: Job) => !j.ktv_id },
          ...users.filter(u => u.role === 'ktv').map(u => ({ value: u.id, label: u.full_name, test: (j: Job) => j.ktv_id === u.id })),
        ],
      },
      hd: {
        title: 'HĐ', options: [
          { value: 'co', label: 'Có hóa đơn', test: (j: Job) => jobTien(j).coHD },
          { value: 'chua', label: 'Chưa hóa đơn', test: (j: Job) => { const { tong, coHD } = jobTien(j); return !coHD && tong > 0 } },
          { value: 'cotien', label: 'Có phát sinh tiền', test: (j: Job) => jobTien(j).tong > 0 },
        ],
      },
      tt: { title: 'Trạng thái', options: STATUSES.map(s => ({ value: s, label: s, test: (j: Job) => j.ket_qua === s })) },
    }
    return defs
  }, [loaiOptions, users])

  // Áp phễu cột (client) -> danh sách đang hiển thị (dùng cho KPI + Xuất Excel + DataTable).
  const visibleRows = useMemo(() => {
    let out = jobs
    for (const [key, val] of Object.entries(colFilters)) {
      if (!val) continue
      const opt = filterDefs[key]?.options.find(o => o.value === val)
      if (opt) out = out.filter(opt.test)
    }
    return out
  }, [jobs, colFilters, filterDefs])

  const stats = useMemo(() => {
    let done = 0, doing = 0, waiting = 0, unassigned = 0, revenue = 0, revenueHD = 0
    for (const j of visibleRows) {
      if (j.ket_qua === 'Hoàn thành') done++
      else if (j.ket_qua === 'Đang làm' || j.ket_qua === 'Đã nhận') doing++
      else if (j.ket_qua === 'Chờ nhận') waiting++
      if (!j.ktv_id) unassigned++
      const { tong, coHD } = jobTien(j)
      revenue += tong
      if (coHD) revenueHD += tong
    }
    return { total: visibleRows.length, done, doing, waiting, unassigned, revenue, revenueHD }
  }, [visibleRows])

  // Bỏ lọc: về khoảng ngày HÔM NAY + xóa Tìm/Số phiếu + xóa phễu cột.
  const today = todayVN()
  const anyFilterActive = !!(q || report || tuNgay !== today || denNgay !== today || Object.values(colFilters).some(Boolean))
  const clearAll = () => { setTuNgay(today); setDenNgay(today); setQ(''); setReport(''); setColFilters({}) }

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
  // Đưa "Đang làm" về "Đã nhận" (admin) — KTV bấm nhầm Đang làm. Xóa mốc bắt đầu.
  const revertDaNhan = async (j: Job) => {
    if (!(await confirm(`Đưa phiếu ${j.report || ''}${j.ma_may ? ` (máy ${j.ma_may})` : ''} về "Đã nhận"?\nMốc bắt đầu sẽ bị xóa, thời gian xử lý tính lại từ đầu.`, { confirmLabel: 'Về Đã nhận', danger: false }))) return
    try {
      const res = await fetch('/api/admin/cong-viec', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: j.id, revertDangLam: true }) })
      const jr = await res.json().catch(() => ({}))
      if (!res.ok) { notify('error', jr.error || 'Lỗi'); return }
      notify('success', 'Đã đưa phiếu về "Đã nhận".'); load(true)
    } catch { notify('error', 'Lỗi kết nối!') }
  }
  const traJob = traJobId ? jobs.find(j => j.id === traJobId) || null : null

  // Xuất Excel — CHỈ danh sách đang lọc (visibleRows), 14 cột khớp bản admin.
  const exportExcel = async () => {
    const headers = ['Ngày', 'Số phiếu', 'Khách hàng', 'Địa chỉ', 'Mã máy', 'Model', 'SL', 'Loại việc', 'Mã hàng', 'Tên hàng', 'KTV', 'KM', 'Trạng thái', 'Ghi chú']
    const rows = visibleRows.map(j => {
      const vt = j.soct_chi_tiet_vat_tu || []
      return [
        fmtDate(j.ngay), j.report || '', j.soct_khach_hang?.ten_khach_hang || '',
        j.soct_khach_hang?.vi_tri_dat_may || j.soct_khach_hang?.dia_chi || '', j.ma_may || '',
        j.soct_khach_hang?.model || '', j.so_luong || 1, j.loai_cong_viec,
        vt.map(v => v.ma_hang).filter(Boolean).join(', '),
        vt.map(v => v.soct_kho_hang?.ten_hang || v.ma_hang).filter(Boolean).join(', '),
        j.soct_users?.full_name || 'Chưa giao', j.km, j.ket_qua, j.ghi_chu || '',
      ]
    })
    try { await exportRowsToExcel('so-cong-tac', headers, rows) }
    catch { notify('error', 'Lỗi xuất Excel') }
  }

  // Cuốn ngày (admin/tech_admin) — chuyển phiếu chưa làm sang ngày làm việc kế tiếp.
  const cuonNgay = async () => {
    if (!(await confirm('Cuốn phiếu chưa hoàn thành sang hôm nay?\n(Phiếu chưa làm sẽ được đẩy ngày + tăng số lần cuốn.)', { confirmLabel: 'Cuốn ngày', danger: false }))) return
    setBusyTool(true)
    try {
      const res = await fetch('/api/cron/cuon-ngay-phieu?force=1')
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Lỗi')
      notify('success', `Đã cuốn ${j.cuon ?? 0} phiếu.`)
      load(true)
    } catch (e: any) { notify('error', e?.message || 'Lỗi cuốn ngày') }
    finally { setBusyTool(false) }
  }

  // Xóa phiếu trùng (admin) — giữ 1 phiếu/số phiếu (bản sớm nhất).
  const xoaTrung = async () => {
    setBusyTool(true)
    try {
      const info = await dedupeInfo()
      if (info.extras === 0) { notify('success', 'Không có phiếu trùng số phiếu. 👍'); return }
      const ok = await confirm(`Tìm thấy ${info.groups} số phiếu trùng → sẽ xóa ${info.extras} phiếu thừa (giữ bản tạo sớm nhất; vật tư phiếu thừa bị xóa theo).\nKhông thể hoàn tác.`, { confirmLabel: `Xóa ${info.extras} phiếu thừa`, danger: true })
      if (!ok) return
      const r = await dedupeRun()
      notify('success', `Đã xóa ${r.removed} phiếu trùng (${r.groups} số phiếu).`)
      load(true)
    } catch (e: any) { notify('error', e?.message || 'Lỗi dọn phiếu trùng') }
    finally { setBusyTool(false) }
  }

  const columns: Column<Job>[] = [
    {
      key: 'ngay', header: 'Ngày', sortValue: j => j.ngay,
      render: j => {
        const chip = phieuTaoChip(j.created_at, j.ngay, j.so_lan_cuon, j.ket_qua)
        return <div className="t1 whitespace-nowrap"><DateText value={j.ngay} />{chip && <div className={`mt-0.5 block w-fit t3 leading-tight font-medium border rounded px-1 py-px ${PHIEU_TAO_TONE[chip.tone]}`} title={chip.title}>{chip.label}</div>}</div>
      },
    },
    {
      key: 'khach', header: 'Khách hàng', sortValue: j => j.soct_khach_hang?.ten_khach_hang || '',
      // Ghì rộng cột (260px) để tên dài không kéo giãn cột; WRAP (xuống dòng) để hiện đủ, không cắt mất.
      render: j => (
        <div className="w-[260px] max-w-[260px]">
          <div className="t1 font-medium text-slate-800 break-words">{j.soct_khach_hang?.ten_khach_hang || '—'}</div>
          <div className="t2 text-slate-500 flex items-start gap-1 mt-0.5"><MapPin className="w-3 h-3 shrink-0 mt-0.5" /><span className="break-words">{j.soct_khach_hang?.vi_tri_dat_may || j.soct_khach_hang?.dia_chi || ''}</span></div>
        </div>
      ),
    },
    {
      key: 'ma_may', header: 'Mã máy', sortValue: j => j.ma_may || '',
      render: j => <div>{j.soct_khach_hang?.model && <div className="t1 font-medium text-slate-800">{j.soct_khach_hang.model}</div>}<div className="t2 font-mono text-slate-500 mt-0.5">{j.ma_may || '-'}</div></div>,
    },
    { key: 'loai', header: 'Loại việc', sortValue: j => j.loai_cong_viec, filter: filterDefs.loai, tdClassName: 'whitespace-nowrap', render: j => <LoaiViecCell job={j} /> },
    {
      key: 'ktv', header: 'KTV', sortValue: j => j.soct_users?.full_name || '', filter: filterDefs.ktv, tdClassName: 'whitespace-nowrap',
      render: j => j.soct_users?.full_name
        ? <div><div className="t1 font-medium text-slate-800">{j.soct_users.full_name}</div>{j.ktv2?.full_name && <div className="t3 text-slate-500 mt-0.5">+ {j.ktv2.full_name} <span className="text-slate-400 italic">(kèm)</span></div>}</div>
        : <span className="text-amber-600 italic">Chưa giao</span>,
    },
    { key: 'km', header: 'KM', align: 'center', sortValue: j => Number(j.km) || 0, render: j => <span className="t2">{j.km ? `${Number(j.km).toLocaleString('vi-VN')} km` : '0 km'}</span> },
    { key: 'tg', header: 'TG xử lý', align: 'center', sortValue: j => Number(j.so_phut_xu_ly) || 0, render: j => <span className="t2 text-slate-500">{fmtThoiLuong(j.so_phut_xu_ly)}</span> },
    {
      key: 'bao_cao', header: 'Báo cáo HĐ', sortValue: j => jobTien(j).tong, filter: filterDefs.hd,
      render: j => {
        const allVt = j.soct_chi_tiet_vat_tu || []
        const active = allVt.filter(v => !v.da_tra)
        const returned = allVt.length - active.length
        const { tong, coHD } = jobTien(j)
        return <div>{j.report && <div className="t2 text-slate-600">Phiếu: {j.report}</div>}{active.length > 0 && <div className={`t1 font-medium ${coHD ? 'text-emerald-600' : 'text-amber-600'}`}>{coHD ? 'Có HĐ' : 'Chưa HĐ'}: {fmtMoney(tong)} đ</div>}{returned > 0 && <div className="t3 text-indigo-600 font-medium mt-0.5">↩ Đã trả kho {returned}/{allVt.length}</div>}</div>
      },
    },
    {
      key: 'tt', header: 'Trạng thái', sortValue: j => j.ket_qua, filter: filterDefs.tt,
      render: j => {
        const chip = j.ket_qua === 'Hoàn thành' ? buoiGio(j.hoan_thanh_luc) : null
        return (
          <div className="flex items-start gap-1.5 whitespace-nowrap">
            <div className="inline-flex flex-col items-center gap-0.5">
              <span className={`inline-block px-2.5 py-1 rounded-full t2 font-medium border ${statusCls(j.ket_qua)}`}>{j.ket_qua}</span>
              {chip && <span className={`t3 leading-tight font-medium border rounded px-1 py-px ${PHIEU_TAO_TONE[chip.tone]}`} title={`Hoàn thành ${chip.title}`}>{chip.label}</span>}
            </div>
            {j.nguon_nhan === 'giao' && <span title="Giao trực tiếp cho KTV" className="inline-flex text-indigo-500 mt-1"><Send className="w-3.5 h-3.5" /></span>}
            {j.nguon_nhan === 'tu_nhan' && <span title="KTV tự nhận trên app" className="inline-flex text-emerald-500 mt-1"><Hand className="w-3.5 h-3.5" /></span>}
          </div>
        )
      },
    },
    {
      key: 'actions', header: 'Thao tác', align: 'right', tdClassName: 'whitespace-nowrap',
      render: j => {
        const hasVt = (j.soct_chi_tiet_vat_tu || []).length > 0
        return (
          <div className="inline-flex gap-1 items-center">
            {hasVt && <ChungTuButton jobId={j.id} bbbgLuc={j.bbbg_luc} onExported={() => load(true)} notify={notify} />}
            {(['Chờ nhận', 'Đã nhận'].includes(j.ket_qua) || role === 'admin') && (
              <button onClick={() => openEdit(j)} title={['Chờ nhận', 'Đã nhận'].includes(j.ket_qua) ? 'Sửa phiếu' : 'Sửa phiếu (admin)'} className="w-7 h-7 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 flex items-center justify-center"><Pencil className="w-3.5 h-3.5" /></button>
            )}
            {role === 'admin' && j.ket_qua === 'Đang làm' && (
              <button onClick={() => revertDaNhan(j)} title='Đưa về "Đã nhận" (KTV bấm nhầm Đang làm)' className="w-7 h-7 rounded border border-amber-200 text-amber-600 hover:bg-amber-50 flex items-center justify-center"><ChevronLeft className="w-3.5 h-3.5" /></button>
            )}
            {canDelete && j.ket_qua === 'Hoàn thành' && hasVt && (
              <button onClick={() => setTraJobId(j.id)} title="Vật tư / Trả về kho" className="w-7 h-7 rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-50 flex items-center justify-center"><Boxes className="w-3.5 h-3.5" /></button>
            )}
            {canDelete && <button onClick={() => onDelete(j)} title="Xóa phiếu" className="w-7 h-7 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>}
          </div>
        )
      },
    },
  ]

  const fieldCls = 'h-9 px-2.5 text-xs rounded-md border border-slate-200 bg-white outline-none focus:border-blue-500'
  const btnOutline = 'h-9 px-3 rounded-md border border-slate-200 text-slate-600 text-xs font-medium flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-50'

  const daXemFuture = tuNgay === tomorrow && denNgay === ''
  const ganNhat = futureJobs.length ? futureJobs.reduce((m, j) => (m && m <= j.ngay ? m : j.ngay), futureJobs[0].ngay) : ''

  return (
    <div className="space-y-4">
      {/* Nhắc làm tiếp (phiếu Chưa hoàn thành đến hẹn) */}
      <LamTiepBanner showNotification={notify} onCreated={() => { load(true); loadFuture() }} />

      <StatRow>
        <StatCard label="Tổng việc" value={stats.total.toLocaleString('vi-VN')} sub={`trên ${jobs.length.toLocaleString('vi-VN')} tất cả`} tone="blue" icon={ClipboardList} />
        <StatCard label="Hoàn thành" value={stats.done.toLocaleString('vi-VN')} tone="emerald" icon={CheckCircle2} />
        <StatCard label="Đang làm / Chờ" value={(stats.doing + stats.waiting).toLocaleString('vi-VN')} sub={`${stats.unassigned.toLocaleString('vi-VN')} chưa giao`} tone="amber" icon={Clock} />
        <StatCard label="Phát sinh tiền" value={`${fmtMoney(stats.revenue)} đ`} sub={`có HĐ: ${fmtMoney(stats.revenueHD)} đ`} tone="indigo" icon={Wallet} />
      </StatRow>

      {/* Phiếu đặt trước cho ngày tới — nằm giữa thẻ KPI và danh sách */}
      {futureJobs.length > 0 && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs">
          <Clock className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-blue-800"><b>{futureJobs.length}</b> phiếu đặt trước cho ngày tới (gần nhất <b>{fmtDate(ganNhat)}</b>)</span>
          {daXemFuture
            ? <button onClick={() => { setTuNgay(today); setDenNgay(today) }} className="ml-auto shrink-0 font-semibold text-slate-500 hover:underline">← Về hôm nay</button>
            : <button onClick={() => { setTuNgay(tomorrow); setDenNgay('') }} className="ml-auto shrink-0 font-semibold text-blue-700 hover:underline">Xem →</button>}
        </div>
      )}

      <Card>
        {/* TOOLBAR */}
        <div className="p-3 border-b border-slate-100 space-y-2.5">
          {/* Dòng 1 — 3 bộ lọc SERVER */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span>Ngày</span>
              <DateField value={tuNgay} onChange={v => setTuNgay(v)} heightClass="h-9" className="w-36" />
              <span>–</span>
              <DateField value={denNgay} onChange={v => setDenNgay(v)} heightClass="h-9" className="w-36" />
            </div>
            <div className="relative w-60"><Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm mã máy, tên khách hàng…" className={`${fieldCls} w-full pl-9`} /></div>
            <div className="relative w-44"><Hash className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><input value={report} onChange={e => setReport(e.target.value)} placeholder="Số phiếu…" className={`${fieldCls} w-full pl-9`} /></div>
            {anyFilterActive && <button onClick={clearAll} className="text-xs text-rose-600 hover:underline font-medium px-1">Bỏ lọc</button>}
            <span className="text-[11px] text-slate-400 ml-auto">{visibleRows.length}/{jobs.length} việc</span>
          </div>
          {/* Dòng 2 — Giao việc mới (trái) · nhóm nút (phải) */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {canCreate
              ? <button onClick={openCreate} className="h-9 px-4 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center gap-1.5 shadow-xs"><Plus className="w-4 h-4" /> Giao việc mới</button>
              : <span />}
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={exportExcel} className="h-9 px-3 rounded-md border border-emerald-200 text-emerald-700 text-xs font-medium flex items-center gap-1.5 hover:bg-emerald-50"><FileDown className="w-3.5 h-3.5" /> Xuất Excel <span className="text-[10px] text-emerald-500">(đang lọc)</span></button>
              {canAdminTools && <button onClick={cuonNgay} disabled={busyTool} className={btnOutline}><CalendarArrowDown className="w-3.5 h-3.5" /> Cuốn ngày</button>}
              {isAdmin && <button onClick={xoaTrung} disabled={busyTool} className="h-9 px-3 rounded-md border border-amber-300 text-amber-700 text-xs font-medium flex items-center gap-1.5 hover:bg-amber-50 disabled:opacity-50"><CopyX className="w-3.5 h-3.5" /> Xóa phiếu trùng</button>}
              <button onClick={() => load()} className={btnOutline}><RefreshCw className="w-3.5 h-3.5" /> Tải lại</button>
            </div>
          </div>
        </div>

        <DataTable
          columns={columns} rows={visibleRows} rowKey={(j) => j.id} loading={loading} loadingText="Đang tải công việc..."
          defaultSort={{ key: 'ngay', asc: false }}
          filters={colFilters}
          onFilterChange={(k, v) => setColFilters(f => ({ ...f, [k]: v }))}
          onClearFilters={() => setColFilters({})}
          empty={(q || report || Object.values(colFilters).some(Boolean)) ? 'Không có việc khớp bộ lọc.' : 'Chưa có công việc nào.'}
        />
      </Card>

      {formOpen && (
        <JobFormModal
          editingJob={editing}
          onClose={() => setFormOpen(false)}
          onSaved={(msg) => { setFormOpen(false); notify('success', msg); load(true) }}
          notify={notify}
          customers={customers} inventory={inventory} committed={committed} users={users} loaiOptions={loaiOptions}
          canEdit={!editing || canEditJob(editing)} role={role} refetchInventory={refetchInventory}
        />
      )}
      {traJob && <TraKhoModal job={traJob} onClose={() => setTraJobId(null)} onChanged={() => load(true)} notify={notify} />}
      {confirmNode}
    </div>
  )
}
