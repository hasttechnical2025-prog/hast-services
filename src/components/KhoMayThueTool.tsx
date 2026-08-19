"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RefreshCw, Search, PenSquare, X, FileText, AlertTriangle, Printer } from "lucide-react"

// Kho máy thuê: danh sách biên bản giám định máy thuê/CPC lấy từ app Techbot (bảng
// `inspections`, chung Supabase). Xem chi tiết vật tư + sửa; cảnh báo máy đã cho khách khác thuê.
type Insp = {
  id: string
  serial: string
  model: string
  khach_hang: string
  dia_chi: string
  tinh_trang: string
  counter: string
  ktv: string
  ngay: string
  khach_hien_tai: string      // khách đang thuê hiện tại (đối chiếu serial trong HAST)
  loai_hd_hien_tai: string
  da_thue_lai: boolean        // đã cho khách khác thuê so với lúc giám định
  chi_tiet: Record<string, any> // toàn bộ trường phiếu Techbot (xem chi tiết vật tư)
}

// Các mục vật tư/bộ phận trong biên bản Techbot (key trong data.jsonb -> nhãn hiển thị).
const VAT_TU_FIELDS: [string, string][] = [
  ['toner_k', 'Mực đen (K)'], ['toner_c', 'Mực xanh (C)'], ['toner_m', 'Mực hồng (M)'], ['toner_y', 'Mực vàng (Y)'],
  ['drum_k', 'Trống đen (K)'], ['drum_c', 'Trống (C)'], ['drum_m', 'Trống (M)'], ['drum_y', 'Trống (Y)'],
  ['dev_k', 'Mực từ đen (K)'], ['dev_c', 'Mực từ (C)'], ['dev_m', 'Mực từ (M)'], ['dev_y', 'Mực từ (Y)'],
  ['fuse', 'Bộ sấy'], ['belt', 'Đai (belt)'], ['roller', 'Lô / Trục'],
  ['feed0', 'Nạp giấy khay tay'], ['feed1', 'Nạp giấy khay 1'], ['feed2', 'Nạp giấy khay 2'],
  ['feed_df', 'Nạp giấy (DF)'], ['feed_du', 'Nạp giấy (DU)'],
  ['finisher', 'Finisher'], ['options', 'Tùy chọn'], ['others', 'Khác'],
]

const norm = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
const fmtDate = (s: string) => { if (!s) return ''; const d = new Date(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` }

export default function KhoMayThueTool({ showNotification }: { showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [rows, setRows] = useState<Insp[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [onlyReRented, setOnlyReRented] = useState(false)
  const [editing, setEditing] = useState<Insp | null>(null)
  const [detail, setDetail] = useState<Insp | null>(null)
  const [saving, setSaving] = useState(false)
  const [vatTu, setVatTu] = useState<Record<string, string>>({}) // chi tiết trống/mực khi sửa

  // Nạp chi tiết trống/mực khi MỞ modal sửa (key theo id -> không reset khi gõ trường khác).
  useEffect(() => {
    if (!editing) return
    const d = editing.chi_tiet || {}
    const v: Record<string, string> = {}
    for (const [k] of VAT_TU_FIELDS) v[k] = String(d[k] ?? '')
    setVatTu(v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id])

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/kho-may-thue')
      const j = await res.json()
      if (res.ok) setRows(j.data || [])
      else showNotification('error', j.error || 'Lỗi tải danh sách')
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setLoading(false) }
  }, [showNotification])

  useEffect(() => { fetchList() }, [fetchList])

  // Tìm không dấu (serial + model + khách + khách đang thuê + KTV) + lọc "đã cho khách khác thuê".
  const filtered = useMemo(() => {
    const toks = norm(q.trim()).split(/\s+/).filter(Boolean)
    return rows.filter(r => {
      if (onlyReRented && !r.da_thue_lai) return false
      if (!toks.length) return true
      const hay = norm(`${r.serial} ${r.model} ${r.khach_hang} ${r.khach_hien_tai} ${r.dia_chi} ${r.ktv}`)
      return toks.every(t => hay.includes(t))
    })
  }, [rows, q, onlyReRented])

  const reRentedCount = useMemo(() => rows.filter(r => r.da_thue_lai).length, [rows])

  // Xuất lại BIÊN BẢN GIÁM ĐỊNH .docx (đúng mẫu Techbot) để in. Tải file rồi mở Word in.
  const exportBienBan = async (r: Insp) => {
    try {
      const res = await fetch(`/api/admin/kho-may-thue/bien-ban?id=${encodeURIComponent(r.id)}`)
      if (!res.ok) { const j = await res.json().catch(() => ({})); showNotification('error', j.error || 'Lỗi xuất biên bản'); return }
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') || ''
      const fname = decodeURIComponent((cd.match(/filename="?([^"]+)"?/) || [])[1] || 'Bien-ban-giam-dinh.docx')
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fname; a.click(); URL.revokeObjectURL(url)
      showNotification('success', 'Đã xuất biên bản giám định (.docx).')
    } catch { showNotification('error', 'Lỗi kết nối') }
  }

  const save = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/kho-may-thue', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, khach_hang: editing.khach_hang, dia_chi: editing.dia_chi, tinh_trang: editing.tinh_trang, counter: editing.counter, vat_tu: vatTu }),
      })
      if (res.ok) { showNotification('success', 'Đã cập nhật biên bản.'); setEditing(null); fetchList() }
      else { const e = await res.json(); showNotification('error', e.error || 'Lỗi lưu') }
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm serial / khách / model..." className="pl-9 bg-white w-72" />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer select-none">
          <input type="checkbox" checked={onlyReRented} onChange={e => setOnlyReRented(e.target.checked)} className="w-4 h-4 accent-rose-600" />
          Chỉ máy đã cho khách khác thuê {reRentedCount > 0 && <span className="text-rose-600 font-semibold">({reRentedCount})</span>}
        </label>
        <Button variant="outline" onClick={fetchList} disabled={loading} className="gap-1 h-9">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
        </Button>
        <span className="text-sm text-slate-500 ml-auto">{filtered.length} máy</span>
      </div>

      <p className="text-xs text-slate-400">Nguồn: biên bản giám định do app Techbot lập (dùng chung dữ liệu). &quot;Khách đang thuê&quot; đối chiếu serial với máy thuê/CPC trong HAST.</p>

      <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Serial</th>
              <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Model</th>
              <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Khách lúc giám định</th>
              <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Khách đang thuê (HAST)</th>
              <th className="text-left px-3 py-2 font-semibold">Tình trạng</th>
              <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Counter</th>
              <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Ngày</th>
              <th className="text-center px-3 py-2 font-semibold whitespace-nowrap">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center text-slate-400 py-8">Đang tải...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center text-slate-400 py-8">Không có biên bản nào.</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className={`border-t border-slate-100 hover:bg-slate-50/60 align-top ${r.da_thue_lai ? 'bg-rose-50/40' : ''}`}>
                <td className="px-3 py-2 font-mono whitespace-nowrap">{r.serial || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.model || '—'}</td>
                <td className="px-3 py-2">{r.khach_hang || '—'}</td>
                <td className="px-3 py-2">
                  {r.khach_hien_tai
                    ? <span className={r.da_thue_lai ? 'text-rose-700 font-medium' : 'text-slate-600'}>
                        {r.da_thue_lai && <AlertTriangle className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />}{r.khach_hien_tai}
                      </span>
                    : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2 min-w-[16rem] text-slate-600">{r.tinh_trang || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.counter || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.ngay)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="flex items-center justify-center gap-3">
                    <button onClick={() => setDetail(r)} title="Xem chi tiết vật tư" className="text-slate-500 hover:text-blue-700"><FileText className="w-4 h-4" /></button>
                    <button onClick={() => exportBienBan(r)} title="Xuất biên bản giám định (.docx) để in" className="text-slate-500 hover:text-emerald-700"><Printer className="w-4 h-4" /></button>
                    <button onClick={() => setEditing({ ...r })} title="Sửa biên bản" className="text-blue-600 hover:text-blue-800"><PenSquare className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL CHI TIẾT VẬT TƯ */}
      {detail && (() => {
        const d = detail.chi_tiet || {}
        const vt = VAT_TU_FIELDS.filter(([k]) => String(d[k] ?? '').trim())
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onMouseDown={() => setDetail(null)}>
            <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onMouseDown={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-slate-100">
                <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2"><FileText className="w-5 h-5 text-blue-600" /> Chi tiết giám định</h3>
                <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {detail.da_thue_lai && (
                  <div className="text-sm bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-rose-700 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Máy đã <b>cho khách khác thuê</b>. Lúc giám định: <b>{detail.khach_hang || '—'}</b> → hiện đang thuê: <b>{detail.khach_hien_tai}</b>{detail.loai_hd_hien_tai ? ` (${detail.loai_hd_hien_tai})` : ''}.</span>
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <Info label="Serial" value={detail.serial} mono />
                  <Info label="Model" value={detail.model} />
                  <Info label="Mã máy" value={d.code} mono />
                  <Info label="Khách lúc giám định" value={detail.khach_hang} />
                  <Info label="Khách đang thuê (HAST)" value={detail.khach_hien_tai} />
                  <Info label="Counter" value={detail.counter} />
                  <Info label="KTV giám định" value={detail.ktv} />
                  <Info label="Ngày lập" value={fmtDate(detail.ngay)} />
                  <Info label="Ngày kiểm tra" value={d.ins_date} />
                </div>

                {String(d.machine_condition ?? '').trim() && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold text-slate-400 uppercase">Tình trạng chung</div>
                    <div className="text-sm text-slate-700 bg-slate-50 rounded-md px-3 py-2 whitespace-pre-wrap">{d.machine_condition}</div>
                  </div>
                )}
                {String(d.ly_do ?? '').trim() && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold text-slate-400 uppercase">Lý do giám định</div>
                    <div className="text-sm text-slate-700 bg-slate-50 rounded-md px-3 py-2 whitespace-pre-wrap">{d.ly_do}</div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-slate-400 uppercase">Chi tiết vật tư / bộ phận ({vt.length})</div>
                  {vt.length === 0 ? (
                    <p className="text-xs text-slate-400">Biên bản không ghi chi tiết vật tư.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 border border-slate-200 rounded-lg p-3">
                      {vt.map(([k, label]) => (
                        <div key={k} className="flex items-center justify-between gap-2 text-sm border-b border-dashed border-slate-100 py-0.5">
                          <span className="text-slate-500">{label}</span>
                          <span className="font-medium text-slate-800 text-right">{String(d[k])}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setDetail(null); setEditing({ ...detail }) }} className="gap-1"><PenSquare className="w-4 h-4" /> Sửa</Button>
                <Button onClick={() => setDetail(null)}>Đóng</Button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* MODAL SỬA (nội dung chung + chi tiết trống mực) */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onMouseDown={() => setEditing(null)}>
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onMouseDown={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-800">Cập nhật biên bản</h3>
                <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Máy <b className="font-mono">{editing.serial || '—'}</b> · {editing.model || '—'} · lập {fmtDate(editing.ngay)}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Khách hàng (lúc giám định)</label>
                  <Input value={editing.khach_hang} onChange={e => setEditing({ ...editing, khach_hang: e.target.value })} className="bg-white" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Địa chỉ</label>
                  <Input value={editing.dia_chi} onChange={e => setEditing({ ...editing, dia_chi: e.target.value })} className="bg-white" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Counter (đen / màu)</label>
                  <Input value={editing.counter} onChange={e => setEditing({ ...editing, counter: e.target.value })} className="bg-white" placeholder="VD: 12.000 / 3.400" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Tình trạng máy</label>
                  <textarea value={editing.tinh_trang} onChange={e => setEditing({ ...editing, tinh_trang: e.target.value })} rows={4} className="w-full p-2.5 rounded-md border border-slate-200 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* Chi tiết trống / mực / vật tư — ghi vào biên bản Techbot (data jsonb). Để trống = bỏ qua. */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase">Chi tiết trống / mực / vật tư</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 border border-slate-200 rounded-lg p-3">
                  {VAT_TU_FIELDS.map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-24 shrink-0">{label}</span>
                      <Input value={vatTu[k] ?? ''} onChange={e => setVatTu({ ...vatTu, [k]: e.target.value })} className="h-8 bg-white text-sm flex-1" placeholder="—" />
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Hủy</Button>
              <Button onClick={save} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Info({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] font-bold text-slate-400 uppercase">{label}</div>
      <div className={`text-sm text-slate-800 ${mono ? 'font-mono' : ''}`}>{String(value ?? '').trim() || '—'}</div>
    </div>
  )
}
