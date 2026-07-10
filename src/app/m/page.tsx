"use client"

import { useState, useEffect } from "react"
import { QrCode, ClipboardList, ShoppingCart, LogOut, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasskeyLoginButton } from "@/components/PasskeyButtons"

type User = { id: string, full_name: string, role: string }

const OFFICE_ROLES = ['admin', 'tech_admin'] // bản mobile chỉ cho admin + tech_admin
// Giao việc mobile KHÔNG phát sinh vật tư -> bỏ Giao mực / Thay vật tư
const EXCLUDE_LOAI = ['Giao mực', 'Thay vật tư']
const DEFAULT_LOAI = ['Lắp máy', 'Sửa máy', 'Bảo trì', 'Bảo hành', 'Hỗ trợ thầu', 'Hỗ trợ đại lý', 'Khiếu nại', 'Kiểm tra', 'Khác']

const fmtDate = (s: string) => { if (!s) return ''; const d = new Date(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` }

export default function OfficeMobile() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [tab, setTab] = useState<'qr' | 'giao' | 'dat'>('giao')
  const [notif, setNotif] = useState<{ type: 'success' | 'error', msg: string } | null>(null)
  const notify = (type: 'success' | 'error', msg: string) => { setNotif({ type, msg }); setTimeout(() => setNotif(null), 4000) }

  const [loginForm, setLoginForm] = useState({ username: "", password: "" })
  const [loginLoading, setLoginLoading] = useState(false)

  const [customers, setCustomers] = useState<any[]>([])
  const [technicians, setTechnicians] = useState<any[]>([])
  const [loaiOptions, setLoaiOptions] = useState<string[]>(DEFAULT_LOAI.filter(l => !EXCLUDE_LOAI.includes(l)))

  const fetchData = async () => {
    try {
      const [c, u, d] = await Promise.all([
        fetch('/api/admin/khach-hang'), fetch('/api/admin/users'), fetch('/api/admin/danh-muc'),
      ])
      const cj = await c.json(); if (cj.data) setCustomers(cj.data)
      const uj = await u.json(); if (uj.data) setTechnicians(uj.data)
      const dj = await d.json()
      const list = Array.isArray(dj.data)
        ? dj.data.filter((x: any) => x.nhom === 'loai_cong_viec' && x.active !== false).sort((a: any, b: any) => a.thu_tu - b.thu_tu).map((x: any) => x.gia_tri)
        : []
      setLoaiOptions((list.length ? list : DEFAULT_LOAI).filter((l: string) => !EXCLUDE_LOAI.includes(l)))
    } catch { notify('error', 'Không tải được dữ liệu') }
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const { data } = await res.json()
          if (data.role === 'ktv') { window.location.href = '/ktv'; return }
          if (OFFICE_ROLES.includes(data.role)) { setUser(data); fetchData() }
          else setDenied(true)
        }
      } catch { /* chưa đăng nhập */ } finally { setLoading(false) }
    })()
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoginLoading(true)
    try {
      const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loginForm) })
      const j = await res.json()
      if (!res.ok) { notify('error', j.error || 'Đăng nhập thất bại'); return }
      if (!OFFICE_ROLES.includes(j.data.role)) {
        notify('error', 'Bản mobile chỉ dành cho Admin / Tech Admin.')
        await fetch('/api/auth/logout', { method: 'POST' })
        return
      }
      setUser(j.data); setDenied(false); fetchData()
    } catch { notify('error', 'Lỗi kết nối') } finally { setLoginLoading(false) }
  }

  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); setUser(null) }

  const banner = notif && (
    <div className={`fixed top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow text-sm font-medium ${notif.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>{notif.msg}</div>
  )

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Đang tải...</div>

  if (denied) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-3">
      <p className="text-slate-700 font-semibold">Bản mobile chỉ dành cho Admin / Tech Admin.</p>
      <Button variant="outline" onClick={logout}>Đăng xuất</Button>
    </div>
  )

  if (!user) return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      {banner}
      <form onSubmit={handleLogin} className="w-full max-w-sm bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
        <div className="text-center">
          <h1 className="text-lg font-bold text-slate-800">HAST · Office Mobile</h1>
          <p className="text-xs text-slate-400">Đăng nhập (Admin / Tech Admin)</p>
        </div>
        <Input required placeholder="Tên đăng nhập" value={loginForm.username} onChange={e => setLoginForm({ ...loginForm, username: e.target.value })} />
        <Input required type="password" placeholder="Mật khẩu" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} />
        <Button type="submit" disabled={loginLoading} className="w-full h-11 font-semibold">{loginLoading ? 'Đang xác thực...' : 'Đăng nhập'}</Button>
        <div className="pt-2 border-t border-slate-100">
          <PasskeyLoginButton onResult={(m) => notify('error', m)} className="w-full h-11 bg-slate-800 hover:bg-slate-900 text-white rounded-md font-semibold disabled:opacity-60" />
          <p className="text-[11px] text-slate-400 mt-2 text-center">Hoặc vân tay / Face ID</p>
        </div>
      </form>
    </main>
  )

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {banner}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div>
          <p className="text-[11px] text-slate-400">Office Mobile · <span className="uppercase">{user.role}</span></p>
          <h1 className="font-bold text-slate-800 text-sm">{user.full_name}</h1>
        </div>
        <button onClick={logout} className="text-slate-400 hover:text-red-500 p-2" title="Đăng xuất"><LogOut className="w-5 h-5" /></button>
      </header>

      <main className="flex-1 p-4 max-w-md mx-auto w-full">
        {tab === 'qr' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center space-y-4">
            <QrCode className="w-12 h-12 mx-auto text-blue-600" />
            <div>
              <h2 className="font-bold text-slate-800">Quét QR giao bảo trì</h2>
              <p className="text-sm text-slate-500 mt-1">Quét mã máy hàng loạt để giao bảo trì cho một KTV.</p>
            </div>
            <Button onClick={() => { window.location.href = '/admin/scan' }} className="w-full h-11">Mở máy quét QR</Button>
          </div>
        )}

        {tab === 'giao' && (
          <GiaoViecMobile customers={customers} technicians={technicians} loaiOptions={loaiOptions} notify={notify} />
        )}

        {tab === 'dat' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
            Kiểm đơn đặt hàng — đang phát triển (Stage 2).
          </div>
        )}
      </main>

      <nav className="bg-white border-t border-slate-200 grid grid-cols-3 sticky bottom-0 z-30">
        {([['giao', 'Giao việc', ClipboardList], ['qr', 'Quét QR', QrCode], ['dat', 'Đặt hàng', ShoppingCart]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className={`py-2.5 flex flex-col items-center gap-0.5 text-[11px] font-medium ${tab === k ? 'text-blue-600' : 'text-slate-400'}`}>
            <Icon className="w-5 h-5" /> {label}
          </button>
        ))}
      </nav>
    </div>
  )
}

// ── Tab Giao việc mới (không phát sinh vật tư) ──────────────────────────
function GiaoViecMobile({ customers, technicians, loaiOptions, notify }: {
  customers: any[], technicians: any[], loaiOptions: string[], notify: (t: 'success' | 'error', m: string) => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const emptyForm = () => ({ ma_may: "", id_khach_hang: "", loai_cong_viec: loaiOptions[0] || 'Kiểm tra', ktv_id: "", ktv2_id: "", ghi_chu: "" })
  const [form, setForm] = useState(emptyForm())
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const ktvs = technicians.filter(t => t.role === 'ktv')
  const selected = customers.find(c => c.id === form.id_khach_hang)
  const qq = q.trim().toLowerCase()
  const results = (qq
    ? customers.filter(c => `${c.ten_khach_hang || ''} ${c.ma_may || ''} ${c.dia_chi || ''} ${c.model || ''}`.toLowerCase().includes(qq))
    : customers).slice(0, 25)

  const pick = (c: any) => { setForm(f => ({ ...f, id_khach_hang: c.id, ma_may: c.ma_may || f.ma_may })); setOpen(false); setQ("") }

  const submit = async () => {
    if (!form.id_khach_hang) return notify('error', 'Chọn khách hàng / mã máy')
    if (!form.loai_cong_viec) return notify('error', 'Chọn loại việc')
    setSaving(true)
    try {
      const res = await fetch('/api/admin/cong-viec', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ngay: today, ma_may: form.ma_may || null, id_khach_hang: form.id_khach_hang,
          loai_cong_viec: form.loai_cong_viec, ktv_id: form.ktv_id || null, ktv2_id: form.ktv2_id || null,
          ghi_chu: form.ghi_chu || null, km: 0, so_luong: 1, vat_tu: [],
        }),
      })
      const j = await res.json()
      if (!res.ok) { notify('error', j.error || 'Không tạo được phiếu'); return }
      notify('success', form.ktv_id ? 'Đã giao việc cho KTV.' : 'Đã tạo việc (chờ nhận).')
      setForm(emptyForm())
    } catch { notify('error', 'Lỗi kết nối') } finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-800">Giao việc mới</h2>
        <span className="text-xs text-slate-400">Ngày: <b className="text-slate-600">{fmtDate(today)}</b></span>
      </div>
      <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded px-2 py-1">Bản mobile giao việc <b>không phát sinh vật tư</b>. Việc cần vật tư → lập phiếu trên máy tính.</p>

      {/* Khách hàng / Mã máy */}
      <div className="space-y-1 relative">
        <label className="text-xs font-semibold text-slate-600">Khách hàng / Mã máy <span className="text-red-500">*</span></label>
        <Input
          placeholder="Gõ tên khách / mã máy / địa chỉ..."
          value={open ? q : (selected ? `${selected.ten_khach_hang}${selected.ma_may ? ` — ${selected.ma_may}` : ''}` : "")}
          onFocus={() => { setOpen(true); setQ("") }}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          className="bg-white"
        />
        {open && (
          <div className="absolute z-40 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg">
            {results.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-400">Không tìm thấy.</div>
            ) : results.map(c => (
              <button type="button" key={c.id} onMouseDown={e => { e.preventDefault(); pick(c) }} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50">
                <div className="font-medium text-slate-700 truncate">{c.ten_khach_hang}</div>
                <div className="text-[11px] text-slate-400 flex gap-2 flex-wrap">{c.ma_may && <span className="font-mono">Mã: {c.ma_may}</span>}{c.dia_chi && <span className="truncate">· {c.dia_chi}</span>}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loại việc */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-slate-600">Loại công việc <span className="text-red-500">*</span></label>
        <select value={form.loai_cong_viec} onChange={e => setForm({ ...form, loai_cong_viec: e.target.value })} className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
          {loaiOptions.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* KTV chính + kèm */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">KTV chính</label>
          <select value={form.ktv_id} onChange={e => setForm({ ...form, ktv_id: e.target.value, ktv2_id: e.target.value === form.ktv2_id ? "" : form.ktv2_id })} className="w-full h-10 px-2 rounded-md border border-slate-200 text-sm bg-white outline-none">
            <option value="">— Chưa giao —</option>
            {ktvs.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">KTV kèm</label>
          <select value={form.ktv2_id} onChange={e => setForm({ ...form, ktv2_id: e.target.value })} disabled={!form.ktv_id} className="w-full h-10 px-2 rounded-md border border-slate-200 text-sm bg-white outline-none disabled:bg-slate-100">
            <option value="">— Không —</option>
            {ktvs.filter(t => t.id !== form.ktv_id).map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        </div>
      </div>

      {/* Ghi chú */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-slate-600">Ghi chú</label>
        <textarea rows={2} value={form.ghi_chu} onChange={e => setForm({ ...form, ghi_chu: e.target.value })} placeholder="Ghi chú cho KTV..." className="w-full p-2.5 rounded-md border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <Button onClick={submit} disabled={saving} className="w-full h-11 font-semibold">{saving ? 'Đang giao...' : 'Giao việc'}</Button>
    </div>
  )
}
