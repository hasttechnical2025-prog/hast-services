"use client"

import { useEffect, useState } from "react"
import { browserSupportsWebAuthn } from "@simplewebauthn/browser"
import { Fingerprint, Settings, LogOut, Lock, X, ChevronRight } from "lucide-react"
import { loginWithPasskeyAndRedirect } from "./PasskeyButtons"

// Tấm trượt tài khoản (chạm avatar ở header /m, /ktv). Hiện tài khoản đang đăng nhập +
// "Chuyển vai trò" (Face ID, usernameless → chọn tài khoản khác) + Cài đặt + (Khóa app) + Đăng xuất.
// Người đa role (office ↔ KTV hiện trường) đổi nhanh, không phải về trang chọn vai trò.

type Me = { full_name: string; role: string }
const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin · Văn phòng', tech_admin: 'Tech Admin · Văn phòng', staff: 'Staff · Văn phòng',
  ktv: 'KTV · Hiện trường', kthc: 'Kế toán', kinh_doanh: 'Kinh doanh',
}
const OFFICE = new Set(['admin', 'tech_admin', 'staff', 'kthc', 'kinh_doanh'])
const initials = (name: string) => (name || '?').trim().split(/\s+/).slice(-2).map(w => w[0] || '').join('').toUpperCase() || '?'

export default function AccountSheet({ accent = 'blue', onSettings, onLogout, onLock, onClose, notify }: {
  accent?: 'blue' | 'emerald'
  onSettings: () => void
  onLogout: () => void
  onLock?: () => void
  onClose: () => void
  notify?: (msg: string, ok: boolean) => void
}) {
  const [me, setMe] = useState<Me | null>(null)
  const [supported, setSupported] = useState(false)
  const [switching, setSwitching] = useState(false)

  useEffect(() => { setSupported(browserSupportsWebAuthn()) }, [])
  useEffect(() => { fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(j => setMe(j?.data || null)).catch(() => { }) }, [])

  const isOffice = me ? OFFICE.has(me.role) : true
  const target = isOffice ? 'KTV · Hiện trường' : 'Văn phòng'
  const A = accent === 'emerald'
    ? { chipBg: 'bg-emerald-50', chipText: 'text-emerald-700', avBg: 'bg-emerald-100', avText: 'text-emerald-700' }
    : { chipBg: 'bg-blue-50', chipText: 'text-blue-700', avBg: 'bg-blue-100', avText: 'text-blue-700' }

  const doSwitch = async () => {
    setSwitching(true)
    try { await loginWithPasskeyAndRedirect() }
    catch (e: any) {
      notify?.(e?.name === 'NotAllowedError' ? 'Đã hủy hoặc chưa có khóa trên thiết bị này.' : (e?.message || 'Không chuyển được vai trò'), false)
      setSwitching(false)
    }
  }

  const rowCls = 'w-full flex items-center gap-3 px-2 py-3 rounded-lg text-sm text-slate-700 hover:bg-slate-50 text-left'

  return (
    <div className="fixed inset-0 z-[90] bg-slate-900/50 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-t-2xl p-4 pb-6 space-y-1" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1.5 rounded-full bg-slate-200 mx-auto mb-3" />

        <div className="text-[11px] text-slate-400 px-1">Đang đăng nhập</div>
        <div className="flex items-center gap-3 pb-3 mb-1 border-b border-slate-100">
          <div className={`w-11 h-11 rounded-full ${A.avBg} ${A.avText} flex items-center justify-center font-semibold text-sm`}>{me ? initials(me.full_name) : '…'}</div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-800 truncate">{me?.full_name || 'Đang tải…'}</div>
            {me && <span className={`inline-block mt-0.5 text-[11px] ${A.chipBg} ${A.chipText} px-2 py-0.5 rounded-full`}>{ROLE_LABEL[me.role] || me.role}</span>}
          </div>
        </div>

        {supported && (
          <button onClick={doSwitch} disabled={switching} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-60 text-left">
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><Fingerprint className="w-5 h-5 text-slate-600" /></div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-800">{switching ? 'Đang xác thực…' : 'Chuyển vai trò'}</div>
              <div className="text-[11px] text-slate-500">Sang {target} · vân tay / Face ID</div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>
        )}

        <div className="pt-1">
          <button onClick={onSettings} className={rowCls}><Settings className="w-5 h-5 text-slate-500" /> Cài đặt tài khoản</button>
          {onLock && <button onClick={onLock} className={rowCls}><Lock className="w-5 h-5 text-slate-500" /> Khóa / mở app (bảo trì)</button>}
          <button onClick={onLogout} className="w-full flex items-center gap-3 px-2 py-3 rounded-lg text-sm text-red-600 hover:bg-red-50 text-left"><LogOut className="w-5 h-5" /> Đăng xuất</button>
        </div>

        <button onClick={onClose} className="absolute top-4 right-4 text-slate-300 hover:text-slate-500"><X className="w-5 h-5" /></button>
      </div>
    </div>
  )
}
