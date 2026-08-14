"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RefreshCw, Search, X, LogOut, AlertTriangle, Boxes, FileText } from "lucide-react"

// Trang CHỈ ĐỌC cho bộ phận Kinh doanh: tra cứu Kho máy thuê (biên bản giám định từ
// Techbot). Tối ưu cho PC (bảng rộng). Không sửa. GET /api/admin/kho-may-thue mở cho role kinh_doanh.

type Insp = {
  id: string; serial: string; model: string; khach_hang: string; dia_chi: string
  tinh_trang: string; counter: string; ktv: string; ngay: string
  khach_hien_tai: string; loai_hd_hien_tai: string; da_thue_lai: boolean
  chi_tiet: Record<string, any>
}

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
const OK_ROLES = ['kinh_doanh', 'admin']

export default function KhoThuePage() {
  const [user, setUser] = useState<{ full_name: string; role: string } | null>(null)
  const [booting, setBooting] = useState(true)
  const [loginForm, setLoginForm] = useState({ username: "", password: "" })
  const [loginLoading, setLoginLoading] = useState(false)
  const [err, setErr] = useState("")

  const [rows, setRows] = useState<Insp[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState("")
  const [onlyReRented, setOnlyReRented] = useState(false)
  const [detail, setDetail] = useState<Insp | null>(null)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/kho-may-thue')
      const j = await res.json()
      if (res.ok) setRows(j.data || [])
    } catch { /* giữ dữ liệu cũ */ } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const { data } = await res.json()
          if (OK_ROLES.includes(data.role)) { setUser(data); fetchList() }
        }
      } catch { /* chưa đăng nhập */ } finally { setBooting(false) }
    })()
  }, [fetchList])

  const login = async () => {
    setErr(""); setLoginLoading(true)
    try {
      const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loginForm) })
      const j = await res.json()
      if (!res.ok) { setErr(j.error || 'Đăng nhập thất bại'); return }
      if (!OK_ROLES.includes(j.data.role)) { setErr('Tài khoản này không phải Kinh doanh.'); await fetch('/api/auth/logout', { method: 'POST' }); return }
      setUser(j.data); setLoginForm({ username: "", password: "" }); fetchList()
    } catch { setErr('Lỗi kết nối') } finally { setLoginLoading(false) }
  }

  const logout = async () => { try { await fetch('/api/auth/logout', { method: 'POST' }) } catch {} setUser(null); setRows([]) }

  const reRentedCount = useMemo(() => rows.filter(r => r.da_thue_lai).length, [rows])
  const filtered = useMemo(() => {
    const toks = norm(q.trim()).split(/\s+/).filter(Boolean)
    return rows.filter(r => {
      if (onlyReRented && !r.da_thue_lai) return false
      if (!toks.length) return true
      const hay = norm(`${r.serial} ${r.model} ${r.khach_hang} ${r.khach_hien_tai} ${r.dia_chi}`)
      return toks.every(t => hay.includes(t))
    })
  }, [rows, q, onlyReRented])

  // ── Màn đăng nhập ─────────────────────────────────────────────
  if (booting) return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Đang tải…</div>

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 w-full max-w-sm p-6 space-y-4">
          <div className="text-center space-y-1">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto"><Boxes className="w-6 h-6" /></div>
            <h1 className="text-lg font-bold text-slate-800">Kho máy thuê</h1>
            <p className="text-xs text-slate-400">Đăng nhập để tra cứu</p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Tên đăng nhập</label>
              <Input value={loginForm.username} onChange={e => setLoginForm({ ...loginForm, username: e.target.value })} className="bg-white" autoComplete="username" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Mật khẩu</label>
              <Input type="password" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} className="bg-white" autoComplete="current-password" />
            </div>
            {err && <p className="text-sm text-rose-600">{err}</p>}
            <Button onClick={login} disabled={loginLoading || !loginForm.username || !loginForm.password} className="w-full h-11">
              {loginLoading ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Danh sách (bảng, tối ưu PC) ───────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Thanh trên */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><Boxes className="w-5 h-5" /></div>
          <div className="min-w-0">
            <div className="text-base font-bold text-slate-800 leading-tight">Kho máy thuê</div>
            <div className="text-xs text-slate-400">{user.full_name}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" onClick={fetchList} disabled={loading} className="gap-1 h-9"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới</Button>
            <Button variant="outline" onClick={logout} className="gap-1 h-9 text-slate-600"><LogOut className="w-4 h-4" /> Đăng xuất</Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        {/* Bộ lọc */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm serial / model / khách..." className="pl-9 bg-white w-80" />
          </div>
          <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer select-none">
            <input type="checkbox" checked={onlyReRented} onChange={e => setOnlyReRented(e.target.checked)} className="w-4 h-4 accent-rose-600" />
            Chỉ máy đã cho khách khác thuê {reRentedCount > 0 && <span className="text-rose-600 font-semibold">({reRentedCount})</span>}
          </label>
          <span className="text-sm text-slate-500 ml-auto">{filtered.length} máy</span>
        </div>

        {/* Bảng */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">Serial</th>
                <th className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">Model</th>
                <th className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">Khách lúc giám định</th>
                <th className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">Khách đang thuê</th>
                <th className="text-left px-3 py-2.5 font-semibold">Tình trạng</th>
                <th className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">Counter</th>
                <th className="text-center px-3 py-2.5 font-semibold whitespace-nowrap">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-slate-400 py-10">Đang tải…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-slate-400 py-10">Không có máy nào.</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className={`border-t border-slate-100 align-top hover:bg-slate-50/60 ${r.da_thue_lai ? 'bg-rose-50/40' : ''}`}>
                  <td className="px-3 py-2.5 font-mono whitespace-nowrap">{r.serial || '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.model || '—'}</td>
                  <td className="px-3 py-2.5">{r.khach_hang || '—'}</td>
                  <td className="px-3 py-2.5">
                    {r.khach_hien_tai
                      ? <span className={r.da_thue_lai ? 'text-rose-700 font-medium' : 'text-slate-600'}>
                          {r.da_thue_lai && <AlertTriangle className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />}{r.khach_hien_tai}
                        </span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 min-w-[16rem] text-slate-600">{r.tinh_trang || '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.counter || '—'}</td>
                  <td className="px-3 py-2.5 text-center">
                    <button onClick={() => setDetail(r)} title="Xem chi tiết vật tư" className="text-slate-500 hover:text-blue-700 inline-flex"><FileText className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Chi tiết */}
      {detail && (() => {
        const d = detail.chi_tiet || {}
        const vt = VAT_TU_FIELDS.filter(([k]) => String(d[k] ?? '').trim())
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onMouseDown={() => setDetail(null)}>
            <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onMouseDown={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-slate-100">
                <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2"><FileText className="w-5 h-5 text-blue-600" /> Chi tiết giám định</h3>
                <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
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
                  <Info label="Khách đang thuê" value={detail.khach_hien_tai} />
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
              <div className="p-4 border-t border-slate-100 flex justify-end">
                <Button onClick={() => setDetail(null)}>Đóng</Button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function Info({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] font-bold text-slate-400 uppercase">{label}</div>
      <div className={`text-sm text-slate-800 break-words ${mono ? 'font-mono' : ''}`}>{String(value ?? '').trim() || '—'}</div>
    </div>
  )
}
