"use client"

import { useState, useEffect } from "react"
import { QrCode, ClipboardList, ShoppingCart, LogOut, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import AccountSettings from "@/components/AccountSettings"

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
  const [showSettings, setShowSettings] = useState(false)
  const [notif, setNotif] = useState<{ type: 'success' | 'error', msg: string } | null>(null)
  const notify = (type: 'success' | 'error', msg: string) => { setNotif({ type, msg }); setTimeout(() => setNotif(null), 4000) }

  const [loginForm, setLoginForm] = useState({ username: "", password: "" })
  const [loginLoading, setLoginLoading] = useState(false)

  const [customers, setCustomers] = useState<any[]>([])
  const [technicians, setTechnicians] = useState<any[]>([])
  const [inventory, setInventory] = useState<any[]>([])
  const [loaiOptions, setLoaiOptions] = useState<string[]>(DEFAULT_LOAI.filter(l => !EXCLUDE_LOAI.includes(l)))
  const [nccOptions, setNccOptions] = useState<string[]>([])

  const fetchData = async () => {
    try {
      const [c, u, d, k] = await Promise.all([
        fetch('/api/admin/khach-hang'), fetch('/api/admin/users'), fetch('/api/admin/danh-muc'), fetch('/api/admin/kho-hang'),
      ])
      const cj = await c.json(); if (cj.data) setCustomers(cj.data)
      const uj = await u.json(); if (uj.data) setTechnicians(uj.data)
      const kj = await k.json(); if (kj.data) setInventory(kj.data)
      const dj = await d.json()
      const dm = Array.isArray(dj.data) ? dj.data : []
      const list = dm.filter((x: any) => x.nhom === 'loai_cong_viec' && x.active !== false).sort((a: any, b: any) => a.thu_tu - b.thu_tu).map((x: any) => x.gia_tri)
      setLoaiOptions((list.length ? list : DEFAULT_LOAI).filter((l: string) => !EXCLUDE_LOAI.includes(l)))
      setNccOptions(dm.filter((x: any) => x.nhom === 'nha_cung_cap' && x.active !== false).sort((a: any, b: any) => a.thu_tu - b.thu_tu).map((x: any) => x.gia_tri))
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

  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/' }

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
        <p className="text-[11px] text-slate-400 text-center">Đăng nhập vân tay / Face ID ở màn hình chọn vai trò (trang chủ).</p>
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
        <div className="flex items-center">
          <button onClick={() => setShowSettings(true)} className="text-slate-400 hover:text-blue-600 p-2" title="Cài đặt"><Settings className="w-5 h-5" /></button>
          <button onClick={logout} className="text-slate-400 hover:text-red-500 p-2" title="Đăng xuất"><LogOut className="w-5 h-5" /></button>
        </div>
      </header>
      {showSettings && <AccountSettings notify={(m, ok) => notify(ok ? 'success' : 'error', m)} onClose={() => setShowSettings(false)} />}

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
          <DatHangMobile inventory={inventory} nccOptions={nccOptions} role={user.role} notify={notify} />
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

// ── Tab Đặt hàng: xem đơn, tech_admin tạo NHÁP, admin ghi hàng về ──────────
function DatHangMobile({ inventory, nccOptions, role, notify }: {
  inventory: any[], nccOptions: string[], role: string, notify: (t: 'success' | 'error', m: string) => void
}) {
  const isAdmin = role === 'admin'
  const today = new Date().toISOString().split('T')[0]
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'list' | 'create'>('list')
  const [onlyPending, setOnlyPending] = useState(true)
  const [receiving, setReceiving] = useState<{ ctId: string, sl: string } | null>(null)
  const daNhan = (l: any) => (l.soct_hang_ve_dot || []).reduce((s: number, h: any) => s + (Number(h.so_luong_nhan) || 0), 0)

  const fetchOrders = async () => {
    setLoading(true)
    try { const r = await fetch('/api/admin/dat-hang'); const j = await r.json(); if (j.data) setOrders(j.data) }
    catch { notify('error', 'Không tải được đơn hàng') } finally { setLoading(false) }
  }
  useEffect(() => { fetchOrders() }, [])

  // Ghi hàng về (chỉ admin)
  const saveReceipt = async (ctId: string, sl: string) => {
    if (!(parseInt(sl) > 0)) return notify('error', 'Nhập số lượng nhận')
    try {
      const r = await fetch('/api/admin/hang-ve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id_dat_hang_ct: ctId, ngay_nhan: today, so_luong_nhan: sl }) })
      const j = await r.json()
      if (!r.ok) return notify('error', j.error || 'Không ghi được')
      notify('success', 'Đã ghi hàng về.'); setReceiving(null); fetchOrders()
    } catch { notify('error', 'Lỗi kết nối') }
  }

  const list = orders.filter(o => onlyPending ? !o.hoan_thanh : true)

  if (mode === 'create') return <TaoDonNhap inventory={inventory} nccOptions={nccOptions} notify={notify} onDone={() => { setMode('list'); fetchOrders() }} onCancel={() => setMode('list')} />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)} className="w-4 h-4 accent-blue-600" /> Chỉ đơn chưa đủ hàng</label>
        <Button onClick={() => setMode('create')} className="h-9 text-xs gap-1"><span className="text-base leading-none">+</span> Tạo đơn nháp</Button>
      </div>

      {loading ? <p className="text-center text-slate-400 text-sm py-8">Đang tải...</p>
        : list.length === 0 ? <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">Không có đơn.</div>
        : list.map(o => (
          <div key={o.id} className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-slate-800 text-sm truncate">{o.nha_cung_cap || 'Chưa có NCC'}{o.so_don_hang && <span className="text-slate-400 font-normal"> · {o.so_don_hang}</span>}</div>
                <div className="text-[11px] text-slate-400">Đặt {fmtDate(o.ngay_dat)}</div>
              </div>
              <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${o.hoan_thanh ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : o.da_dat ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{o.hoan_thanh ? 'Đủ hàng' : o.da_dat ? 'Đã đặt' : 'Nháp'}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {(o.soct_dat_hang_ct || []).map((l: any) => {
                const nhan = daNhan(l); const thieu = l.sl_dat - nhan
                return (
                  <div key={l.id} className="py-1.5 text-xs">
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0"><span className="font-mono font-medium text-slate-700">{l.ma_hang}</span> <span className="text-slate-500">{l.soct_kho_hang?.ten_hang || ''}</span></div>
                      <div className="shrink-0 text-slate-500">Đặt {l.sl_dat} · Nhận {nhan} · <span className={thieu > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600'}>Thiếu {thieu}</span></div>
                    </div>
                    {isAdmin && thieu > 0 && (
                      receiving && receiving.ctId === l.id ? (
                        <div className="flex items-center gap-2 mt-1">
                          <Input type="number" min="1" placeholder="SL nhận" value={receiving.sl} onChange={e => setReceiving({ ctId: l.id, sl: e.target.value })} className="h-8 w-24 bg-white" />
                          <Button onClick={() => saveReceipt(l.id, receiving.sl)} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700">Lưu</Button>
                          <button onClick={() => setReceiving(null)} className="text-xs text-slate-400">Hủy</button>
                        </div>
                      ) : (
                        <button onClick={() => setReceiving({ ctId: l.id, sl: String(thieu) })} className="mt-1 text-[11px] text-blue-600 font-medium">+ Ghi hàng về</button>
                      )
                    )}
                  </div>
                )
              })}
            </div>
            {o.ghi_chu && <div className="text-[11px] text-slate-400 italic">Ghi chú: {o.ghi_chu}</div>}
          </div>
        ))}
      {!isAdmin && <p className="text-[11px] text-slate-400 text-center pt-1">Ghi hàng về do Admin thực hiện. Bạn có thể tạo đơn nháp để về văn phòng hoàn thiện.</p>}
    </div>
  )
}

// Form tạo đơn NHÁP (admin + tech_admin) — để về PC sửa/hoàn thiện
function TaoDonNhap({ inventory, nccOptions, notify, onDone, onCancel }: {
  inventory: any[], nccOptions: string[], notify: (t: 'success' | 'error', m: string) => void, onDone: () => void, onCancel: () => void
}) {
  const [ncc, setNcc] = useState("")
  const [soDon, setSoDon] = useState("")
  const [lines, setLines] = useState<{ ma_hang: string, sl_dat: string }[]>([])
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const qq = q.trim().toLowerCase()
  const results = (qq ? inventory.filter(i => `${i.ma_hang || ''} ${i.ten_hang || ''} ${i.model || ''}`.toLowerCase().includes(qq)) : inventory).slice(0, 25)
  const addLine = (ma: string) => { setLines(prev => prev.some(l => l.ma_hang === ma) ? prev : [...prev, { ma_hang: ma, sl_dat: '1' }]); setOpen(false); setQ("") }
  const setSl = (ma: string, v: string) => setLines(prev => prev.map(l => l.ma_hang === ma ? { ...l, sl_dat: v.replace(/\D/g, '') } : l))
  const rm = (ma: string) => setLines(prev => prev.filter(l => l.ma_hang !== ma))

  const save = async () => {
    if (!ncc.trim()) return notify('error', 'Nhập nhà cung cấp')
    const valid = lines.filter(l => l.ma_hang && parseInt(l.sl_dat) > 0)
    if (valid.length === 0) return notify('error', 'Thêm ít nhất một mã hàng')
    setSaving(true)
    try {
      const r = await fetch('/api/admin/dat-hang', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nha_cung_cap: ncc.trim(), so_don_hang: soDon.trim() || null, da_dat: false, lines: valid }) })
      const j = await r.json()
      if (!r.ok) return notify('error', j.error || 'Không lưu được')
      notify('success', 'Đã lưu đơn nháp. Về văn phòng hoàn thiện trên PC.'); onDone()
    } catch { notify('error', 'Lỗi kết nối') } finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-800">Tạo đơn nháp</h2>
        <button onClick={onCancel} className="text-xs text-slate-400">← Danh sách</button>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-semibold text-slate-600">Nhà cung cấp <span className="text-red-500">*</span></label>
        <Input list="m-ncc" placeholder="Gõ / chọn NCC" value={ncc} onChange={e => setNcc(e.target.value)} className="bg-white" />
        <datalist id="m-ncc">{nccOptions.map(o => <option key={o} value={o} />)}</datalist>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-semibold text-slate-600">Số đơn (tùy chọn)</label>
        <Input placeholder="PO-..." value={soDon} onChange={e => setSoDon(e.target.value)} className="bg-white font-mono" />
      </div>
      <div className="space-y-1 relative">
        <label className="text-xs font-semibold text-slate-600">Thêm mã hàng</label>
        <Input placeholder="Gõ mã / tên / model..." value={q} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 200)} onChange={e => { setQ(e.target.value); setOpen(true) }} className="bg-white" />
        {open && (
          <div className="absolute z-40 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg">
            {results.length === 0 ? <div className="px-3 py-2 text-sm text-slate-400">Không tìm thấy.</div>
              : results.map(i => (
                <button type="button" key={i.ma_hang} onMouseDown={e => { e.preventDefault(); addLine(i.ma_hang) }} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50">
                  <span className="font-mono font-medium text-slate-700">{i.ma_hang}</span> <span className="text-slate-500">- {i.ten_hang}</span>
                </button>
              ))}
          </div>
        )}
      </div>
      {lines.length > 0 && (
        <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
          {lines.map(l => {
            const inv = inventory.find(i => i.ma_hang === l.ma_hang)
            return (
              <div key={l.ma_hang} className="flex items-center gap-2 p-2">
                <div className="flex-1 min-w-0"><div className="font-mono font-bold text-xs text-slate-700">{l.ma_hang}</div><div className="text-[10px] text-slate-400 truncate">{inv?.ten_hang || ''}</div></div>
                <Input type="number" min="1" value={l.sl_dat} onChange={e => setSl(l.ma_hang, e.target.value)} className="h-8 w-16 text-center bg-white" />
                <button onClick={() => rm(l.ma_hang)} className="text-slate-400 hover:text-red-500 text-lg leading-none px-1">×</button>
              </div>
            )
          })}
        </div>
      )}
      <Button onClick={save} disabled={saving} className="w-full h-11 font-semibold">{saving ? 'Đang lưu...' : 'Lưu đơn nháp'}</Button>
    </div>
  )
}
