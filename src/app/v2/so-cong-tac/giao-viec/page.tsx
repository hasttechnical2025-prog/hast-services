'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, Send, Wrench, CheckCircle2, RefreshCw } from 'lucide-react'
import { JOBS_TOPIC, JOBS_EVENT } from '@/lib/realtime'
import { useRealtimeRefetch } from '@/lib/useRealtime'
import {
  StatCard, StatRow, DataTable, type Column, SearchInput, Card, Toolbar,
  Badge, KET_QUA_TONE, type BadgeTone, DateText, normVi,
} from '@/ui'

// TRANG DEMO GĐ0 — Giao việc (CHỈ XEM) trên vỏ /v2. Mục đích: chốt khung Design System +
// chứng minh realtime "tự lành" chạy trong route mới. Gọi LẠI đúng API cũ, không rewrite.

type Job = {
  id: string
  ngay: string
  ma_may: string | null
  loai_cong_viec: string
  ket_qua: string
  report: string | null
  soct_khach_hang?: { ten_khach_hang?: string; dia_chi?: string; model?: string; vi_tri_dat_may?: string } | null
  soct_users?: { full_name?: string } | null
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function GiaoViecDemoPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const date = todayISO()

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const res = await fetch(`/api/admin/cong-viec?date=${date}`)
      const j = await res.json()
      if (res.ok) setJobs(j.data || [])
    } catch { /* giữ dữ liệu cũ */ }
    finally { setLoading(false) }
  }, [date])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch(JOBS_TOPIC, JOBS_EVENT, () => load(true), true, 30000)

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
    const nq = normVi(q)
    if (!nq) return jobs
    return jobs.filter(j => normVi([j.report, j.ma_may, j.loai_cong_viec, j.soct_khach_hang?.ten_khach_hang, j.soct_khach_hang?.model].join(' ')).includes(nq))
  }, [jobs, q])

  const columns: Column<Job>[] = [
    {
      key: 'report', header: 'Số phiếu', sortValue: j => j.report || '',
      render: j => <span className="font-mono font-bold text-slate-900">{j.report || '—'}</span>,
    },
    {
      key: 'khach', header: 'Khách hàng / Điểm máy', sortValue: j => j.soct_khach_hang?.ten_khach_hang || '',
      render: j => (
        <div>
          <div className="font-medium text-slate-900">{j.soct_khach_hang?.ten_khach_hang || '—'}</div>
          <div className="text-[11px] text-slate-400">{j.soct_khach_hang?.vi_tri_dat_may || j.soct_khach_hang?.dia_chi || ''}{j.ma_may ? ` · ${j.ma_may}` : ''}</div>
        </div>
      ),
    },
    {
      key: 'loai', header: 'Loại việc', sortValue: j => j.loai_cong_viec,
      render: j => <Badge tone="blue">{j.loai_cong_viec}</Badge>,
    },
    {
      key: 'ktv', header: 'KTV', sortValue: j => j.soct_users?.full_name || '',
      render: j => j.soct_users?.full_name
        ? <span className="text-slate-700">{j.soct_users.full_name}</span>
        : <span className="text-slate-400 italic">—</span>,
    },
    {
      key: 'ket_qua', header: 'Trạng thái', align: 'center', sortValue: j => j.ket_qua,
      render: j => <Badge tone={(KET_QUA_TONE[j.ket_qua] || 'slate') as BadgeTone}>{j.ket_qua}</Badge>,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">Bản xem trước /v2 · chỉ xem</span>
        <DateText value={date} className="font-mono" />
      </div>

      <StatRow>
        <StatCard label="Chờ nhận" value={counts.cho} sub="phiếu chưa ai nhận" tone="amber" icon={Clock} />
        <StatCard label="Đã giao" value={counts.giao} sub="chờ KTV tới nơi" tone="blue" icon={Send} />
        <StatCard label="Đang làm" value={counts.lam} sub="KTV đang xử lý" tone="indigo" icon={Wrench} />
        <StatCard label="Hoàn thành" value={counts.xong} sub="trong hôm nay" tone="emerald" icon={CheckCircle2} />
      </StatRow>

      <Card>
        <Toolbar
          left={<SearchInput value={q} onChange={setQ} placeholder="Tìm số phiếu, khách, máy…" className="w-64" />}
          right={
            <button onClick={() => load()} className="h-8 px-3 rounded-md border border-slate-200 text-slate-600 text-xs font-medium flex items-center gap-1.5 hover:bg-slate-50">
              <RefreshCw className="w-3.5 h-3.5" /> Tải lại
            </button>
          }
        />
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(j) => j.id}
          loading={loading}
          defaultSort={{ key: 'report', asc: false }}
          empty={q ? 'Không khớp tìm kiếm.' : 'Hôm nay chưa có phiếu nào.'}
        />
      </Card>
    </div>
  )
}
