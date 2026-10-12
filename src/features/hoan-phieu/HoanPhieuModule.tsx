'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardList, AlertTriangle, Users, Search, X, Send, ClipboardCheck, Loader2, RefreshCw } from 'lucide-react'
import { useConfirm } from '@/components/ConfirmDialog'
import { JOBS_TOPIC, JOBS_EVENT } from '@/lib/realtime'
import { useRealtimeRefetch } from '@/lib/useRealtime'
import { useSession } from '@/features/_shell/SessionProvider'
import { StatCard, StatRow, DataTable, type Column, Card, DateText } from '@/ui'
import { listPhieuCung, togglePhieu, submitAllPhieu, remindPhieu } from './api'

type Row = {
  id: string; ngay: string; report: string | null; loai_cong_viec: string
  ktv_id: string | null; da_nop_phieu: boolean; ngay_nop_phieu: string | null
  soct_khach_hang?: { ten_khach_hang?: string } | null
  soct_users?: { full_name?: string } | null
}

const daysOf = (s: string) => Math.floor((Date.now() - new Date(s).getTime()) / 86400000)

export function HoanPhieuModule({ notify }: { notify: (type: 'success' | 'error', msg: string) => void }) {
  const { user, config } = useSession()
  const role = user?.role || ''
  const nguongNgay = parseInt(config.phieu_cung_canh_bao_ngay || '3') || 3
  const { confirm, confirmNode } = useConfirm()

  const [list, setList] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [fKtv, setFKtv] = useState('')
  const [fChuaNop, setFChuaNop] = useState(true)
  const [busy, setBusy] = useState<'remind' | 'all' | null>(null)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try { setList(await listPhieuCung(search)) }   // search có giá trị -> tìm số phiếu TOÀN CỤC (server)
    catch (e: any) { if (e?.message !== 'UNAUTH') notify('error', e?.message || 'Lỗi tải danh sách') }
    finally { setLoading(false) }
  }, [notify, search])

  // Lần đầu tải có spinner; đổi ô tìm -> nạp lại NGẦM (không chớp "Đang tải", giữ danh sách cũ
  // tới khi có dữ liệu mới) + debounce -> danh sách không "nhảy".
  const firstRef = useRef(true)
  useEffect(() => {
    const first = firstRef.current
    const t = setTimeout(() => { load(!first); firstRef.current = false }, first ? 0 : 300)
    return () => clearTimeout(t)
  }, [load])
  useRealtimeRefetch(JOBS_TOPIC, JOBS_EVENT, () => load(true), true, 0)

  const ktvs = useMemo(() => Array.from(new Map(list.filter(r => r.ktv_id).map(r => [r.ktv_id!, r.soct_users?.full_name || '—'])).entries()), [list])
  const chuaNop = useMemo(() => list.filter(r => !r.da_nop_phieu), [list])
  const quaHan = useMemo(() => chuaNop.filter(r => daysOf(r.ngay) >= nguongNgay), [chuaNop, nguongNgay])
  const ktvNo = useMemo(() => new Set(chuaNop.filter(r => r.ktv_id).map(r => r.ktv_id)).size, [chuaNop])

  // Đang tìm số phiếu -> BỎ QUA "chỉ chưa nộp" để tra ra cả phiếu đã nộp. Server đã lọc theo số phiếu.
  const searching = !!search.trim()
  const filtered = useMemo(() => list.filter(r => {
    if (fChuaNop && !searching && r.da_nop_phieu) return false
    if (fKtv === 'none' && r.ktv_id) return false
    if (fKtv && fKtv !== 'none' && r.ktv_id !== fKtv) return false
    return true
  }), [list, fChuaNop, fKtv, searching])

  const filterActive = searching || !!fKtv || !fChuaNop
  const clearAll = () => { setSearch(''); setFKtv(''); setFChuaNop(true) }

  const toggle = async (r: Row) => {
    try { await togglePhieu(r.id, !r.da_nop_phieu); load(true) }
    catch (e: any) { notify('error', e?.message || 'Lỗi') }
  }
  const remind = async () => {
    setBusy('remind')
    try { const r = await remindPhieu(); notify('success', r.message || `Đã nhắc ${r.sent} KTV qua Telegram${r.skipped ? `, bỏ qua ${r.skipped} (chưa liên kết)` : ''}.`) }
    catch (e: any) { notify('error', e?.message || 'Lỗi') } finally { setBusy(null) }
  }
  const submitAll = async () => {
    if (!(await confirm(`Đánh dấu ĐÃ NỘP cho toàn bộ ${chuaNop.length} phiếu chưa nộp?`, { confirmLabel: 'Nộp tất cả', danger: false }))) return
    setBusy('all')
    try { const n = await submitAllPhieu(); notify('success', `Đã đánh dấu nộp ${n} phiếu.`); load(true) }
    catch (e: any) { notify('error', e?.message || 'Lỗi') } finally { setBusy(null) }
  }

  const columns: Column<Row>[] = [
    { key: 'ngay', header: 'Ngày', sortValue: r => r.ngay, tdClassName: 'whitespace-nowrap', render: r => <DateText value={r.ngay} /> },
    { key: 'report', header: 'Số phiếu', sortValue: r => r.report || '', render: r => <span className="font-medium text-slate-800">{r.report || '—'}</span> },
    { key: 'khach', header: 'Khách hàng', sortValue: r => r.soct_khach_hang?.ten_khach_hang || '', render: r => r.soct_khach_hang?.ten_khach_hang || '—' },
    { key: 'loai', header: 'Loại việc', sortValue: r => r.loai_cong_viec, render: r => r.loai_cong_viec },
    { key: 'ktv', header: 'KTV', sortValue: r => r.soct_users?.full_name || '', render: r => r.soct_users?.full_name || <span className="text-amber-600 italic">Chưa giao</span> },
    {
      key: 'ton', header: 'Tồn (ngày)', align: 'center', sortValue: r => daysOf(r.ngay),
      render: r => { const d = daysOf(r.ngay); const tre = !r.da_nop_phieu && d >= nguongNgay; return <span className={`font-semibold ${tre ? 'text-red-600' : 'text-slate-500'}`}>{r.da_nop_phieu ? '—' : `${d}${tre ? ' ⚠️' : ''}`}</span> },
    },
    {
      key: 'nop', header: 'Đã nộp', align: 'center', sortValue: r => r.da_nop_phieu ? 1 : 0,
      render: r => r.da_nop_phieu
        ? <button onClick={() => toggle(r)} className="inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200" title={r.ngay_nop_phieu ? `Nộp ${new Date(r.ngay_nop_phieu).toLocaleDateString('vi-VN')}` : ''}>Đã nộp</button>
        : <button onClick={() => toggle(r)} className="inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-semibold border bg-slate-100 text-slate-500 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200">Đánh dấu nộp</button>,
    },
  ]

  const selCls = 'h-9 px-2 text-xs rounded-md border border-slate-200 bg-white outline-none focus:border-blue-500'

  return (
    <div className="space-y-4">
      <StatRow>
        <StatCard label="Chưa nộp" value={chuaNop.length.toLocaleString('vi-VN')} sub="phiếu cần thu" tone="blue" icon={ClipboardList} />
        <StatCard label="Quá hạn" value={quaHan.length.toLocaleString('vi-VN')} sub={`tồn ≥ ${nguongNgay} ngày`} tone="rose" icon={AlertTriangle} />
        <StatCard label="KTV còn nợ" value={ktvNo.toLocaleString('vi-VN')} sub="kỹ thuật viên" tone="amber" icon={Users} />
      </StatRow>

      <Card>
        <div className="p-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input placeholder="Tìm số phiếu..." className="w-full h-9 pl-9 pr-7 text-xs rounded-md border border-slate-200 bg-white outline-none focus:border-blue-500" value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
          </div>
          <select value={fKtv} onChange={e => setFKtv(e.target.value)} className={selCls}>
            <option value="">KTV: Tất cả</option>
            <option value="none">Chưa giao</option>
            {ktvs.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <label className={`flex items-center gap-1.5 text-xs select-none ${searching ? 'text-slate-400 cursor-not-allowed' : 'text-slate-600 cursor-pointer'}`} title={searching ? 'Đang tìm số phiếu nên bỏ qua bộ lọc này' : ''}>
            <input type="checkbox" checked={fChuaNop && !searching} disabled={searching} onChange={e => setFChuaNop(e.target.checked)} className="w-4 h-4 accent-blue-600 disabled:opacity-50" /> Chỉ chưa nộp
          </label>
          {filterActive && <button onClick={clearAll} className="text-xs text-rose-600 hover:underline font-medium">Bỏ lọc</button>}
          <span className="text-xs text-slate-500 ml-auto whitespace-nowrap">{filtered.length} phiếu</span>
          {role === 'admin' && (
            <button onClick={submitAll} disabled={busy === 'all' || chuaNop.length === 0} title="Nộp toàn bộ phiếu chưa nộp" className="h-9 px-3 rounded-md border border-emerald-300 text-emerald-700 text-xs font-medium hover:bg-emerald-50 disabled:opacity-50 flex items-center gap-1.5">{busy === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />} Nộp toàn bộ</button>
          )}
          <button onClick={remind} disabled={busy === 'remind' || chuaNop.length === 0} title="Nhắc KTV nộp phiếu qua Telegram" className="h-9 px-3 rounded-md border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5">{busy === 'remind' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Nhắc KTV</button>
        </div>
        <DataTable columns={columns} rows={filtered} rowKey={r => r.id} loading={loading} loadingText="Đang tải phiếu..." defaultSort={{ key: 'ngay', asc: false }} empty="Không có phiếu." />
      </Card>
      {confirmNode}
    </div>
  )
}
