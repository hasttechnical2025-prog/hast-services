"use client"

import { useState, useEffect, useRef } from "react"
import { Clipboard, QrCode, Trash2, ArrowLeft, RefreshCw, Send, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Html5QrcodeScanner, Html5QrcodeScanType } from "html5-qrcode"

type Customer = {
  id: string
  ma_may: string | null
  ten_khach_hang: string
  dia_chi: string
  model: string | null
}

export default function AdminBatchScanQR() {
  const [currentAdmin, setCurrentAdmin] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loginForm, setLoginForm] = useState({ username: "", password: "" })
  const [loginLoading, setLoginLoading] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  const [technicians, setTechnicians] = useState<any[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedKtvId, setSelectedKtvId] = useState<string>("")

  // Danh sách các mã máy đã quét thành công (Giỏ hàng)
  const [scannedItems, setScannedItems] = useState<{ ma_may: string, customer: Customer | null }[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Khóa chống quét trùng lặp trong thời gian ngắn (debouncing)
  const lastScannedCode = useRef<string | null>(null)
  const lastScannedTime = useRef<number>(0)

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 4000)
  }

  // Khôi phục phiên
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const { data: user } = await res.json()
          if (['admin', 'tech_admin'].includes(user.role)) {
            setCurrentAdmin(user)
            fetchInitialData()
          } else {
            showNotification('error', 'Chỉ Admin hoặc Tech Admin mới có quyền truy cập chức năng này.')
          }
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    restoreSession()
  }, [])

  const fetchInitialData = async () => {
    try {
      const [usersRes, custRes] = await Promise.all([
        fetch('/api/admin/users?ktv=true'),
        fetch('/api/admin/khach-hang')
      ])
      if (usersRes.ok) {
        const u = await usersRes.json()
        setTechnicians(u.data || [])
      }
      if (custRes.ok) {
        const c = await custRes.json()
        setCustomers(c.data || [])
      }
    } catch {
      showNotification('error', "Không tải được dữ liệu hệ thống")
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginLoading(true)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      })

      if (res.ok) {
        const { data: user } = await res.json()
        if (['admin', 'tech_admin'].includes(user.role)) {
          setCurrentAdmin(user)
          fetchInitialData()
          showNotification('success', `Đăng nhập thành công!`)
        } else {
          showNotification('error', 'Chỉ Admin/Tech Admin mới được sử dụng tính năng này.')
        }
      } else {
        const err = await res.json()
        showNotification('error', err.error)
      }
    } catch {
      showNotification('error', "Lỗi kết nối khi đăng nhập")
    } finally {
      setLoginLoading(false)
    }
  }

  // Khởi tạo bộ quét QR
  useEffect(() => {
    if (!currentAdmin || !isScanning) return

    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
        rememberLastUsedCamera: true
      },
      false
    )

    scanner.render(
      (decodedText) => {
        // Chống quét trùng (Giữ camera ở 1 mã sẽ chỉ nhận 1 lần mỗi 3 giây)
        const now = Date.now()
        if (decodedText === lastScannedCode.current && (now - lastScannedTime.current < 3000)) {
          return
        }
        lastScannedCode.current = decodedText
        lastScannedTime.current = now

        // Phân tích mã (Ví dụ: "36110#Bảo trì")
        // Chúng ta chỉ quan tâm phần mã máy
        const parts = decodedText.split('#')
        const maMayQuet = parts[0].trim().toUpperCase()

        if (!maMayQuet) return

        // Rung nhẹ điện thoại để phản hồi (nếu thiết bị hỗ trợ)
        if (navigator.vibrate) {
          navigator.vibrate(100)
        }

        // Kiểm tra xem đã có trong giỏ hàng chưa
        setScannedItems(prev => {
          if (prev.some(item => item.ma_may === maMayQuet)) {
            // Đã có -> bỏ qua không thêm
            return prev
          }

          // VLookup khách hàng
          const cust = customers.find(c => c.ma_may && c.ma_may.toUpperCase() === maMayQuet) || null
          return [...prev, { ma_may: maMayQuet, customer: cust }]
        })
      },
      (error) => {
        // ignore error messages as they are spammy when searching for code
      }
    )

    return () => {
      scanner.clear().catch(console.error)
    }
  }, [currentAdmin, isScanning, customers])

  const handleDeleteItem = (ma_may: string) => {
    setScannedItems(prev => prev.filter(i => i.ma_may !== ma_may))
  }

  const handleSubmitBatch = async () => {
    if (!selectedKtvId) return showNotification('error', 'Vui lòng chọn Kỹ thuật viên đi bảo trì!')
    if (scannedItems.length === 0) return showNotification('error', 'Danh sách sổ rỗng!')

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/cong-viec/bulk-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ktv_id: selectedKtvId,
          ma_mays: scannedItems.map(i => i.ma_may)
        })
      })

      if (res.ok) {
        showNotification('success', `Đã tạo và giao thành công ${scannedItems.length} phiếu bảo trì!`)
        setScannedItems([]) // Xóa trắng giỏ hàng
        setIsScanning(false) // Tắt camera
      } else {
        const err = await res.json()
        showNotification('error', err.error)
      }
    } catch {
      showNotification('error', 'Lỗi kết nối khi giao việc!')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400">Đang tải...</div>

  if (!currentAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        {notification && (
          <div className={`fixed top-4 right-4 left-4 z-50 p-4 rounded-md shadow-lg border ${notification.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'} transition-all`}>
            {notification.message}
          </div>
        )}
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-xl shadow-md border border-slate-200 w-full max-w-sm space-y-5">
          <div className="text-center space-y-1">
            <h1 className="text-xl font-bold text-slate-800">Quét QR Giao việc</h1>
            <p className="text-xs text-slate-400">Đăng nhập tài khoản văn phòng (Tech Admin)</p>
          </div>
          <div className="space-y-1">
            <Input required placeholder="Tên đăng nhập" value={loginForm.username} onChange={(e) => setLoginForm({...loginForm, username: e.target.value})} />
          </div>
          <div className="space-y-1">
            <Input required type="password" placeholder="Mật khẩu" value={loginForm.password} onChange={(e) => setLoginForm({...loginForm, password: e.target.value})} />
          </div>
          <Button type="submit" disabled={loginLoading} className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold">
            {loginLoading ? "Đang xác thực..." : "Đăng nhập"}
          </Button>
          <div className="text-center pt-4 border-t border-slate-100">
             <Button variant="link" onClick={() => window.location.href = '/admin'} className="text-xs text-slate-500 hover:text-blue-600">
               Quay lại Dashboard PC
             </Button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans pb-24">
      {/* Header */}
      <header className="bg-blue-700 text-white p-4 sticky top-0 shadow-md flex justify-between items-center z-20">
        <h1 className="text-base font-bold flex items-center gap-2">
          <QrCode className="w-5 h-5" /> Quét sổ bảo trì
        </h1>
        <Button variant="ghost" onClick={() => window.location.href = '/admin'} className="text-xs h-8 text-blue-100 hover:text-white hover:bg-blue-800 border border-blue-600">
          Vào Dashboard PC
        </Button>
      </header>

      {/* Thông báo */}
      {notification && (
        <div className={`fixed top-16 left-4 right-4 z-50 p-3 rounded-lg shadow-lg text-white text-sm font-medium flex items-center justify-between border ${notification.type === 'success' ? 'bg-emerald-600 border-emerald-500' : 'bg-red-600 border-red-500'} transition-all`}>
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="font-bold opacity-75 hover:opacity-100">✕</button>
        </div>
      )}

      <main className="flex-1 p-4 max-w-md mx-auto w-full space-y-4">

        {/* Bước 1: Chọn KTV */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">1. Kỹ thuật viên phụ trách</label>
          <select
            className="w-full h-11 px-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 text-slate-800 font-semibold"
            value={selectedKtvId}
            onChange={(e) => setSelectedKtvId(e.target.value)}
          >
            <option value="">-- Chọn KTV đi bảo trì --</option>
            {technicians.map(t => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </select>
        </div>

        {/* Bước 2: Quét Camera */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">2. Quét sổ máy</label>
            <Button
              size="sm"
              onClick={() => setIsScanning(!isScanning)}
              variant={isScanning ? "destructive" : "default"}
              className={`h-8 text-xs ${!isScanning ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
            >
              {isScanning ? 'Dừng quét' : 'Bật Camera quét mã'}
            </Button>
          </div>

          {isScanning && (
            <div className="rounded-lg overflow-hidden border border-slate-200 bg-black aspect-square flex items-center justify-center">
              <div id="qr-reader" className="w-full h-full" style={{ width: "100%", border: "none" }}></div>
            </div>
          )}
          {isScanning && <p className="text-center text-xs text-amber-600 font-medium">Giữ camera chiếu vào mã QR trên Sổ. Máy tự rung khi nhận mã.</p>}
        </div>

        {/* Bước 3: Danh sách chờ */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Danh sách sổ đã quét ({scannedItems.length})</label>
            {scannedItems.length > 0 && (
              <button onClick={() => setScannedItems([])} className="text-[10px] text-red-500 font-bold hover:underline">XÓA HẾT</button>
            )}
          </div>

          <div className="space-y-2">
            {scannedItems.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-sm italic bg-slate-50 rounded-lg border border-slate-100 border-dashed">
                Chưa có mã máy nào được quét.
              </div>
            ) : (
              scannedItems.map((item, index) => (
                <div key={item.ma_may} className="flex gap-2 items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100 shadow-sm relative overflow-hidden">
                  {!item.customer && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
                  )}
                  <div className="flex-1 min-w-0 pl-1">
                    <div className="font-mono font-bold text-sm text-slate-800 flex items-center gap-1.5">
                      {index + 1}. {item.ma_may}
                      {!item.customer && <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase border border-red-200">Mã Lạ</span>}
                    </div>
                    {item.customer ? (
                      <div className="text-[11px] text-slate-500 leading-snug truncate">
                        {item.customer.ten_khach_hang} ({item.customer.model || '—'})
                      </div>
                    ) : (
                      <div className="text-[10px] text-red-500 leading-snug truncate">
                        Chưa có thông tin khách hàng trong hệ thống!
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteItem(item.ma_may)}
                    className="p-2 text-slate-400 hover:text-red-500 bg-white rounded-md border border-slate-200 shadow-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

      </main>

      {/* Floating Action Button Bottom */}
      {scannedItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.1)] z-40">
          <div className="max-w-md mx-auto">
            <Button
              onClick={handleSubmitBatch}
              disabled={submitting || !selectedKtvId}
              className={`w-full h-12 font-bold text-base shadow-sm transition rounded-xl text-white ${!selectedKtvId ? 'bg-slate-300' : 'bg-emerald-600 hover:bg-emerald-700'}`}
            >
              {submitting ? 'Đang tạo phiếu...' : `🚀 Tạo & Giao ${scannedItems.length} phiếu bảo trì`}
            </Button>
            {!selectedKtvId && <p className="text-[10px] text-center text-red-500 mt-1.5 font-medium">Vui lòng chọn KTV ở Bước 1 trước khi giao việc.</p>}
          </div>
        </div>
      )}

    </div>
  )
}
