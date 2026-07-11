"use client"

import { useEffect, useState } from "react"
import { startRegistration, startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser"

// Quản lý sinh trắc học (dùng khi ĐÃ đăng nhập, trong Cài đặt của app mobile):
// hiện trạng thái Đã bật ✓ / Chưa bật + nút Thêm thiết bị / Gỡ.
export function PasskeyManager({ onResult }: { onResult?: (msg: string, ok: boolean) => void }) {
  const [supported, setSupported] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setSupported(browserSupportsWebAuthn()) }, [])
  const load = async () => {
    try { const r = await fetch('/api/auth/webauthn/credentials'); const j = await r.json(); if (r.ok) setCount(j.count) } catch { /* ignore */ }
  }
  useEffect(() => { if (supported) load() }, [supported])

  if (!supported) return <p className="text-xs text-slate-400">Thiết bị này không hỗ trợ đăng nhập sinh trắc học.</p>

  const register = async () => {
    setBusy(true)
    try {
      const optRes = await fetch('/api/auth/webauthn/register/options', { method: 'POST' })
      const optionsJSON = await optRes.json()
      if (!optRes.ok) throw new Error(optionsJSON.error || 'Không tạo được yêu cầu')
      const att = await startRegistration({ optionsJSON })
      const verRes = await fetch('/api/auth/webauthn/register/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(att),
      })
      const j = await verRes.json()
      if (!verRes.ok) throw new Error(j.error || 'Xác minh thất bại')
      onResult?.('Đã bật đăng nhập vân tay / Face ID trên thiết bị này.', true); load()
    } catch (e: any) {
      if (e?.name === 'NotAllowedError') onResult?.('Đã hủy thao tác.', false)
      else if (e?.name === 'InvalidStateError') { onResult?.('Thiết bị này đã đăng ký rồi.', true); load() }
      else onResult?.(e?.message || 'Không đăng ký được.', false)
    } finally { setBusy(false) }
  }

  const removeAll = async () => {
    if (!window.confirm('Gỡ đăng nhập sinh trắc học cho tài khoản này? Sau đó phải đăng nhập bằng mật khẩu.')) return
    setBusy(true)
    try {
      const r = await fetch('/api/auth/webauthn/credentials', { method: 'DELETE' })
      if (!r.ok) throw new Error('Không gỡ được')
      onResult?.('Đã gỡ đăng nhập sinh trắc học.', true); load()
    } catch (e: any) { onResult?.(e?.message || 'Lỗi', false) } finally { setBusy(false) }
  }

  const enabled = (count ?? 0) > 0
  return (
    <div className="space-y-2">
      <div className="text-sm">
        {count === null ? <span className="text-slate-400">Đang kiểm tra...</span>
          : enabled ? <span className="text-emerald-600 font-semibold">✓ Đã bật vân tay / Face ID</span>
          : <span className="text-slate-500">Chưa bật vân tay / Face ID</span>}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={register} disabled={busy} className="h-10 px-4 bg-slate-800 hover:bg-slate-900 text-white rounded-md text-sm font-semibold disabled:opacity-60">
          {busy ? 'Đang xử lý...' : enabled ? '➕ Thêm thiết bị này' : '🔐 Bật vân tay / Face ID'}
        </button>
        {enabled && (
          <button type="button" onClick={removeAll} disabled={busy} className="h-10 px-4 border border-red-200 text-red-600 hover:bg-red-50 rounded-md text-sm font-medium disabled:opacity-60">Gỡ</button>
        )}
      </div>
    </div>
  )
}

// Nút ĐĂNG NHẬP bằng sinh trắc học (usernameless) — dùng ở màn đăng nhập / chọn vai trò.
// Thành công -> tự điều hướng theo vai trò của tài khoản đã chọn.
export function PasskeyLoginButton({ className, onResult }: { className?: string, onResult?: (msg: string, ok: boolean) => void }) {
  const [supported, setSupported] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setSupported(browserSupportsWebAuthn()) }, [])
  if (!supported) return null

  const run = async () => {
    setBusy(true)
    try {
      const optRes = await fetch('/api/auth/webauthn/login/options', { method: 'POST' })
      const optionsJSON = await optRes.json()
      if (!optRes.ok) throw new Error(optionsJSON.error || 'Không tạo được yêu cầu')
      const asr = await startAuthentication({ optionsJSON })
      const verRes = await fetch('/api/auth/webauthn/login/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(asr),
      })
      const j = await verRes.json()
      if (!verRes.ok) throw new Error(j.error || 'Đăng nhập thất bại')
      const role = j.data?.role
      if (role === 'ktv') { window.location.href = '/ktv'; return }
      // Office: trên điện thoại vào bản Office Mobile gọn (/m), PC vào dashboard đầy đủ
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768
      window.location.href = isMobile ? '/m' : '/admin'
    } catch (e: any) {
      if (e?.name === 'NotAllowedError') onResult?.('Đã hủy hoặc chưa có khóa trên thiết bị.', false)
      else onResult?.(e?.message || 'Không đăng nhập được.', false)
      setBusy(false)
    }
  }

  return (
    <button type="button" onClick={run} disabled={busy} className={className}>
      {busy ? 'Đang xác thực...' : '🔓 Đăng nhập bằng vân tay / Face ID'}
    </button>
  )
}
