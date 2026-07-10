"use client"

import { useEffect, useState } from "react"
import { startRegistration, startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser"

// Nút BẬT đăng nhập sinh trắc học (đăng ký Passkey) — dùng khi ĐÃ đăng nhập.
export function PasskeyRegisterButton({ className, onResult }: { className?: string, onResult?: (msg: string, ok: boolean) => void }) {
  const [supported, setSupported] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setSupported(browserSupportsWebAuthn()) }, [])
  if (!supported) return null

  const run = async () => {
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
      onResult?.('Đã bật đăng nhập vân tay / Face ID cho thiết bị này.', true)
    } catch (e: any) {
      if (e?.name === 'NotAllowedError') onResult?.('Đã hủy thao tác.', false)
      else if (e?.name === 'InvalidStateError') onResult?.('Thiết bị này đã đăng ký rồi.', true)
      else onResult?.(e?.message || 'Không đăng ký được.', false)
    } finally { setBusy(false) }
  }

  return (
    <button type="button" onClick={run} disabled={busy} className={className}>
      {busy ? 'Đang xử lý...' : '🔐 Bật đăng nhập vân tay / Face ID'}
    </button>
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
      window.location.href = j.data?.role === 'ktv' ? '/ktv' : '/admin'
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
