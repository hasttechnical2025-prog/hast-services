"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RefreshCw, Search, X, LogOut, AlertTriangle, Boxes } from "lucide-react"

// Trang mobile CHỈ ĐỌC cho bộ phận Kinh doanh: tra cứu Kho máy thuê (biên bản giám định
// từ Techbot). Không sửa. Dùng chung API /api/admin/kho-may-thue (GET mở cho role kinh_doanh).

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

export default function KhoThueMobilePage() {
  const [user, setUser] = useState<{ full_name: string; role: string } | null>(null)
  const [booting, setBooting] = useState(true)
  const [loginForm, setLoginForm] = useState({ username: "", password: "" })
  const [loginLoading, setLoginLoading] = useState(false)
  const [err, setErr] = useState("")

  const [rows, setRows] = useState<Insp[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState("")
  const [detail, setDetail] = useState<Insp | null>(null)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/kho-may-thue')
      const j = await res.json()
      if (res.ok) setRows(j.data || [])
    } catch { /* giữ dữ liệu cũ */ } finally { setLoading(false) }
  }, [])

  // Khôi phục phiên
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

  const filtered = useMemo(() => {
    const toks = norm(q.trim()).split(/\s+/).filter(Boolean)
    if (!toks.length) return rows
    return rows.filter(r => {
      const hay = norm(`${r.serial} ${r.model} ${r.khach_hang} ${r.khach_hien_tai} ${r.dia_chi}`)
      return toks.every(t => hay.includes(t))
    })
  }, [rows, q])

  // ── Màn đăng nhập ─────────────────────────────────────────────
  if (booting) return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Đang tải…</div>

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 w-full max-w-sm p-6 space-y-4">
          <div className="text-center space-y-1">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto"><Boxes className="w-6 h-6" /></div>
            <h1 className="text-lg font-bold text-slate-800">Kho máy thuê</h1>
            <p className="text-xs text-slate-400">Bộ phận Kinh doanh — đăng nhập để tra cứu</p>
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

  // ── Danh sách ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-2">
        <Boxes className="w-5 h-5 text-blue-600 shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-800 leading-tight">Kho máy thuê</div>
          <div className="text-[11px] text-slate-400 truncate">{user.full_name}</div>
        </div>
        <button onClick={fetchList} className="ml-auto p-2 text-slate-400 hover:text-blue-600" title="Làm mới"><RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} /></button>
        <button onClick={logout} className="p-2 text-slate-400 hover:text-rose-600" title="Đăng xuất"><LogOut className="w-5 h-5" /></button>
      </div>

      <div className="p-4 space-y-3 max-w-xl mx-auto">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm serial / model / khách..." className="pl-9 bg-white h-11" />
        </div>
        <div className="text-xs text-slate-400">{filtered.length} máy · chạm để xem chi tiết vật tư.</div>

        {loading && rows.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-10">Đang tải…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-10">Không có máy nào.</p>
        ) : (
          <div className="space-y-2.5">
            {filtered.map(r => (
              <button key={r.id} onClick={() => setDetail(r)}
                className={`w-full text-left bg-white rounded-xl border p-3.5 active:bg-slate-50 ${r.da_thue_lai ? 'border-rose-200' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-800">{r.serial || '—'}</span>
                  <span className="text-xs text-slate-400">{fmtDate(r.ngay)}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{r.model || '—'}</div>
                <div className="text-sm text-slate-700 mt-1.5">{r.khach_hang || '—'}</div>
                {r.khach_hien_tai && (
                  <div className={`text-xs mt-1 ${r.da_thue_lai ? 'text-rose-700 font-medium' : 'text-slate-500'}`}>
                    {r.da_thue_lai && <AlertTriangle className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />}
                    Đang thuê: {r.khach_hien_tai}
                  </div>
                )}
                {r.tinh_trang && <div className="text-xs text-slate-400 mt-1 line-clamp-2">{r.tinh_trang}</div>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chi tiết */}
      {detail && (() => {
        const d = detail.chi_tiet || {}
        const vt = VAT_TU_FIELDS.filter(([k]) => String(d[k] ?? '').trim())
        return (
          <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" onMouseDown={() => setDetail(null)}>
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[88vh] flex flex-col overflow-hidden" onMouseDown={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-slate-100">
                <h3 className="text-base font-semibold text-slate-800">Chi tiết giám định</h3>
                <button onClick={() => setDetail(null)} className="text-slate-400 p-1"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {detail.da_thue_lai && (
                  <div className="text-sm bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-rose-700 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Máy đã <b>cho khách khác thuê</b>: hiện đang thuê <b>{detail.khach_hien_tai}</b>{detail.loai_hd_hien_tai ? ` (${detail.loai_hd_hien_tai})` : ''}.</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Info label="Serial" value={detail.serial} mono />
                  <Info label="Model" value={detail.model} />
                  <Info label="Khách lúc giám định" value={detail.khach_hang} />
                  <Info label="Khách đang thuê" value={detail.khach_hien_tai} />
                  <Info label="Counter" value={detail.counter} />
                  <Info label="Ngày lập" value={fmtDate(detail.ngay)} />
                </div>
                {String(d.machine_condition ?? '').trim() && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold text-slate-400 uppercase">Tình trạng chung</div>
                    <div className="text-sm text-slate-700 bg-slate-50 rounded-md px-3 py-2 whitespace-pre-wrap">{d.machine_condition}</div>
                  </div>
                )}
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-slate-400 uppercase">Chi tiết vật tư ({vt.length})</div>
                  {vt.length === 0 ? (
                    <p className="text-xs text-slate-400">Biên bản không ghi chi tiết vật tư.</p>
                  ) : (
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                      {vt.map(([k, label]) => (
                        <div key={k} className="flex items-center justify-between gap-2 text-sm px-3 py-1.5">
                          <span className="text-slate-500">{label}</span>
                          <span className="font-medium text-slate-800 text-right">{String(d[k])}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="p-4 border-t border-slate-100">
                <Button onClick={() => setDetail(null)} className="w-full h-11">Đóng</Button>
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
