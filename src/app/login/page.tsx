'use client'

import { useState, useEffect } from 'react'
import { PasskeyLoginButton } from '@/components/PasskeyButtons'
import { postLoginPath, isMobileDevice } from '@/lib/post-login'

// Cổng ĐĂNG NHẬP office độc lập (thay cho việc mượn /admin).
// Form user/mật khẩu -> POST /api/admin/login (giữ nguyên backend) -> điều hướng theo
// vai trò × thiết bị qua postLoginPath. Đứng NGOÀI layout /qlkt nên không bị guard chặn.
export default function LoginPage() {
  const [form, setForm] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pkMsg, setPkMsg] = useState<string | null>(null)
  // Passkey chỉ hiện trên điện thoại (PC văn phòng không có phần cứng sinh trắc).
  const [mobile, setMobile] = useState(false)
  useEffect(() => { setMobile(isMobileDevice()) }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.username || !form.password || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const j = await res.json()
      if (res.ok) {
        // Thành công -> điều hướng ngay; giữ loading=true vì trang sắp rời đi (phản hồi liên tục).
        window.location.href = postLoginPath(j.data.role)
      } else {
        setError(j.error || 'Đăng nhập thất bại')
        setLoading(false)
      }
    } catch {
      setError('Lỗi kết nối khi đăng nhập')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      {error && (
        <div className="fixed top-4 right-4 z-[9999] p-4 rounded-md shadow-lg border bg-red-50 border-red-200 text-red-800 max-w-sm flex items-start gap-3">
          <div className="text-sm font-medium">{error}</div>
          <button type="button" onClick={() => setError(null)} className="ml-auto shrink-0 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* data-allow-enter: NGOẠI LỆ có chủ đích — Enter = đăng nhập ở CHÍNH form này (xem AGENTS.md).
          Global blocker (NoKeyShortcuts) vẫn chặn Enter ở mọi nơi khác. Rủi ro thấp: cổng một lần,
          trước khi có dữ liệu để lỡ tay. */}
      <form onSubmit={handleSubmit} data-allow-enter className="bg-white p-8 rounded-xl shadow-md border border-slate-200 w-full max-w-sm space-y-5">
        <div className="text-center space-y-1">
          <img src="/logo.png" alt="Logo" className="h-16 w-auto object-contain mx-auto mb-3" />
          <h1 className="text-xl font-bold text-slate-800">Quản trị văn phòng</h1>
          <p className="text-xs text-slate-400">Đăng nhập tài khoản văn phòng để tiếp tục</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Tên đăng nhập</label>
          <input
            required
            placeholder="Nhập tên đăng nhập"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            className="w-full h-11 px-3 rounded-md border border-slate-300 outline-none text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Mật khẩu</label>
          <input
            required
            type="password"
            placeholder="Nhập mật khẩu"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full h-11 px-3 rounded-md border border-slate-300 outline-none text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold transition disabled:opacity-60"
        >
          {loading ? 'Đang xác thực...' : 'Đăng nhập'}
        </button>

        {/* Passkey: CHỈ trên điện thoại. Office (admin/tech_admin) đi hiện trường & KTV
            đăng nhập nhanh bằng vân tay/Face ID; tự điều hướng theo vai trò. */}
        {mobile && (
          <div className="pt-3 mt-1 border-t border-slate-100 space-y-2">
            <PasskeyLoginButton
              onResult={(m) => setPkMsg(m)}
              className="w-full h-11 rounded-md bg-slate-800 hover:bg-slate-900 text-white font-semibold transition disabled:opacity-60"
            />
            <p className="text-xs text-slate-400 text-center">Đăng nhập nhanh bằng vân tay / Face ID (cần bật trước trong app).</p>
            {pkMsg && <p className="text-xs text-amber-600 text-center">{pkMsg}</p>}
          </div>
        )}
      </form>
    </div>
  )
}
