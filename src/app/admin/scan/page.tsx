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
  loai_hd?: string | null
}
// Trạng thái tra 1 mã quét: đang kiểm tra / có & còn HĐ bảo trì / có nhưng hết HĐ / không có / lỗi.
type ScanStatus = 'checking' | 'ok' | 'khac_hd' | 'khong_co' | 'loi'

export default function AdminBatchScanQR() {
  const [currentAdmin, setCurrentAdmin] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loginForm, setLoginForm] = useState({ username: "", password: "" })
  const [loginLoading, setLoginLoading] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  const [technicians, setTechnicians] = useState<any[]>([])
  const [selectedKtvId, setSelectedKtvId] = useState<string>("")

  // Danh sách các mã máy đã quét (mỗi mã tra SỐNG trên server, không so với snapshot cũ).
  const [scannedItems, setScannedItems] = useState<{ ma_may: string, customer: Customer | null, status: ScanStatus }[]>([])
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
      // Chỉ cần danh sách KTV; mã máy được tra SỐNG khi quét (không tải trước danh sách khách -> không lệch).
      const usersRes = await fetch('/api/admin/users?ktv=true')
      if (usersRes.ok) {
        const u = await usersRes.json()
        setTechnicians(u.data || [])
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

    let html5QrCode: any = null

    const timer = setTimeout(() => {
      try {
        const qrElement = document.getElementById("qr-reader")
        if (!qrElement) return

        const { Html5Qrcode } = require("html5-qrcode")
        html5QrCode = new Html5Qrcode("qr-reader")

        html5QrCode.start(
          { facingMode: "environment" }, // Chọn Camera sau của điện thoại
          {
            fps: 10,
            qrbox: (width: number, height: number) => {
              const size = Math.min(width, height) * 0.7
              return { width: size, height: size }
            }
          },
          (decodedText: string) => {
            const now = Date.now()
            if (decodedText === lastScannedCode.current && (now - lastScannedTime.current < 3000)) {
              return
            }
            lastScannedCode.current = decodedText
            lastScannedTime.current = now

            // Phân tích mã (Ví dụ: "36110#Bảo trì")
            const parts = decodedText.split('#')
            const rawMaMay = parts[0]

            // Loại bỏ các ký tự điều khiển ẩn và zero-width space/BOM của iOS
            const maMayQuetClean = rawMaMay.replace(/[​-‍﻿]/g, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim()

            if (!maMayQuetClean) return

            // Rung nhẹ phản hồi
            if (navigator.vibrate) {
              navigator.vibrate(100)
            }

            const normStr = (s: string) => (s || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
            const maMayQuetNorm = normStr(maMayQuetClean)

            // Thêm ngay ở trạng thái "đang kiểm tra" rồi tra SỐNG trên server (lọc HĐBT/MF).
            setScannedItems(prev => {
              if (prev.some(item => normStr(item.ma_may) === maMayQuetNorm)) return prev
              return [...prev, { ma_may: maMayQuetClean, customer: null, status: 'checking' }]
            })
            fetch(`/api/admin/scan-lookup?ma_may=${encodeURIComponent(maMayQuetClean)}`)
              .then(r => r.json())
              .then(j => setScannedItems(prev => prev.map(item =>
                normStr(item.ma_may) === maMayQuetNorm
                  ? { ...item, customer: j.customer || null, status: (j.status as ScanStatus) || 'khong_co' }
                  : item)))
              .catch(() => setScannedItems(prev => prev.map(item =>
                normStr(item.ma_may) === maMayQuetNorm ? { ...item, status: 'loi' as ScanStatus } : item)))
          },
          (errorMessage: string) => {
            // silent errors
          }
        ).catch((err: any) => {
          console.error("Camera init error:", err)
        })
      } catch (err) {
        console.error("html5-qrcode error:", err)
      }
    }, 400)

    return () => {
      clearTimeout(timer)
      if (html5QrCode) {
        // Tắt camera an toàn
        try {
          if (html5QrCode.isScanning) {
            html5QrCode.stop().catch((err: any) => console.error("Lỗi stop camera:", err))
          }
        } catch (e) {}
      }
    }
  }, [currentAdmin, isScanning])

  const handleDeleteItem = (ma_may: string) => {
    setScannedItems(prev => prev.filter(i => i.ma_may !== ma_may))
  }

  const handleSubmitBatch = async () => {
    if (!selectedKtvId) return showNotification('error', 'Vui lòng chọn Kỹ thuật viên đi bảo trì!')
    if (scannedItems.length === 0) return showNotification('error', 'Danh sách sổ rỗng!')

    // Chỉ giao mã HỢP LỆ (còn HĐ bảo trì). Bỏ qua mã lạ / hết HĐ / đang kiểm tra.
    const okItems = scannedItems.filter(i => i.status === 'ok')
    if (okItems.length === 0) return showNotification('error', 'Không có mã máy hợp lệ (còn HĐ bảo trì) để giao.')
    const boQua = scannedItems.length - okItems.length

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/cong-viec/bulk-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ktv_id: selectedKtvId,
          ma_mays: okItems.map(i => i.ma_may)
        })
      })

      if (res.ok) {
        showNotification('success', `Đã tạo và giao ${okItems.length} phiếu bảo trì!${boQua > 0 ? ` (bỏ qua ${boQua} mã không hợp lệ)` : ''}`)
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
          <div className={`fixed top-4 right-4 left-4 z-[9999] p-4 rounded-md shadow-lg border ${notification.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'} transition-all`}>
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
        <Button variant="ghost" onClick={() => window.location.href = '/m'} className="text-xs h-8 text-blue-100 hover:text-white hover:bg-blue-800 border border-blue-600 gap-1">
          <ArrowLeft className="w-4 h-4" /> Office Mobile
        </Button>
      </header>

      {/* Thông báo */}
      {notification && (
        <div className={`fixed top-16 left-4 right-4 z-[9999] p-3 rounded-lg shadow-lg text-white text-sm font-medium flex items-center justify-between border ${notification.type === 'success' ? 'bg-emerald-600 border-emerald-500' : 'bg-red-600 border-red-500'} transition-all`}>
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
            <div className="rounded-lg overflow-hidden border border-slate-200 bg-black aspect-[4/3] flex items-center justify-center">
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
              scannedItems.map((_it, revIndex) => {
                // Hiển thị NGƯỢC: mã vừa quét lên đầu (đỡ trôi khỏi khung camera, dễ soi khách vừa hiện).
                const index = scannedItems.length - 1 - revIndex
                const item = scannedItems[index]
                const st = item.status
                const barColor = st === 'ok' ? 'bg-emerald-500' : st === 'khac_hd' ? 'bg-amber-500' : st === 'checking' ? 'bg-slate-300' : 'bg-red-500'
                return (
                <div key={item.ma_may} className="flex gap-2 items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100 shadow-sm relative overflow-hidden">
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${barColor}`}></div>
                  <div className="flex-1 min-w-0 pl-1">
                    <div className="font-mono font-bold text-sm text-slate-800 flex items-center gap-1.5">
                      {index + 1}. {item.ma_may}
                      {st === 'checking' && <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase border border-slate-200">Đang kiểm tra…</span>}
                      {st === 'khong_co' && <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase border border-red-200">Mã lạ</span>}
                      {st === 'khac_hd' && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase border border-amber-200">Hết HĐ bảo trì</span>}
                      {st === 'loi' && <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase border border-red-200">Lỗi</span>}
                    </div>
                    {st === 'ok' && item.customer && (
                      <div className="text-[11px] text-slate-500 leading-snug truncate">
                        {item.customer.ten_khach_hang} ({item.customer.model || '—'})
                      </div>
                    )}
                    {st === 'khac_hd' && (
                      <div className="text-[10px] text-amber-600 leading-snug">
                        {item.customer?.ten_khach_hang ? `${item.customer.ten_khach_hang} — ` : ''}Máy không còn hợp đồng bảo trì → sẽ KHÔNG tạo phiếu.
                      </div>
                    )}
                    {st === 'khong_co' && (
                      <div className="text-[10px] text-red-500 leading-snug">Không tìm thấy mã máy trong hệ thống → sẽ không tạo phiếu.</div>
                    )}
                    {st === 'checking' && (
                      <div className="text-[10px] text-slate-400 leading-snug">Đang tra thông tin máy…</div>
                    )}
                    {st === 'loi' && (
                      <div className="text-[10px] text-red-500 leading-snug">Lỗi kiểm tra — xóa và quét lại.</div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteItem(item.ma_may)}
                    className="p-2 text-slate-400 hover:text-red-500 bg-white rounded-md border border-slate-200 shadow-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                )
              })
            )}
          </div>
        </div>

      </main>

      {/* Floating Action Button Bottom */}
      {scannedItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.1)] z-40">
          <div className="max-w-md mx-auto">
            {(() => {
              const okCount = scannedItems.filter(i => i.status === 'ok').length
              const boQua = scannedItems.length - okCount
              return (<>
                <Button
                  onClick={handleSubmitBatch}
                  disabled={submitting || !selectedKtvId || okCount === 0}
                  className={`w-full h-12 font-bold text-base shadow-sm transition rounded-xl text-white ${(!selectedKtvId || okCount === 0) ? 'bg-slate-300' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                >
                  {submitting ? 'Đang tạo phiếu...' : `🚀 Tạo & Giao ${okCount} phiếu bảo trì`}
                </Button>
                {!selectedKtvId && <p className="text-[10px] text-center text-red-500 mt-1.5 font-medium">Vui lòng chọn KTV ở Bước 1 trước khi giao việc.</p>}
                {selectedKtvId && okCount === 0 && <p className="text-[10px] text-center text-red-500 mt-1.5 font-medium">Chưa có mã máy hợp lệ (còn HĐ bảo trì) để giao.</p>}
                {selectedKtvId && okCount > 0 && boQua > 0 && <p className="text-[10px] text-center text-amber-600 mt-1.5 font-medium">{boQua} mã không hợp lệ sẽ bị bỏ qua.</p>}
              </>)
            })()}
          </div>
        </div>
      )}

    </div>
  )
}
