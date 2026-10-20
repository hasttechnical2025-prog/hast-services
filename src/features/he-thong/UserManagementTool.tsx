'use client'
import { useState } from 'react'
import QRCodeLib from 'qrcode'
import { Users, Wrench, CheckCircle2, QrCode, Power, PenSquare, Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ConfirmDialog'
import { usePaged, ListFrame, useColView, ColumnMenu, StatCard, StatRow, type ColDef } from '@/ui'

// Port NGUYÊN UserManagementTool từ admin (y hệt). Gọi lại /api/admin/users, /api/admin/ktv-qr.
// confirmDelete('user') → useConfirm nội bộ + DELETE /api/admin/users?id=.
const USER_COLS: ColDef[] = [
  { key: 'ho_ten', label: 'Họ Tên', locked: true },
  { key: 'username', label: 'Tên đăng nhập', locked: true },
  { key: 'role', label: 'Quyền hạn' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'trang_thai', label: 'Trạng thái' },
  { key: 'thaotac', label: 'Thao tác', locked: true },
]

export function UserManagementTool({ users, onUpdateSuccess, showNotification }: { users: any[], onUpdateSuccess: () => void, showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const col = useColView('users', USER_COLS)
  const paged = usePaged(users)
  const { confirm, confirmNode } = useConfirm()
  const [formData, setFormData] = useState({ id: "", full_name: "", username: "", password: "", role: "ktv", telegram_id: "", kd_quan_ly: false })
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)

  const [qrModal, setQrModal] = useState<{ id: string; name: string; url: string; dataUrl: string } | null>(null)
  const [qrLoadingId, setQrLoadingId] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const resetForm = () => {
    setFormData({ id: "", full_name: "", username: "", password: "", role: "ktv", telegram_id: "", kd_quan_ly: false })
    setIsEditing(false)
  }
  const openAdd = () => { resetForm(); setFormOpen(true) }
  const closeForm = () => { resetForm(); setFormOpen(false) }

  const handleToggleActive = async (user: any) => {
    try {
      const res = await fetch('/api/admin/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: user.id, is_active: !(user.is_active !== false) }) })
      if (res.ok) { showNotification('success', user.is_active !== false ? "Đã ngừng hoạt động tài khoản." : "Đã kích hoạt lại tài khoản."); onUpdateSuccess() }
      else { const err = await res.json(); showNotification('error', err.error) }
    } catch { showNotification('error', "Lỗi kết nối!") }
  }

  const handleGenerateQr = async (user: any, regenerate: boolean) => {
    setQrLoadingId(user.id)
    try {
      const res = await fetch('/api/admin/ktv-qr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: user.id, regenerate }) })
      if (res.ok) {
        const { data } = await res.json()
        const dataUrl = await QRCodeLib.toDataURL(data.enrollUrl, { width: 320, margin: 2 })
        setQrModal({ id: user.id, name: user.full_name, url: data.enrollUrl, dataUrl })
        if (regenerate) showNotification('success', "Đã tạo QR mới, QR cũ đã bị thu hồi.")
      } else { const err = await res.json(); showNotification('error', err.error) }
    } catch { showNotification('error', "Lỗi khi tạo QR!") } finally { setQrLoadingId(null) }
  }

  const handlePrintQr = () => {
    if (!qrModal) return
    const w = window.open('', '_blank', 'width=420,height=560')
    if (!w) return
    w.document.write(`
      <html><head><title>QR đăng nhập - ${qrModal.name}</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:24px;">
        <h2 style="margin-bottom:4px;">QR đăng nhập KTV</h2>
        <p style="margin-top:0;color:#475569;">${qrModal.name}</p>
        <img src="${qrModal.dataUrl}" style="width:320px;height:320px;" />
        <p style="font-size:11px;color:#94a3b8;word-break:break-all;">${qrModal.url}</p>
      </body></html>
    `)
    w.document.close()
    w.focus()
    w.print()
  }

  const handleEdit = (user: any) => {
    setFormData({ id: user.id, full_name: user.full_name, username: user.username || "", password: "", role: user.role, telegram_id: user.telegram_id || "", kd_quan_ly: !!user.kd_quan_ly })
    setIsEditing(true)
    setFormOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const pw = (formData.password || '').trim()
    if (!isEditing && pw.length < 6) { showNotification('error', 'Mật khẩu phải từ 6 ký tự trở lên.'); return }
    if (isEditing && pw !== '' && pw.length < 6) { showNotification('error', 'Mật khẩu phải từ 6 ký tự trở lên.'); return }
    setLoading(true)
    const method = isEditing ? 'PUT' : 'POST'
    try {
      const res = await fetch('/api/admin/users', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) })
      if (res.ok) { showNotification('success', isEditing ? "Cập nhật nhân viên thành công!" : "Tạo nhân viên thành công!"); resetForm(); setFormOpen(false); onUpdateSuccess() }
      else { const err = await res.json(); showNotification('error', err.error) }
    } catch { showNotification('error', "Lỗi kết nối!") } finally { setLoading(false) }
  }

  const onDeleteUser = async (u: any) => {
    if (!(await confirm("Bạn có chắc chắn muốn xóa tài khoản nhân viên này?", { confirmLabel: 'Xóa', danger: true }))) return
    try {
      const res = await fetch(`/api/admin/users?id=${u.id}`, { method: 'DELETE' })
      if (res.ok) { showNotification('success', 'Đã xóa tài khoản.'); onUpdateSuccess() } else { const j = await res.json().catch(() => ({})); showNotification('error', j.error || 'Xóa không thành công') }
    } catch { showNotification('error', 'Lỗi kết nối!') }
  }

  const userActive = users.filter(u => u.is_active !== false).length
  const userKtv = users.filter(u => u.role === 'ktv').length

  return (
    <div className="space-y-6">
      <StatRow>
        <StatCard label="Tài khoản" value={users.length.toLocaleString('vi-VN')} sub="tổng người dùng" icon={Users} tone="blue" />
        <StatCard label="KTV" value={userKtv.toLocaleString('vi-VN')} sub="kỹ thuật viên" icon={Wrench} tone="indigo" />
        <StatCard label="Đang hoạt động" value={userActive.toLocaleString('vi-VN')} sub={`${(users.length - userActive).toLocaleString('vi-VN')} ngừng`} icon={CheckCircle2} tone="emerald" />
      </StatRow>
      <ListFrame paged={paged} unit="tài khoản" toolbar={
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <ColumnMenu view={col} />
          <Button onClick={openAdd} className="h-9 gap-1.5 text-xs"><Plus className="w-4 h-4" /> Tạo tài khoản mới</Button>
        </div>
      }>
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200">
            <tr>
              {col.show('ho_ten') && <th className="px-4 py-2">Họ Tên</th>}
              {col.show('username') && <th className="px-4 py-2">Tên đăng nhập</th>}
              {col.show('role') && <th className="px-4 py-2">Quyền hạn</th>}
              {col.show('telegram') && <th className="px-4 py-2 text-center whitespace-nowrap">Telegram</th>}
              {col.show('trang_thai') && <th className="px-4 py-2 text-center whitespace-nowrap">Trạng thái</th>}
              {col.show('thaotac') && <th className="px-4 py-2 text-right">Thao tác</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paged.pageItems.map((u) => {
              const active = u.is_active !== false
              return (
              <tr key={u.id} className={`hover:bg-slate-50 ${!active ? 'opacity-60' : ''}`}>
                {col.show('ho_ten') && <td className="px-4 py-2 font-medium text-slate-800">{u.full_name}</td>}
                {col.show('username') && <td className="px-4 py-2 font-mono text-xs">{u.username || <span className="text-slate-400 italic">N/A</span>}</td>}
                {col.show('role') && <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${u.role === 'admin' ? 'bg-red-50 text-red-600' : u.role === 'ktv' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>{u.role}</span>
                  {u.role === 'kinh_doanh' && u.kd_quan_ly && <span className="ml-1 px-1.5 py-0.5 rounded t3 font-semibold bg-violet-50 text-violet-700 border border-violet-200">QL</span>}
                </td>}
                {col.show('telegram') && <td className="px-4 py-2 text-center">
                  {u.role === 'ktv'
                    ? (u.telegram_id
                      ? <span className="inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">Đã liên kết</span>
                      : <span className="inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">Chưa liên kết</span>)
                    : <span className="text-slate-300">—</span>}
                </td>}
                {col.show('trang_thai') && <td className="px-4 py-2 text-center">
                  <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-semibold ${active ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                    {active ? 'Hoạt động' : 'Ngừng'}
                  </span>
                </td>}
                {col.show('thaotac') && <td className="px-4 py-2 text-right whitespace-nowrap">
                  {u.role === 'ktv' && (
                    <button onClick={() => handleGenerateQr(u, false)} disabled={qrLoadingId === u.id} title="Tạo QR đăng nhập" className="text-violet-600 hover:text-violet-800 p-1 bg-violet-50 hover:bg-violet-100 rounded transition mr-2 disabled:opacity-50">
                      <QrCode className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => handleToggleActive(u)} title={active ? 'Ngừng hoạt động' : 'Kích hoạt lại'} className={`p-1 rounded transition mr-2 ${active ? 'text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100' : 'text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100'}`}>
                    <Power className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleEdit(u)} className="text-blue-500 hover:text-blue-700 p-1"><PenSquare className="w-4 h-4" /></button>
                  <button onClick={() => onDeleteUser(u)} className="text-red-500 hover:text-red-700 p-1 ml-2"><Trash2 className="w-4 h-4" /></button>
                </td>}
              </tr>
              )
            })}
          </tbody>
        </table>
      </ListFrame>

      {qrModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">QR đăng nhập KTV</h3>
              <button onClick={() => setQrModal(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>
            <div className="p-6 text-center space-y-3">
              <p className="text-sm text-slate-600">Kỹ thuật viên: <span className="font-bold text-slate-800">{qrModal.name}</span></p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrModal.dataUrl} alt="QR đăng nhập" className="w-56 h-56 mx-auto border border-slate-200 rounded-lg" />
              <p className="text-xs text-slate-400">KTV quét mã này để đăng nhập tự động. Có thể in ra, đưa quét rồi thu hồi.</p>
            </div>
            <div className="bg-slate-50 p-4 flex justify-between gap-2 border-t border-slate-100">
              <Button variant="outline" onClick={() => setQrModal(null)}>Đóng</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleGenerateQr({ id: qrModal.id, full_name: qrModal.name }, true)} disabled={qrLoadingId === qrModal.id}>Tạo QR mới</Button>
                <Button onClick={handlePrintQr}>In QR</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TẠO / SỬA TÀI KHOẢN — thay cho form nằm cố định trên trang */}
      {formOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><Users className="w-5 h-5 text-blue-600" /> {isEditing ? 'Sửa tài khoản' : 'Tạo tài khoản mới'}</h3>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleSave} className="overflow-y-auto p-5 space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Họ và Tên *</label>
                <Input required value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} placeholder="VD: Nguyễn Văn A" className="bg-white h-9" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Tên đăng nhập *</label>
                  <Input required value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} placeholder="VD: nguyenva" className="bg-white h-9" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">{isEditing ? "Mật khẩu mới" : "Mật khẩu *"}</label>
                  <Input required={!isEditing} type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder={isEditing ? "(Bỏ trống nếu không đổi)" : "Nhập mật khẩu"} className="bg-white h-9" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Quyền hạn *</label>
                <select className="w-full h-9 px-2.5 rounded-md border border-slate-200 bg-white text-xs text-slate-800 focus-visible:outline-none focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                  <option value="ktv">Kỹ thuật viên (KTV)</option>
                  <option value="kthc">Kế toán (KTHC)</option>
                  <option value="kinh_doanh">Kinh doanh (Kho thuê, Lệnh xuất hàng)</option>
                  <option value="staff">Staff</option>
                  <option value="tech_admin">Tech Admin</option>
                  <option value="admin">Admin</option>
                </select>
                {formData.role === 'kinh_doanh' && (
                  <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
                    <input type="checkbox" checked={formData.kd_quan_ly} onChange={(e) => setFormData({ ...formData, kd_quan_ly: e.target.checked })} className="w-4 h-4 accent-blue-600 shrink-0" />
                    <span className="text-sm text-slate-700">Quản lý kinh doanh</span>
                  </label>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={closeForm} className="h-9 text-xs">Hủy</Button>
                <Button type="submit" disabled={loading} className="h-9 text-xs">{loading ? "Đang lưu..." : isEditing ? "Cập nhật tài khoản" : "Tạo tài khoản mới"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {confirmNode}
    </div>
  )
}
