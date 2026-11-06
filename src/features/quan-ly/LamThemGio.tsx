'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, RefreshCw, FileDown, Download, X } from 'lucide-react'
import { Card, Toolbar, DataTable, useToast, type Column } from '@/ui'
import { useConfirm } from '@/components/ConfirmDialog'
import { useSession } from '@/features/_shell/SessionProvider'
import DateField from '@/components/DateField'
import { thuVN, fmtNgayVN, khoangGio, type OtRow } from '@/lib/ot'

type User = { id: string; full_name: string; role: string }

const ymNow = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const thangLabel = (ym: string) => { const [y, m] = ym.split('-'); return `Tháng ${m}/${y}` }

// Tải CSV (BOM UTF-8) cho Excel đọc tiếng Việt đúng.
function downloadCSV(name: string, rows: string[][]) {
  const body = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url)
}

const lbl = 'block text-xs font-medium text-slate-500 mb-1'
const inp = 'w-full h-9 px-2.5 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white'
const btnMain = 'h-9 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-50'
const btnSub = 'h-9 px-3 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-50'

type FormState = {
  id?: string
  nhan_vien_id: string
  ngay: string
  tu_gio: string
  den_gio: string
  dia_diem: string
  dau_viec: string
  ket_qua: string
  ghi_chu: string
}
const emptyForm = (): FormState => ({ nhan_vien_id: '', ngay: '', tu_gio: '', den_gio: '', dia_diem: '', dau_viec: '', ket_qua: 'Hoàn thành', ghi_chu: '' })

export default function LamThemGio() {
  const { user } = useSession()
  const canEdit = user?.role === 'admin' || user?.role === 'tech_admin'
  const { notify, toastNode } = useToast()
  const { confirm, confirmNode } = useConfirm()

  const [users, setUsers] = useState<User[]>([])
  const [thang, setThang] = useState<string>(ymNow())
  const [nv, setNv] = useState<string>('all')
  const [rows, setRows] = useState<OtRow[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyDel, setBusyDel] = useState<string | null>(null)

  // Danh sách tháng chọn (12 tháng gần nhất + tháng tới).
  const thangOptions = useMemo(() => {
    const list: string[] = []
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1)
    for (let i = 0; i < 14; i++) { list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); d.setMonth(d.getMonth() - 1) }
    return list
  }, [])

  useEffect(() => {
    // Chỉ KTV (giống form giao việc) — OT phân cho kỹ thuật viên.
    fetch('/api/admin/users?ktv=true').then(r => r.ok ? r.json() : null).then(j => {
      if (j?.data) setUsers((j.data as User[]).filter(u => u.full_name))
    }).catch(() => { /* bỏ qua */ })
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/ot?thang=${thang}&nv=${nv}`)
      const j = await res.json()
      if (res.ok) setRows(j.data || [])
      else notify('error', j.error || 'Không tải được danh sách')
    } catch { notify('error', 'Lỗi kết nối!') } finally { setLoading(false) }
  }, [thang, nv, notify])

  useEffect(() => { fetchData() }, [fetchData])

  const save = async () => {
    if (!form) return
    if (!form.nhan_vien_id) { notify('error', 'Chưa chọn nhân viên'); return }
    if (!form.ngay) { notify('error', 'Chưa chọn ngày'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/ot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const j = await res.json()
      if (res.ok) { notify('success', form.id ? 'Đã lưu ca OT.' : 'Đã thêm ca OT.'); setForm(null); fetchData() }
      else notify('error', j.error || 'Không lưu được')
    } catch { notify('error', 'Lỗi kết nối!') } finally { setSaving(false) }
  }

  const del = async (r: OtRow) => {
    if (!(await confirm(`Xóa ca OT ngày ${fmtNgayVN(r.ngay)} của ${r.soct_users?.full_name || ''}?`, { confirmLabel: 'Xóa', danger: true }))) return
    setBusyDel(r.id)
    try {
      const res = await fetch(`/api/admin/ot?id=${r.id}`, { method: 'DELETE' })
      const j = await res.json()
      if (res.ok) { notify('success', 'Đã xóa ca OT.'); fetchData() }
      else notify('error', j.error || 'Không xóa được')
    } catch { notify('error', 'Lỗi kết nối!') } finally { setBusyDel(null) }
  }

  // Xuất Phiếu đăng ký (.docx 1 người / .zip nhiều người). Fetch blob để hiện spinner + bắt lỗi.
  const exportWord = async () => {
    setExporting(true)
    try {
      const res = await fetch(`/api/admin/ot/export?thang=${thang}&nv=${nv}`)
      if (!res.ok) {
        let msg = 'Không xuất được'
        try { msg = (await res.json()).error || msg } catch { /* giữ mặc định */ }
        notify('error', msg); return
      }
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') || ''
      const m = /filename="([^"]+)"/.exec(cd)
      const url = URL.createObjectURL(blob); const a = document.createElement('a')
      a.href = url; a.download = m ? m[1] : `Phieu-dang-ky-OT-${thang}.docx`; a.click(); URL.revokeObjectURL(url)
      notify('success', 'Đã xuất Phiếu đăng ký.')
    } catch { notify('error', 'Lỗi kết nối!') } finally { setExporting(false) }
  }

  const exportCSV = () => {
    const head = ['Ngày', 'Thứ', 'Nhân viên', 'Thời gian', 'Địa điểm', 'Đầu việc cụ thể', 'Kết quả', 'Ghi chú']
    const body = rows.map(r => [
      fmtNgayVN(r.ngay), thuVN(r.ngay), r.soct_users?.full_name || '',
      khoangGio(r.tu_gio, r.den_gio), r.dia_diem || '', r.dau_viec || '', r.ket_qua || '', r.ghi_chu || '',
    ])
    downloadCSV(`Lam-them-gio-${thang}.csv`, [head, ...body])
  }

  const openAdd = () => setForm({ ...emptyForm(), nhan_vien_id: nv !== 'all' ? nv : '' })
  const openEdit = (r: OtRow) => setForm({
    id: r.id, nhan_vien_id: r.nhan_vien_id, ngay: r.ngay,
    tu_gio: r.tu_gio || '', den_gio: r.den_gio || '', dia_diem: r.dia_diem || '',
    dau_viec: r.dau_viec || '', ket_qua: r.ket_qua || 'Hoàn thành', ghi_chu: r.ghi_chu || '',
  })

  const columns: Column<OtRow>[] = [
    { key: 'ngay', header: 'Ngày', sortValue: r => r.ngay, render: r => <span className="font-mono text-xs text-slate-700 whitespace-nowrap">{fmtNgayVN(r.ngay)}</span> },
    { key: 'thu', header: 'Thứ', align: 'center', render: r => <span className="text-slate-500">{thuVN(r.ngay)}</span> },
    { key: 'nv', header: 'Nhân viên', sortValue: r => r.soct_users?.full_name || '', render: r => <span className="font-medium text-slate-800">{r.soct_users?.full_name || '—'}</span> },
    { key: 'gio', header: 'Thời gian', render: r => <span className="whitespace-nowrap text-slate-600">{khoangGio(r.tu_gio, r.den_gio) || '—'}</span> },
    { key: 'dia_diem', header: 'Địa điểm', sortValue: r => r.dia_diem || '', render: r => <span className="text-slate-600">{r.dia_diem || '—'}</span> },
    { key: 'dau_viec', header: 'Đầu việc', render: r => <span className="text-slate-600">{r.dau_viec || '—'}</span> },
    { key: 'ket_qua', header: 'Kết quả', render: r => <span className="text-slate-600">{r.ket_qua || '—'}</span> },
    { key: 'ghi_chu', header: 'Ghi chú', render: r => <span className="text-slate-400 text-xs">{r.ghi_chu || ''}</span> },
    ...(canEdit ? [{
      key: 'act', header: '', align: 'right' as const, render: (r: OtRow) => (
        <div className="flex items-center justify-end gap-1">
          <button onClick={() => openEdit(r)} className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50" title="Sửa"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => del(r)} disabled={busyDel === r.id} className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-rose-200 text-rose-500 hover:bg-rose-50 disabled:opacity-50" title="Xóa"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ),
    }] : []),
  ]

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Làm thêm giờ (OT)</h2>
        <p className="text-xs text-slate-500 mt-0.5">tech_admin phân công ca OT → cuối tháng xuất <b>Phiếu đăng ký</b> theo từng người, ký xác nhận rồi giao Kế toán tính tiền OT.</p>
      </div>

      <Card>
        <Toolbar
          left={<>
            <select value={thang} onChange={e => setThang(e.target.value)} className="h-8 px-2.5 rounded-md border border-slate-200 text-xs bg-white text-slate-700 shadow-2xs outline-none cursor-pointer">
              {thangOptions.map(t => <option key={t} value={t}>{thangLabel(t)}</option>)}
            </select>
            <select value={nv} onChange={e => setNv(e.target.value)} className="h-8 px-2.5 rounded-md border border-slate-200 text-xs bg-white text-slate-700 shadow-2xs outline-none cursor-pointer max-w-[200px]">
              <option value="all">Tất cả nhân viên</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
            <span className="text-xs text-slate-400">{rows.length} ca</span>
          </>}
          right={<>
            {canEdit && <button onClick={openAdd} className={btnMain}><Plus className="w-4 h-4" /> Thêm ca OT</button>}
            <button onClick={exportWord} disabled={exporting || rows.length === 0} className={btnSub}>
              {exporting ? <><RefreshCw className="w-4 h-4 animate-spin" /> Đang xuất…</> : <><FileDown className="w-4 h-4" /> Xuất Phiếu đăng ký</>}
            </button>
            <button onClick={exportCSV} disabled={rows.length === 0} className={btnSub}><Download className="w-4 h-4" /> Xuất CSV</button>
            <button onClick={fetchData} className={btnSub} title="Tải lại"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          </>}
        />
        <DataTable
          columns={columns} rows={rows} rowKey={r => r.id}
          loading={loading} loadingText="Đang tải ca OT..."
          empty={`Chưa có ca OT nào trong ${thangLabel(thang).toLowerCase()}.`}
          defaultSort={{ key: 'ngay', asc: true }}
        />
      </Card>

      {/* Modal thêm/sửa ca OT */}
      {form && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">{form.id ? 'Sửa ca OT' : 'Thêm ca OT'}</h3>
              <button onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={lbl}>Nhân viên <span className="text-rose-500">*</span></label>
                <select value={form.nhan_vien_id} onChange={e => setForm({ ...form, nhan_vien_id: e.target.value })} className={inp}>
                  <option value="">-- Chọn nhân viên --</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Ngày <span className="text-rose-500">*</span></label>
                <DateField value={form.ngay} onChange={v => setForm({ ...form, ngay: v })} heightClass="h-9" className="w-full" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl}>Từ giờ</label>
                  <input type="time" step={1800} value={form.tu_gio} onChange={e => setForm({ ...form, tu_gio: e.target.value })} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Đến giờ</label>
                  <input type="time" step={1800} value={form.den_gio} onChange={e => setForm({ ...form, den_gio: e.target.value })} className={inp} />
                </div>
              </div>
              <div className="col-span-2">
                <label className={lbl}>Địa điểm thực hiện</label>
                <input value={form.dia_diem} onChange={e => setForm({ ...form, dia_diem: e.target.value })} className={inp} placeholder="VD: VP Trung ương Đảng - 1A Hùng Vương" />
              </div>
              <div className="col-span-2">
                <label className={lbl}>Đầu việc cụ thể</label>
                <textarea rows={2} value={form.dau_viec} onChange={e => setForm({ ...form, dau_viec: e.target.value })} className={`${inp} h-auto py-2`} placeholder="Nội dung công việc" />
              </div>
              <div>
                <label className={lbl}>Kết quả công việc</label>
                <input value={form.ket_qua} onChange={e => setForm({ ...form, ket_qua: e.target.value })} className={inp} placeholder="Hoàn thành" />
              </div>
              <div>
                <label className={lbl}>Ghi chú</label>
                <input value={form.ghi_chu} onChange={e => setForm({ ...form, ghi_chu: e.target.value })} className={inp} />
              </div>
            </div>
            <div className="bg-slate-50 px-5 py-3 flex justify-end gap-2 border-t border-slate-100">
              <button onClick={() => setForm(null)} className={btnSub}>Hủy</button>
              <button onClick={save} disabled={saving} className={btnMain}>
                {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Đang lưu…</> : (form.id ? 'Lưu' : 'Thêm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastNode}
      {confirmNode}
    </div>
  )
}
