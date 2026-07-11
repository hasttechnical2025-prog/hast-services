"use client"

import { useState } from "react"
import { PasskeyManager } from "@/components/PasskeyButtons"

// Form đổi mật khẩu (dùng chung mobile). Đổi xong -> server xóa phiên -> về màn gốc "/".
function ChangePasswordForm({ notify }: { notify: (msg: string, ok: boolean) => void }) {
  const [oldPw, setOldPw] = useState("")
  const [np, setNp] = useState("")
  const [np2, setNp2] = useState("")
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!oldPw || !np) return notify('Nhập đủ mật khẩu cũ và mới', false)
    if (np.length < 6) return notify('Mật khẩu mới tối thiểu 6 ký tự', false)
    if (np !== np2) return notify('Xác nhận mật khẩu mới không khớp', false)
    setBusy(true)
    try {
      const r = await fetch('/api/auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_password: oldPw, new_password: np }),
      })
      const j = await r.json()
      if (!r.ok) { notify(j.error || 'Đổi mật khẩu thất bại', false); return }
      notify('Đã đổi mật khẩu. Đăng nhập lại...', true)
      setTimeout(() => { window.location.href = '/' }, 1500) // phiên đã bị xóa -> về màn gốc
    } catch { notify('Lỗi kết nối', false) } finally { setBusy(false) }
  }

  const inputCls = "w-full h-10 px-3 rounded-md border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
  return (
    <div className="space-y-2">
      <input type="password" placeholder="Mật khẩu hiện tại" value={oldPw} onChange={e => setOldPw(e.target.value)} className={inputCls} />
      <input type="password" placeholder="Mật khẩu mới (≥ 6 ký tự)" value={np} onChange={e => setNp(e.target.value)} className={inputCls} />
      <input type="password" placeholder="Nhập lại mật khẩu mới" value={np2} onChange={e => setNp2(e.target.value)} className={inputCls} />
      <button type="button" onClick={save} disabled={busy} className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-semibold disabled:opacity-60">
        {busy ? 'Đang lưu...' : 'Đổi mật khẩu'}
      </button>
      <p className="text-[11px] text-slate-400">Đổi xong sẽ đăng xuất để đăng nhập lại. Vân tay / Face ID vẫn dùng được như cũ.</p>
    </div>
  )
}

// Bảng Cài đặt tài khoản cho app mobile (Office /m và KTV /ktv).
export default function AccountSettings({ notify, onClose }: { notify: (msg: string, ok: boolean) => void, onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[90]" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm sm:rounded-xl rounded-t-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="font-bold text-slate-800">Cài đặt tài khoản</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>
        <div className="p-4 space-y-5">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700">Đăng nhập sinh trắc học</h3>
            <p className="text-[11px] text-slate-400">Bật để lần sau đăng nhập / đổi vai trò bằng vân tay · Face ID (ở màn hình chọn vai trò).</p>
            <PasskeyManager onResult={notify} />
          </section>
          <section className="space-y-2 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-700">Đổi mật khẩu</h3>
            <ChangePasswordForm notify={notify} />
          </section>
        </div>
      </div>
    </div>
  )
}
