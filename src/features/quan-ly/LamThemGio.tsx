'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, RefreshCw, FileDown, Download, X, Upload, Check, AlertTriangle } from 'lucide-react'
import { Card, Toolbar, DataTable, useToast, normVi, type Column } from '@/ui'
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

// 'HH:MM' (chịu được '8:0', '08:00:00', khoảng trắng). Rỗng -> ''.
function parseGio(s: string): string {
  const m = /(\d{1,2}):(\d{2})/.exec(String(s || '').trim())
  if (!m) return ''
  const h = Math.min(23, +m[1]), mi = Math.min(59, +m[2])
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}
// DD/MM/YYYY | D/M/YYYY | YYYY-MM-DD -> 'YYYY-MM-DD'; sai -> ''.
function parseNgay(s: string): string {
  const t = String(s || '').trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return ''
}
// Nhận diện cột theo tên tiêu đề (không dấu). Trả về key field hoặc '' (bỏ qua).
function headerKey(h: string): string {
  const n = normVi(h)
  if (/(ho ten|ho va ten|nhan vien|^ten$)/.test(n)) return 'ten'
  if (/^ngay/.test(n)) return 'ngay'
  if (/(tu gio|bat dau|^tu$)/.test(n)) return 'tu_gio'
  if (/(den gio|ket thuc|^den$)/.test(n)) return 'den_gio'
  if (/dia diem/.test(n)) return 'dia_diem'
  if (/(dau viec|noi dung|^cong viec)/.test(n)) return 'dau_viec'
  if (/ket qua/.test(n)) return 'ket_qua'
  if (/ghi chu/.test(n)) return 'ghi_chu'
  return '' // bỏ: TT/STT, Bộ phận, Thứ...
}

type PreviewRow = { ten: string; nhan_vien_id: string | null; ngay: string; tu_gio: string; den_gio: string; dia_diem: string; dau_viec: string; ket_qua: string; ghi_chu: string; loi: string }

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

  // Nhập hàng loạt (chỉ admin) — dán từ Excel danh sách OT cũ.
  const canBulk = user?.role === 'admin'
  const [importOpen, setImportOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [preview, setPreview] = useState<PreviewRow[] | null>(null)
  const [importing, setImporting] = useState(false)
  const nameToId = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of users) m.set(normVi(u.full_name), u.id)
    return m
  }, [users])

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

  // Phân tích text dán (có dòng tiêu đề) -> preview + báo lỗi từng dòng.
  const doParse = () => {
    const lines = pasteText.replace(/\r/g, '').split('\n').filter(l => l.trim())
    if (lines.length < 2) { notify('error', 'Dán ít nhất 1 dòng tiêu đề + 1 dòng dữ liệu.'); setPreview([]); return }
    const split = (l: string) => (l.includes('\t') ? l.split('\t') : l.split(',')).map(c => c.replace(/^"|"$/g, '').trim())
    const header = split(lines[0]).map(headerKey)
    if (header.indexOf('ten') < 0 || header.indexOf('ngay') < 0) {
      notify('error', 'Dòng tiêu đề phải có cột "Họ tên" và "Ngày".'); setPreview([]); return
    }
    const rows: PreviewRow[] = lines.slice(1).map(l => {
      const c = split(l)
      const get = (k: string) => { const i = header.indexOf(k); return i >= 0 ? (c[i] || '') : '' }
      const ten = get('ten')
      const ngay = parseNgay(get('ngay'))
      const id = ten ? (nameToId.get(normVi(ten)) || null) : null
      const loi = !ten ? 'Thiếu tên' : !id ? 'Tên không khớp KTV' : !ngay ? 'Ngày sai định dạng' : ''
      return { ten, nhan_vien_id: id, ngay, tu_gio: parseGio(get('tu_gio')), den_gio: parseGio(get('den_gio')), dia_diem: get('dia_diem'), dau_viec: get('dau_viec'), ket_qua: get('ket_qua') || 'Hoàn thành', ghi_chu: get('ghi_chu'), loi }
    })
    setPreview(rows)
  }

  const doImport = async () => {
    const items = (preview || []).filter(r => !r.loi).map(r => ({
      nhan_vien_id: r.nhan_vien_id, ngay: r.ngay, tu_gio: r.tu_gio, den_gio: r.den_gio,
      dia_diem: r.dia_diem, dau_viec: r.dau_viec, ket_qua: r.ket_qua, ghi_chu: r.ghi_chu,
    }))
    if (!items.length) { notify('error', 'Không có dòng hợp lệ để nhập.'); return }
    setImporting(true)
    try {
      const res = await fetch('/api/admin/ot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) })
      const j = await res.json()
      if (res.ok) { notify('success', `Đã nhập ${j.count} ca OT.`); setImportOpen(false); setPasteText(''); setPreview(null); fetchData() }
      else notify('error', j.error || 'Không nhập được')
    } catch { notify('error', 'Lỗi kết nối!') } finally { setImporting(false) }
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
            {canBulk && <button onClick={() => { setImportOpen(true); setPasteText(''); setPreview(null) }} className={btnSub}><Upload className="w-4 h-4" /> Nhập Excel</button>}
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

      {/* Modal nhập hàng loạt (admin) */}
      {importOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Nhập OT hàng loạt (dán từ Excel)</h3>
              <button onClick={() => setImportOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto">
              <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5 leading-relaxed">
                Copy từ Excel (cả <b>dòng tiêu đề</b>) rồi dán vào ô dưới. Nhận diện cột theo tên tiêu đề:
                <b> Họ tên</b> · <b>Ngày</b> (DD/MM/YYYY) · Từ giờ · Đến giờ · Địa điểm · Đầu việc · Kết quả · Ghi chú.
                Các cột khác (TT, Bộ phận, Thứ…) tự bỏ qua. Tên phải khớp KTV trong hệ thống.
              </div>
              <textarea
                rows={5} value={pasteText} onChange={e => setPasteText(e.target.value)}
                placeholder={'Họ tên\tNgày\tTừ giờ\tĐến giờ\tĐịa điểm\tĐầu việc\tGhi chú\nNguyễn Văn A\t03/10/2026\t08:00\t21:00\tVP TW Đảng\tTrực hội nghị\t'}
                className="w-full p-2.5 rounded-md border border-slate-200 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <div className="flex items-center gap-2">
                <button onClick={doParse} className={btnSub}><RefreshCw className="w-4 h-4" /> Phân tích</button>
                {preview && (
                  <span className="text-xs text-slate-500">
                    <span className="text-emerald-600 font-semibold">{preview.filter(r => !r.loi).length} hợp lệ</span>
                    {preview.some(r => r.loi) && <> · <span className="text-rose-600 font-semibold">{preview.filter(r => r.loi).length} lỗi</span></>}
                  </span>
                )}
              </div>

              {preview && preview.length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-[40vh]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 w-8">#</th>
                          <th className="px-2 py-1.5">Nhân viên</th>
                          <th className="px-2 py-1.5">Ngày</th>
                          <th className="px-2 py-1.5">Giờ</th>
                          <th className="px-2 py-1.5">Địa điểm</th>
                          <th className="px-2 py-1.5">Đầu việc</th>
                          <th className="px-2 py-1.5">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {preview.map((r, i) => (
                          <tr key={i} className={r.loi ? 'bg-rose-50/60' : ''}>
                            <td className="px-2 py-1.5 text-slate-400">{i + 1}</td>
                            <td className="px-2 py-1.5 font-medium text-slate-700">{r.ten || <span className="text-slate-300">—</span>}</td>
                            <td className="px-2 py-1.5 font-mono">{r.ngay ? fmtNgayVN(r.ngay) : <span className="text-slate-300">—</span>}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{khoangGio(r.tu_gio, r.den_gio)}</td>
                            <td className="px-2 py-1.5 text-slate-500 max-w-[180px] truncate">{r.dia_diem}</td>
                            <td className="px-2 py-1.5 text-slate-500 max-w-[180px] truncate">{r.dau_viec}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              {r.loi
                                ? <span className="inline-flex items-center gap-1 text-rose-600"><AlertTriangle className="w-3.5 h-3.5" />{r.loi}</span>
                                : <span className="inline-flex items-center gap-1 text-emerald-600"><Check className="w-3.5 h-3.5" />OK</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {preview && preview.length === 0 && <div className="text-center text-xs text-slate-400 py-4">Chưa có dòng dữ liệu hợp lệ.</div>}
            </div>
            <div className="bg-slate-50 px-5 py-3 flex justify-end gap-2 border-t border-slate-100">
              <button onClick={() => setImportOpen(false)} className={btnSub}>Đóng</button>
              <button onClick={doImport} disabled={importing || !preview || preview.filter(r => !r.loi).length === 0} className={btnMain}>
                {importing ? <><RefreshCw className="w-4 h-4 animate-spin" /> Đang nhập…</> : <>Nhập {preview ? preview.filter(r => !r.loi).length : 0} dòng</>}
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
