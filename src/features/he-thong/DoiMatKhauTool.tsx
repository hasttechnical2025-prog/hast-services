'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Port NGUYÊN DoiMatKhauTool từ admin (y hệt). Gọi lại /api/auth/change-password.
// Khác bản admin: sau khi đổi, phiên bị xóa → điều hướng về '/' (màn đăng nhập) thay vì '/admin'.
export function DoiMatKhauTool({ showNotification }: { showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [oldPw, setOldPw] = useState('')
  const [np, setNp] = useState('')
  const [np2, setNp2] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!oldPw || !np) return showNotification('error', 'Nhập đủ mật khẩu cũ và mới')
    if (np.length < 6) return showNotification('error', 'Mật khẩu mới tối thiểu 6 ký tự')
    if (np !== np2) return showNotification('error', 'Xác nhận mật khẩu mới không khớp')
    setSaving(true)
    try {
      const res = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ old_password: oldPw, new_password: np }) })
      const j = await res.json()
      if (res.ok) {
        showNotification('success', 'Đã đổi mật khẩu. Vui lòng đăng nhập lại bằng mật khẩu mới.')
        setOldPw(''); setNp(''); setNp2('')
        setTimeout(() => { window.location.href = '/' }, 1600)
      }
      else showNotification('error', j.error)
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setSaving(false) }
  }
  return (
    <div className="border border-slate-200 rounded-lg p-6 bg-white max-w-md space-y-4">
      <h3 className="text-lg font-semibold text-slate-700">Đổi mật khẩu</h3>
      <p className="text-sm text-slate-500">Nhập mật khẩu cũ → mật khẩu mới → xác nhận → Lưu.</p>
      <div className="space-y-1">
        <label className="text-xs font-semibold text-slate-600">Mật khẩu cũ</label>
        <Input type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} className="bg-white" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-semibold text-slate-600">Mật khẩu mới</label>
        <Input type="password" value={np} onChange={e => setNp(e.target.value)} className="bg-white" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-semibold text-slate-600">Xác nhận mật khẩu mới</label>
        <Input type="password" value={np2} onChange={e => setNp2(e.target.value)} className="bg-white" />
      </div>
      <Button onClick={save} disabled={saving} className="h-10">{saving ? 'Đang lưu...' : 'Lưu'}</Button>
    </div>
  )
}
