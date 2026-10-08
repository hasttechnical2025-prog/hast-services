'use client'
import { useState, useEffect } from 'react'
import { Bell, BellRing } from 'lucide-react'

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlB64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

// Nút BẬT/TẮT thông báo trình duyệt (Web Push) — dành cho kthc nhận "có hóa đơn cần xuất".
export default function PushToggle({ notify }: { notify?: (type: 'success' | 'error', msg: string) => void }) {
  const [supported, setSupported] = useState(true)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID) { setSupported(false); return }
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      if (!reg) return
      try { const sub = await reg.pushManager.getSubscription(); setSubscribed(!!sub) } catch { }
    }).catch(() => { })
  }, [])

  const enable = async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.register('/sw-push.js')
      await navigator.serviceWorker.ready
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { notify?.('error', 'Bạn chưa cho phép thông báo. Vào cài đặt trình duyệt (biểu tượng 🔒 trên thanh địa chỉ) để bật lại.'); return }
      let sub = await reg.pushManager.getSubscription()
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID) })
      const res = await fetch('/api/admin/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub }) })
      if (!res.ok) { const j = await res.json().catch(() => ({})); notify?.('error', j.error || 'Lỗi lưu đăng ký'); return }
      setSubscribed(true); notify?.('success', 'Đã bật thông báo hóa đơn. Bạn sẽ nhận popup kể cả khi chưa mở trang (miễn trình duyệt đang chạy).')
    } catch (e: any) { notify?.('error', 'Không bật được thông báo: ' + (e?.message || '')) } finally { setBusy(false) }
  }

  const disable = async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (sub) { await fetch('/api/admin/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe() }
      setSubscribed(false); notify?.('success', 'Đã tắt thông báo hóa đơn.')
    } catch (e: any) { notify?.('error', 'Lỗi: ' + (e?.message || '')) } finally { setBusy(false) }
  }

  if (!supported) return null
  return (
    <button type="button" onClick={subscribed ? disable : enable} disabled={busy}
      title={subscribed ? 'Thông báo hóa đơn đang BẬT — bấm để tắt' : 'Bật thông báo khi có hóa đơn cần xuất (nhận popup kể cả khi chưa mở trang)'}
      className={`h-9 px-3 rounded-full border text-xs font-semibold inline-flex items-center gap-1.5 transition ${subscribed ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
      {subscribed ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
      {busy ? '…' : subscribed ? 'Thông báo HĐ: Bật' : 'Bật thông báo HĐ'}
    </button>
  )
}
