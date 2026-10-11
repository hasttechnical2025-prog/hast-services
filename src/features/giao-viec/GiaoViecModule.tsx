'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, Send, Wrench, CheckCircle2, RefreshCw, Plus, Pencil, Trash2 } from 'lucide-react'
import DateField from '@/components/DateField'
import { useConfirm } from '@/components/ConfirmDialog'
import { JOBS_TOPIC, JOBS_EVENT } from '@/lib/realtime'
import { useRealtimeRefetch } from '@/lib/useRealtime'
import { useShared } from '@/features/_shell/SharedDataProvider'
import { useSession } from '@/features/_shell/SessionProvider'
import {
  StatCard, StatRow, DataTable, type Column, SearchInput, Card, Toolbar,
  Badge, KET_QUA_TONE, type BadgeTone, DateText, normVi,
} from '@/ui'
import { listJobs, deleteJob } from './api'
import { JobFormModal } from './JobForm'
import { todayVN, LOAI_CV_FALLBACK, type Job } from './types'

const STATUSES = ['Chờ nhận', 'Đã nhận', 'Đang làm', 'Hoàn thành', 'Chưa hoàn thành']

export function GiaoViecModule({ notify }: { notify: (type: 'success' | 'error', msg: string) => void }) {
  const { customers, inventory, users, dmOptions } = useShared()
  const { user } = useSession()
  const role = user?.role || ''
  const canCreate = ['admin', 'tech_admin', 'staff'].includes(role)
  const canDelete = ['admin', 'tech_admin'].includes(role)
  const { confirm, confirmNode } = useConfirm()

  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [tuNgay, setTuNgay] = useState(todayVN())
  const [denNgay, setDenNgay] = useState(todayVN())
  const [q, setQ] = useState('')
  const [ktvId, setKtvId] = useState('')
  const [status, setStatus] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Job | null>(null)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const data = await listJobs({ tuNgay, denNgay, ket_qua: status || undefined })
      setJobs(data)
    } catch (e: any) {
      if (e?.message !== 'UNAUTH') notify('error', e?.message || 'Lỗi tải danh sách')
    } finally { setLoading(false) }
  }, [tuNgay, denNgay, status, notify])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch(JOBS_TOPIC, JOBS_EVENT, () => load(true), true, 30000)

  const loaiOptions = dmOptions('loai_cong_viec', LOAI_CV_FALLBACK)

  const counts = useMemo(() => {
    const c = { cho: 0, giao: 0, lam: 0, xong: 0 }
    for (const j of jobs) {
      if (j.ket_qua === 'Chờ nhận') c.cho++
      else if (j.ket_qua === 'Đã nhận') c.giao++
      else if (j.ket_qua === 'Đang làm') c.lam++
      else if (j.ket_qua === 'Hoàn thành') c.xong++
    }
    return c
  }, [jobs])

  const filtered = useMemo(() => {
    let out = jobs
    if (ktvId) out = out.filter(j => j.ktv_id === ktvId || j.ktv2_id === ktvId)
    const nq = normVi(q)
    if (nq) out = out.filter(j => normVi([j.report, j.ma_may, j.loai_cong_viec, j.soct_khach_hang?.ten_khach_hang, j.soct_khach_hang?.model, j.ghi_chu].join(' ')).includes(nq))
    return out
  }, [jobs, ktvId, q])

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

  const columns: Column<Job>[] = [
    { key: 'report', header: 'Số phiếu', sortValue: j => j.report || '', render: j => <span className="font-mono font-bold text-slate-900">{j.report || '—'}</span> },
    {
      key: 'khach', header: 'Khách hàng / Điểm máy', sortValue: j => j.soct_khach_hang?.ten_khach_hang || '',
      render: j => (
        <div className="min-w-0">
          <div className="font-medium text-slate-900 truncate">{j.soct_khach_hang?.ten_khach_hang || '—'}</div>
          <div className="text-[11px] text-slate-400 truncate">{j.soct_khach_hang?.vi_tri_dat_may || j.soct_khach_hang?.dia_chi || ''}{j.ma_may ? ` · ${j.ma_may}` : ''}</div>
        </div>
      ),
    },
    { key: 'loai', header: 'Loại việc', sortValue: j => j.loai_cong_viec, render: j => <span className="flex items-center gap-1"><Badge tone="blue">{j.loai_cong_viec}</Badge>{j.mien_phi && <Badge tone="violet">MF</Badge>}</span> },
    { key: 'ngay', header: 'Ngày', sortValue: j => j.ngay, render: j => <DateText value={j.ngay} /> },
    { key: 'ktv', header: 'KTV', sortValue: j => j.soct_users?.full_name || '', render: j => j.soct_users?.full_name ? <span className="text-slate-700">{j.soct_users.full_name}{j.ktv2?.full_name ? <span className="text-slate-400"> +{j.ktv2.full_name}</span> : ''}</span> : <span className="text-slate-400 italic">—</span> },
    { key: 'ket_qua', header: 'Trạng thái', align: 'center', sortValue: j => j.ket_qua, render: j => <Badge tone={(KET_QUA_TONE[j.ket_qua] || 'slate') as BadgeTone}>{j.ket_qua}</Badge> },
    {
      key: 'actions', header: 'Thao tác', align: 'right',
      render: j => (
        <div className="inline-flex gap-1">
          <button onClick={() => openEdit(j)} title={canEditJob(j) ? 'Sửa phiếu' : 'KTV đã bắt đầu'} className="w-7 h-7 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 flex items-center justify-center disabled:opacity-40" disabled={!canEditJob(j)}><Pencil className="w-3.5 h-3.5" /></button>
          {canDelete && <button onClick={() => onDelete(j)} title="Xóa phiếu" className="w-7 h-7 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>}
        </div>
      ),
    },
  ]

  const selCls = 'h-8 px-2.5 text-xs rounded-md border border-slate-200 bg-slate-50/50 focus:bg-white outline-none'

  return (
    <div className="space-y-4">
      <StatRow>
        <StatCard label="Chờ nhận" value={counts.cho} sub="phiếu chưa ai nhận" tone="amber" icon={Clock} />
        <StatCard label="Đã giao" value={counts.giao} sub="chờ KTV tới nơi" tone="blue" icon={Send} />
        <StatCard label="Đang làm" value={counts.lam} sub="KTV đang xử lý" tone="indigo" icon={Wrench} />
        <StatCard label="Hoàn thành" value={counts.xong} sub="trong khoảng lọc" tone="emerald" icon={CheckCircle2} />
      </StatRow>

      <Card>
        <Toolbar
          left={<>
            <SearchInput value={q} onChange={setQ} placeholder="Tìm số phiếu, khách, máy…" className="w-56" />
            <DateField value={tuNgay} onChange={setTuNgay} className="w-32" />
            <span className="text-slate-400 text-xs">→</span>
            <DateField value={denNgay} onChange={setDenNgay} className="w-32" />
            <select className={selCls} value={ktvId} onChange={e => setKtvId(e.target.value)}>
              <option value="">Tất cả KTV</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
            <select className={selCls} value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">Trạng thái: Tất cả</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </>}
          right={<>
            <button onClick={() => load()} className="h-8 px-3 rounded-md border border-slate-200 text-slate-600 text-xs font-medium flex items-center gap-1.5 hover:bg-slate-50"><RefreshCw className="w-3.5 h-3.5" /> Tải lại</button>
            {canCreate && <button onClick={openCreate} className="h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1.5 shadow-xs"><Plus className="w-3.5 h-3.5" /> Tạo phiếu</button>}
          </>}
        />
        <DataTable
          columns={columns} rows={filtered} rowKey={(j) => j.id} loading={loading}
          defaultSort={{ key: 'report', asc: false }}
          empty={q || ktvId || status ? 'Không khớp bộ lọc.' : 'Khoảng ngày này chưa có phiếu nào.'}
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
