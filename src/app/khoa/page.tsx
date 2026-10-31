'use client'

import { useState, useEffect } from 'react'
import { Lock, Unlock, ShieldAlert, RefreshCw, CheckCircle2, LogIn, ArrowLeft } from 'lucide-react'
import { useConfirm } from '@/components/ConfirmDialog'

// Trang KHÓA / MỞ app bảo trì bằng 1 nút — thêm vào màn hình chính điện thoại (/khoa).
// CẦN phiên admin: /api/auth/me phải trả role=admin. Chốt chặn thật ở server (PUT cau-hinh = admin-only).
// Dùng dạng { items } khi lưu để clearCauHinhCache -> khóa có hiệu lực NGAY.
type Me = { id: string; full_name: string; role: string } | null

export default function KhoaPage() {
  const [ready, setReady] = useState(false)
  const [me, setMe] = useState<Me>(null)
  const [baoTri, setBaoTri] = useState(false)
  const [working, setWorking] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const { confirm, confirmNode } = useConfirm()

  // Về lại app: trong PWA standalone (nhất là iOS) không có nút back -> tự quay lại /m nếu không có lịch sử.
  const goBack = () => { if (window.history.length > 1) window.history.back(); else window.location.href = '/m' }

  const loadState = async () => {
    try {
      const meRes = await fetch('/api/auth/me', { cache: 'no-store' })
      if (!meRes.ok) { setMe(null); return }
      const u = (await meRes.json())?.data || null
      setMe(u)
      if (u?.role === 'admin') {
        const cRes = await fetch('/api/admin/cau-hinh', { cache: 'no-store' })
        if (cRes.ok) { const cfg = (await cRes.json())?.data || {}; setBaoTri(cfg.bao_tri === '1') }
      }
    } catch { setMe(null) } finally { setReady(true) }
  }
  useEffect(() => { loadState() }, [])

  const toggle = async () => {
    const locking = !baoTri
    const ok = await confirm(
      locking
        ? 'KHÓA app bảo trì?\n\nOffice · KTV · Kinh doanh sẽ KHÔNG dùng được app (chỉ Admin vào được). Người dùng thường sẽ thấy màn báo lỗi máy chủ.'
        : 'MỞ KHÓA app?\n\nMọi người dùng lại bình thường ngay.',
      { confirmLabel: locking ? 'Khóa app' : 'Mở khóa', danger: locking }
    )
    if (!ok) return
    setWorking(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/cau-hinh', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: { bao_tri: locking ? '1' : '0' } }),
      })
      if (!r.ok) { const j = await r.json().catch(() => ({})); setMsg({ type: 'error', text: j.error || 'Không lưu được, thử lại.' }); return }
      setBaoTri(locking)
      setMsg({ type: 'success', text: locking ? 'Đã KHÓA app.' : 'Đã MỞ KHÓA app.' })
    } catch { setMsg({ type: 'error', text: 'Lỗi kết nối, thử lại.' }) } finally { setWorking(false) }
  }

  // ----- Trạng thái tải -----
  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Đang kiểm tra…
      </div>
    )
  }

  // ----- Chưa phải admin -----
  if (me?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-5">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-center space-y-4">
          <ShieldAlert className="w-12 h-12 mx-auto text-amber-500" />
          <div>
            <h1 className="text-lg font-bold text-slate-800">Cần đăng nhập Admin</h1>
            <p className="text-sm text-slate-500 mt-1">{me ? `Tài khoản hiện tại (${me.full_name}) không có quyền khóa app.` : 'Chưa đăng nhập. Hãy đăng nhập bằng tài khoản Admin để khóa / mở app.'}</p>
          </div>
          {/* Giữ ?qt khi chuyển sang /login: nếu đang bảo trì + mở /khoa?qt=<khóa> thì không bị
              proxy 404 ở trang đăng nhập (href trơn "/login" sẽ bị chặn). */}
          <a
            href="/login"
            onClick={(e) => { e.preventDefault(); window.location.href = '/login' + (window.location.search || '') }}
            className="inline-flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold"
          >
            <LogIn className="w-5 h-5" /> Đăng nhập
          </a>
        </div>
        {confirmNode}
      </div>
    )
  }

  // ----- Admin: trạng thái + nút lớn -----
  const locked = baoTri
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-5">
      <div className="w-full max-w-sm space-y-5">
        <button onClick={goBack} className="text-sm text-slate-400 hover:text-slate-600 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Quay lại ứng dụng</button>
        <div className="text-center">
          <img src="/logo.png" alt="Logo" className="h-12 w-auto object-contain mx-auto mb-2" />
          <p className="text-xs text-slate-400">Xin chào {me.full_name}</p>
        </div>

        {/* Thẻ trạng thái */}
        <div className={`rounded-2xl border p-6 text-center space-y-3 ${locked ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${locked ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
            {locked ? <Lock className="w-8 h-8" /> : <Unlock className="w-8 h-8" />}
          </div>
          <div>
            <div className={`text-2xl font-extrabold ${locked ? 'text-rose-700' : 'text-emerald-700'}`}>{locked ? 'ĐANG KHÓA' : 'ĐANG MỞ'}</div>
            <p className="text-sm text-slate-500 mt-1">{locked ? 'Chỉ Admin vào được. Người dùng thường thấy màn lỗi máy chủ.' : 'Mọi người đang dùng app bình thường.'}</p>
          </div>
        </div>

        {/* Nút lớn */}
        <button
          onClick={toggle}
          disabled={working}
          className={`w-full h-16 rounded-2xl text-white text-lg font-bold inline-flex items-center justify-center gap-2.5 transition disabled:opacity-60 ${locked ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
        >
          {working ? <><RefreshCw className="w-6 h-6 animate-spin" /> Đang xử lý…</>
            : locked ? <><Unlock className="w-6 h-6" /> MỞ KHÓA APP</>
              : <><Lock className="w-6 h-6" /> KHÓA APP</>}
        </button>

        {msg && (
          <div className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 ${msg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
            {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <ShieldAlert className="w-4 h-4 shrink-0" />}
            {msg.text}
          </div>
        )}

        <button onClick={() => { setMsg(null); loadState() }} className="w-full h-10 rounded-xl border border-slate-200 bg-white text-slate-500 text-sm inline-flex items-center justify-center gap-1.5 hover:bg-slate-50">
          <RefreshCw className="w-4 h-4" /> Tải lại trạng thái
        </button>

        <p className="text-center text-[11px] text-slate-400 leading-relaxed">
          Khóa = chế độ bảo trì. Nếu lỡ đăng xuất lúc đang khóa, mở lại bằng link kín <span className="font-mono">…/?qt=&lt;khóa&gt;</span> (đặt ở Hệ thống › Cài đặt).
        </p>
      </div>
      {confirmNode}
    </div>
  )
}
