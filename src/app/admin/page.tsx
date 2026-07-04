"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { Plus, Search, Trash2, MapPin, RefreshCw, PenSquare, QrCode, Power, Download } from "lucide-react"
import QRCodeLib from "qrcode"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// Types
type VatTuChiTiet = {
  id: string
  ma_hang: string
  so_luong: number
  don_gia: number
  vat: number
  thanh_tien: number
  hoa_don: boolean
}

type Job = {
  id: string
  ngay: string
  ma_may: string
  loai_cong_viec: string
  km: number
  ket_qua: string
  ghi_chu: string
  report?: string
  soct_khach_hang: { ten_khach_hang: string; dia_chi: string; km_mac_dinh: number }
  soct_users: { full_name: string } | null
  soct_chi_tiet_vat_tu?: VatTuChiTiet[]
}

export default function AdminDashboard() {
  const [currentAdmin, setCurrentAdmin] = useState<{ id: string, full_name: string, role: string } | null>(null)
  const [loginForm, setLoginForm] = useState({ username: "", password: "" })
  const [loginLoading, setLoginLoading] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  // Khôi phục phiên đăng nhập từ cookie httpOnly (qua API /api/auth/me)
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const { data: user } = await res.json()
          // Trang Admin chỉ chấp nhận các role văn phòng
          if (['admin', 'tech_admin', 'staff'].includes(user.role)) {
            setCurrentAdmin(user)
          }
        }
      } catch (err) {
        console.error('Không khôi phục được phiên đăng nhập:', err)
      } finally {
        setIsMounted(true)
      }
    }
    restoreSession()
  }, [])

  // Notification State
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  // Custom Confirm Dialog State
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    id: "",
    message: "",
    type: "job" as "job" | "user" | "inventory"
  })

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 5000)
  }

  // Lấy role từ thông tin đăng nhập thực tế
  const currentUserRole = (currentAdmin?.role || 'staff') as 'admin' | 'tech_admin' | 'staff'

  const [activeTab, setActiveTab] = useState("cong_viec")
  // Tab con bên trong "Hệ thống" (dễ mở rộng thêm sau)
  const [systemTab, setSystemTab] = useState<"cai_dat" | "tai_khoan" | "khach_hang" | "danh_muc">("tai_khoan")
  // Tab con bên trong "Theo dõi máy"
  const [monitorTab, setMonitorTab] = useState<"bao_tri" | "giam_dinh">("bao_tri")
  // Tab con bên trong "Kho hàng" (tech_admin không thấy Tồn kho -> mặc định Đặt hàng)
  const [khoTab, setKhoTab] = useState<"ton_kho" | "dat_hang" | "thong_ke">("ton_kho")
  const effectiveKhoTab = (currentUserRole !== 'admin' && khoTab === 'ton_kho') ? 'dat_hang' : khoTab
  const [hdbtOpen, setHdbtOpen] = useState(false)
  // Bộ lọc Sổ công tác (mặc định: việc hôm nay)
  const [jobFilters, setJobFilters] = useState<{ search: string, tuNgay: string, denNgay: string, loaiViec: string[], ktvId: string, hoaDon: string, trangThai: string[] }>(() => {
    const t = new Date().toISOString().split('T')[0]
    return { search: "", tuNgay: t, denNgay: t, loaiViec: [], ktvId: "", hoaDon: "", trangThai: [] }
  })
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  // States for Add Job Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [customers, setCustomers] = useState<any[]>([])
  const [technicians, setTechnicians] = useState<any[]>([])
  const [inventory, setInventory] = useState<any[]>([]) // Thêm state inventory
  const [danhMuc, setDanhMuc] = useState<{ id: string, nhom: string, gia_tri: string, thu_tu: number, active: boolean }[]>([])
  const [cauHinh, setCauHinh] = useState<Record<string, string>>({})
  // Trạng thái máy cho phù hiệu trong form giao việc
  const [mayStatus, setMayStatus] = useState<{ bao_tri_thang: boolean, thang_nam: string, giam_dinh: any[] } | null>(null)
  const [dongGiamDinh, setDongGiamDinh] = useState(false)

  // Lấy các giá trị đang dùng của một nhóm danh mục (fallback về mặc định nếu bảng trống)
  const dmOptions = (nhom: string, fallback: string[] = []) => {
    const items = danhMuc.filter(d => d.nhom === nhom && d.active).map(d => d.gia_tri)
    return items.length > 0 ? items : fallback
  }

  // Khách hàng sắp/đã hết hạn HĐBT (trong vòng N tháng theo cấu hình)
  const hdbtCanhBaoThang = parseInt(cauHinh.hdbt_canh_bao_thang || '2') || 2
  const hdbtExpiring = (() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const limit = new Date(today); limit.setMonth(limit.getMonth() + hdbtCanhBaoThang)
    return customers
      .filter(c => c.ngay_het_han_hdbt && new Date(c.ngay_het_han_hdbt) <= limit)
      .sort((a, b) => new Date(a.ngay_het_han_hdbt).getTime() - new Date(b.ngay_het_han_hdbt).getTime())
  })()

  const [formData, setFormData] = useState({
    ngay: new Date().toISOString().split('T')[0], // Mặc định ngày hôm nay
    ma_may: "",
    id_khach_hang: "",
    loai_cong_viec: "Kiểm tra",
    km: 0,
    ktv_id: "",
    report: "",
    ghi_chu: "",
    vat_tu: [] as {ma_hang: string, so_luong: string, don_gia: string, vat: string, hoa_don: boolean}[],
    // Dùng khi máy mới hoàn toàn chưa có trong db
    ten_khach_hang_moi: "",
    dia_chi_moi: "",
    model_moi: ""
  })

  // Đóng modal & reset form
  const closeAndResetModal = () => {
    setIsModalOpen(false)
    setFormData({
      ngay: new Date().toISOString().split('T')[0],
      ma_may: "",
      id_khach_hang: "",
      loai_cong_viec: "Kiểm tra",
      km: 0,
      ktv_id: "",
      report: "",
      ghi_chu: "",
      vat_tu: [],
      ten_khach_hang_moi: "",
      dia_chi_moi: "",
      model_moi: ""
    })
  }

  // Fetch data
  const fetchData = async () => {
    setLoading(true)
    try {
      const [jobsRes, customersRes, usersRes, inventoryRes, danhMucRes, cauHinhRes] = await Promise.all([
        fetch('/api/admin/cong-viec'),
        fetch('/api/admin/khach-hang'),
        fetch('/api/admin/users'),
        fetch('/api/admin/kho-hang'),
        fetch('/api/admin/danh-muc'),
        fetch('/api/admin/cau-hinh')
      ])

      // Phiên hết hạn hoặc bị thu hồi -> quay về màn hình đăng nhập
      if (jobsRes.status === 401) {
        setCurrentAdmin(null)
        showNotification('error', 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.')
        return
      }

      const jobsData = await jobsRes.json()
      const customersData = await customersRes.json()
      const usersData = await usersRes.json()
      const inventoryData = await inventoryRes.json()
      const danhMucData = await danhMucRes.json()
      const cauHinhData = await cauHinhRes.json()

      if (jobsData.data) setJobs(jobsData.data)
      if (customersData.data) setCustomers(customersData.data)
      if (usersData.data) setTechnicians(usersData.data)
      if (inventoryData.data) setInventory(inventoryData.data)
      if (danhMucData.data) setDanhMuc(danhMucData.data)
      if (cauHinhData.data) setCauHinh(cauHinhData.data)
    } catch (error) {
      console.error("Error fetching data:", error)
    } finally {
      setLoading(false)
    }
  }

  // Tải dữ liệu khi admin đăng nhập thành công hoặc load trang
  useEffect(() => {
    if (isMounted && currentAdmin) {
      fetchData()
    }
  }, [isMounted, currentAdmin])

  // Tìm kiếm theo mã máy để điền tự động
  const handleMaMayChange = (val: string) => {
    setFormData(prev => ({ ...prev, ma_may: val }))
    if (val.trim() !== "") {
      const matched = customers.find(c => c.ma_may && c.ma_may.toLowerCase() === val.trim().toLowerCase())
      if (matched) {
        setFormData(prev => ({
          ...prev,
          ma_may: val,
          id_khach_hang: matched.id,
          ten_khach_hang_moi: "",
          dia_chi_moi: "",
          model_moi: ""
        }))
      } else {
        // Nếu không tìm thấy, xóa liên kết khách hàng cũ để giữ form sạch
        setFormData(prev => ({
          ...prev,
          ma_may: val,
          id_khach_hang: "NEW" // Đánh dấu đây là máy mới
        }))
      }
    } else {
      setFormData(prev => ({ ...prev, id_khach_hang: "" }))
    }
  }

  // Auto set KM & Ma May when Customer Dropdown changes
  useEffect(() => {
    if (formData.id_khach_hang && formData.id_khach_hang !== "NEW") {
      const selectedCustomer = customers.find(c => c.id === formData.id_khach_hang)
      if (selectedCustomer) {
        setFormData(prev => ({
          ...prev,
          km: selectedCustomer.km_mac_dinh || 0,
          ma_may: selectedCustomer.ma_may || prev.ma_may
        }))
      }
    }
  }, [formData.id_khach_hang, customers])

  // Nạp trạng thái máy (bảo trì tháng / giám định chờ thay) khi mã máy khớp một khách
  useEffect(() => {
    const mm = formData.ma_may.trim()
    const matched = mm ? customers.find(c => c.ma_may && c.ma_may.toLowerCase() === mm.toLowerCase()) : undefined
    if (!matched) { setMayStatus(null); setDongGiamDinh(false); return }
    let cancelled = false
    fetch(`/api/admin/may-status?ma_may=${encodeURIComponent(matched.ma_may)}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled && j) setMayStatus(j.data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [formData.ma_may, customers])

  // Xử lý thêm vật tư
  const handleAddVatTu = () => {
    setFormData(prev => ({
      ...prev,
      vat_tu: [...prev.vat_tu, { ma_hang: "", so_luong: "1", don_gia: "", vat: "", hoa_don: false }]
    }))
  }

  // Đưa vật tư đề xuất từ (các) biên bản giám định chờ thay vào ca việc
  const handleAddGiamDinhVatTu = () => {
    if (!mayStatus) return
    const lines = mayStatus.giam_dinh.flatMap((g: any) =>
      (g.soct_giam_dinh_vat_tu || []).map((v: any) => ({ ma_hang: v.ma_hang, so_luong: String(v.so_luong), don_gia: "", vat: "", hoa_don: false }))
    )
    if (lines.length === 0) return
    // Bỏ dòng trống mặc định, tránh trùng mã đã có
    setFormData(prev => {
      const existing = new Set(prev.vat_tu.filter(v => v.ma_hang).map(v => v.ma_hang))
      const toAdd = lines.filter(l => !existing.has(l.ma_hang))
      const base = prev.vat_tu.filter(v => v.ma_hang)
      return { ...prev, vat_tu: [...base, ...toAdd] }
    })
    setDongGiamDinh(true)
    showNotification('success', "Đã đưa vật tư giám định vào ca.")
  }

  const handleUpdateVatTu = (index: number, field: 'ma_hang' | 'so_luong' | 'don_gia' | 'vat' | 'hoa_don', value: string | boolean) => {
    const newVatTu = [...formData.vat_tu]
    newVatTu[index] = { ...newVatTu[index], [field]: value }
    setFormData(prev => ({ ...prev, vat_tu: newVatTu }))
  }

  const handleRemoveVatTu = (index: number) => {
    const newVatTu = formData.vat_tu.filter((_, i) => i !== index)
    setFormData(prev => ({ ...prev, vat_tu: newVatTu }))
  }

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault()

    let finalCustomerId = formData.id_khach_hang

    // Nếu là máy mới / khách hàng mới, tiến hành tạo Khách hàng trước
    if (formData.id_khach_hang === "NEW") {
      if (!formData.ten_khach_hang_moi || !formData.dia_chi_moi) {
        return showNotification('error', "Vui lòng nhập Tên Khách Hàng và Địa Chỉ mới")
      }

      try {
        const resKh = await fetch('/api/admin/khach-hang', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ten_khach_hang: formData.ten_khach_hang_moi,
            dia_chi: formData.dia_chi_moi,
            ma_may: formData.ma_may,
            model: formData.model_moi
          })
        })

        if (!resKh.ok) {
          const err = await resKh.json()
          throw new Error(err.error || "Lỗi tạo khách hàng mới")
        }

        const newKh = await resKh.json()
        finalCustomerId = newKh.data.id
      } catch (error: any) {
        console.error(error)
        return showNotification('error', "Không tạo được khách hàng: " + error.message)
      }
    }

    if (!finalCustomerId || finalCustomerId === "NEW") {
      return showNotification('error', "Vui lòng chọn khách hàng hoặc khai báo thông tin khách hàng mới")
    }

    try {
      const res = await fetch('/api/admin/cong-viec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          id_khach_hang: finalCustomerId
        })
      })

      if (res.ok) {
        // Đóng (các) biên bản giám định chờ thay nếu được tick, dùng số phiếu của việc
        if (dongGiamDinh && mayStatus && mayStatus.giam_dinh.length > 0) {
          if (!formData.report.trim()) {
            showNotification('error', "Đã tạo việc, nhưng cần Số phiếu để đóng giám định.")
          } else {
            await Promise.all(mayStatus.giam_dinh.map((g: any) =>
              fetch('/api/admin/giam-dinh', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: g.id, da_thay: true, ngay_thay: formData.ngay, so_report: formData.report })
              })
            ))
          }
        }
        closeAndResetModal()
        showNotification('success', "Tạo và giao công việc mới thành công!")
        fetchData() // Refresh list
      } else {
        const err = await res.json()
        showNotification('error', "Lỗi: " + err.error)
      }
    } catch (error) {
      console.error(error)
      showNotification('error', "Đã xảy ra lỗi khi tạo công việc")
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (err) {
      console.error('Lỗi khi đăng xuất:', err)
    }
    setCurrentAdmin(null)
    setLoginForm({ username: "", password: "" })
    setActiveTab("cong_viec")
  }

  const handleAdminLogin = async (e: React.FormEvent) => {
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
        setCurrentAdmin(user)
        setLoginForm({ username: "", password: "" })
        showNotification('success', `Chào mừng ${user.full_name} đăng nhập thành công!`)
      } else {
        const err = await res.json()
        showNotification('error', err.error)
      }
    } catch (err) {
      showNotification('error', "Lỗi kết nối khi đăng nhập")
    } finally {
      setLoginLoading(false)
    }
  }

  const confirmDelete = (id: string, type: "job" | "user" | "inventory" = "job") => {
    let message = "Bạn có chắc chắn muốn xóa công việc này khỏi sổ công tác không?"
    if (type === "user") message = "Bạn có chắc chắn muốn xóa tài khoản nhân viên này?"
    if (type === "inventory") message = "Bạn có chắc chắn muốn xóa vật tư này khỏi kho?"

    setConfirmDialog({
      isOpen: true,
      id,
      message,
      type
    })
  }

  // Format ngày chuẩn VN DD/MM/YYYY
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  // Tổng tiền + trạng thái hóa đơn của một việc (tính từ dòng vật tư)
  const jobTien = (job: any) => {
    const vt = job.soct_chi_tiet_vat_tu || []
    const tong = vt.reduce((s: number, v: any) => s + (Number(v.thanh_tien) || 0) + (v.hoa_don ? (Number(v.thanh_tien) || 0) * (Number(v.vat) || 0) / 100 : 0), 0)
    return { tong: Math.round(tong), coHD: vt.some((v: any) => v.hoa_don) }
  }

  // Sổ công tác sau khi áp bộ lọc (kết hợp AND giữa các nhóm)
  const filteredJobs = jobs.filter(j => {
    const f = jobFilters
    if (f.search) {
      const q = f.search.trim().toLowerCase()
      const hay = `${j.soct_khach_hang?.ten_khach_hang || ''} ${j.soct_khach_hang?.dia_chi || ''} ${j.ma_may || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (f.tuNgay && j.ngay < f.tuNgay) return false
    if (f.denNgay && j.ngay > f.denNgay) return false
    if (f.loaiViec.length && !f.loaiViec.includes(j.loai_cong_viec)) return false
    if (f.ktvId === 'none' && (j as any).ktv_id) return false
    if (f.ktvId && f.ktvId !== 'none' && (j as any).ktv_id !== f.ktvId) return false
    if (f.hoaDon) {
      const { tong, coHD } = jobTien(j)
      if (f.hoaDon === 'co' && !coHD) return false
      if (f.hoaDon === 'chua' && (coHD || tong <= 0)) return false
      if (f.hoaDon === 'co_tien' && tong <= 0) return false
    }
    if (f.trangThai.length && !f.trangThai.includes(j.ket_qua)) return false
    return true
  })

  const clearJobFilters = () => setJobFilters({ search: "", tuNgay: "", denNgay: "", loaiViec: [], ktvId: "", hoaDon: "", trangThai: [] })
  const jobFilterActive = !!(jobFilters.search || jobFilters.tuNgay || jobFilters.denNgay || jobFilters.loaiViec.length || jobFilters.ktvId || jobFilters.hoaDon || jobFilters.trangThai.length)

  const exportJobsCsv = () => {
    const headers = ['Ngày', 'Khách hàng', 'Địa chỉ', 'Mã máy', 'Loại việc', 'KTV', 'KM', 'Số phiếu', 'Tiền', 'Hóa đơn', 'Trạng thái']
    const cell = (v: any) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const rows = filteredJobs.map(j => {
      const { tong, coHD } = jobTien(j)
      return [formatDate(j.ngay), j.soct_khach_hang?.ten_khach_hang, j.soct_khach_hang?.dia_chi, j.ma_may, j.loai_cong_viec, j.soct_users?.full_name || 'Chưa giao', j.km, j.report, tong, coHD ? 'Có HĐ' : 'Chưa HĐ', j.ket_qua]
    })
    const csv = [headers, ...rows].map(r => r.map(cell).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `so-cong-tac-${new Date().toISOString().split('T')[0]}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const handleExecuteDelete = async () => {
    const { id, type } = confirmDialog
    if (!id) return

    try {
      let res;
      if (type === "job") {
        res = await fetch(`/api/admin/cong-viec?id=${id}`, { method: 'DELETE' })
      } else if (type === "user") {
        res = await fetch(`/api/admin/users?id=${id}`, { method: 'DELETE' })
      } else if (type === "inventory") {
        res = await fetch(`/api/admin/kho-hang?ma_hang=${encodeURIComponent(id)}`, { method: 'DELETE' })
      }

      if (res && res.ok) {
        showNotification('success', "Xóa thành công.")
        fetchData()
      } else {
        showNotification('error', "Xóa không thành công.")
      }
    } catch (error) {
      console.error(error)
      showNotification('error', "Lỗi kết nối khi xóa.")
    } finally {
      setConfirmDialog({ isOpen: false, id: "", message: "", type: "job" })
    }
  }

  // Chờ khôi phục phiên xong mới render để tránh nháy màn hình đăng nhập
  if (!isMounted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400 text-sm">
        Đang tải...
      </div>
    )
  }

  // Cổng đăng nhập: chưa có phiên hợp lệ thì chỉ hiển thị form đăng nhập
  if (!currentAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        {notification && (
          <div className={`fixed top-4 right-4 z-50 p-4 rounded-md shadow-lg border ${notification.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'} transition-all max-w-sm flex items-start gap-3`}>
            <div className="text-sm font-medium">{notification.message}</div>
            <button onClick={() => setNotification(null)} className="ml-auto shrink-0 opacity-70 hover:opacity-100">✕</button>
          </div>
        )}

        <form onSubmit={handleAdminLogin} className="bg-white p-8 rounded-xl shadow-md border border-slate-200 w-full max-w-sm space-y-5">
          <div className="text-center space-y-1">
            <div className="bg-blue-600 p-2.5 rounded-lg w-max mx-auto mb-3">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
            </div>
            <h1 className="text-xl font-bold text-slate-800">Admin Dashboard</h1>
            <p className="text-xs text-slate-400">Đăng nhập tài khoản văn phòng để tiếp tục</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Tên đăng nhập</label>
            <Input
              required
              placeholder="Nhập tên đăng nhập"
              value={loginForm.username}
              onChange={(e) => setLoginForm({...loginForm, username: e.target.value})}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Mật khẩu</label>
            <Input
              required
              type="password"
              placeholder="Nhập mật khẩu"
              value={loginForm.password}
              onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
            />
          </div>

          <Button type="submit" disabled={loginLoading} className="w-full h-11 font-semibold">
            {loginLoading ? "Đang xác thực..." : "Đăng nhập"}
          </Button>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="sticky top-0 z-30 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 rounded-xl shadow-md border border-slate-200 gap-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Logo" className="h-11 w-auto object-contain rounded-lg" />
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Admin Dashboard</h1>
              <p className="text-xs text-slate-400">Tài khoản: <span className="font-bold text-slate-700">{currentAdmin?.full_name}</span> (<span className="font-semibold text-slate-500 uppercase">{currentUserRole}</span>)</p>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab("cong_viec")}
                className={`px-4 py-2 rounded-md font-medium text-sm transition ${activeTab === 'cong_viec' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Sổ công tác
              </button>

              {currentUserRole !== 'staff' && (
                <button
                  onClick={() => setActiveTab("kho_hang")}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition ${activeTab === 'kho_hang' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Kho hàng
                </button>
              )}

              {/* Theo dõi máy: mọi role văn phòng (admin, tech_admin, staff) */}
              <button
                onClick={() => setActiveTab("theo_doi_may")}
                className={`px-4 py-2 rounded-md font-medium text-sm transition ${activeTab === 'theo_doi_may' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Theo dõi máy
              </button>

              {currentUserRole === 'admin' && (
                <button
                  onClick={() => setActiveTab("he_thong")}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition ${activeTab === 'he_thong' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Hệ thống
                </button>
              )}
            </div>

            <Button onClick={handleLogout} variant="outline" className="text-slate-600 hover:text-red-600 hover:bg-red-50 gap-1 text-xs px-3 py-1">
              Đăng xuất
            </Button>
          </div>
        </header>

        {activeTab === "cong_viec" && hdbtExpiring.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
            <button onClick={() => setHdbtOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-3 text-left">
              <svg className="w-5 h-5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <span className="text-sm font-semibold text-amber-800">{hdbtExpiring.length} khách sắp/đã hết hạn hợp đồng bảo trì</span>
              <span className="text-xs text-amber-600">(trong {hdbtCanhBaoThang} tháng — liên hệ ký tiếp)</span>
              <svg className={`w-4 h-4 text-amber-600 ml-auto transition-transform ${hdbtOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {hdbtOpen && (
              <div className="border-t border-amber-200 max-h-64 overflow-y-auto bg-white">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-amber-50/50 text-xs text-amber-800"><tr><th className="px-4 py-2 font-medium">Mã máy</th><th className="px-4 py-2 font-medium">Khách hàng</th><th className="px-4 py-2 font-medium">Loại HĐ</th><th className="px-4 py-2 font-medium text-center">Hết hạn</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {hdbtExpiring.map(c => {
                      const st = hdbtStatus(c.ngay_het_han_hdbt)
                      return (
                        <tr key={c.id}>
                          <td className="px-4 py-2 font-mono text-xs">{c.ma_may || '—'}</td>
                          <td className="px-4 py-2 font-medium text-slate-800">{c.ten_khach_hang}</td>
                          <td className="px-4 py-2">{c.loai_hd || '—'}</td>
                          <td className="px-4 py-2 text-center whitespace-nowrap">{st && <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${st.cls}`} title={st.note}>{st.label}</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "cong_viec" && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Toolbar + Bộ lọc */}
            <div className="p-4 border-b border-slate-200 space-y-3 bg-slate-50/50">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input placeholder="Tìm mã máy, tên khách hàng..." className="pl-9 bg-white" value={jobFilters.search} onChange={(e) => setJobFilters({ ...jobFilters, search: e.target.value })} />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button variant="outline" onClick={exportJobsCsv} className="gap-2"><Download className="w-4 h-4" /> Xuất CSV</Button>
                  <Button onClick={() => setIsModalOpen(true)} className="gap-2"><Plus className="w-4 h-4" /> Giao việc mới</Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span>Ngày</span>
                  <DateField value={jobFilters.tuNgay} onChange={(v) => setJobFilters({ ...jobFilters, tuNgay: v })} heightClass="h-9" className="w-32" />
                  <span>–</span>
                  <DateField value={jobFilters.denNgay} onChange={(v) => setJobFilters({ ...jobFilters, denNgay: v })} heightClass="h-9" className="w-32" />
                </div>
                <MultiCheckDropdown label="Loại việc" options={dmOptions('loai_cong_viec', ['Lắp máy','Sửa máy','Giao mực','Thay vật tư','Bảo trì','Bảo hành','Hỗ trợ thầu','Hỗ trợ đại lý','Khiếu nại','Kiểm tra','Khác'])} selected={jobFilters.loaiViec} onChange={(v) => setJobFilters({ ...jobFilters, loaiViec: v })} />
                <select value={jobFilters.ktvId} onChange={(e) => setJobFilters({ ...jobFilters, ktvId: e.target.value })} className="h-9 px-2 rounded-md border border-slate-200 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">KTV: Tất cả</option>
                  <option value="none">Chưa giao</option>
                  {technicians.filter(t => t.role !== 'admin').map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
                <select value={jobFilters.hoaDon} onChange={(e) => setJobFilters({ ...jobFilters, hoaDon: e.target.value })} className="h-9 px-2 rounded-md border border-slate-200 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">HĐ: Tất cả</option>
                  <option value="co">Có hóa đơn</option>
                  <option value="chua">Chưa hóa đơn</option>
                  <option value="co_tien">Có phát sinh tiền</option>
                </select>
                <MultiCheckDropdown label="Trạng thái" options={['Chờ nhận', 'Đang làm', 'Hoàn thành', 'Lắp tiếp']} selected={jobFilters.trangThai} onChange={(v) => setJobFilters({ ...jobFilters, trangThai: v })} />
                {jobFilterActive && <button onClick={clearJobFilters} className="text-xs text-red-600 hover:underline font-medium px-1">Bỏ lọc</button>}
                <span className="text-xs text-slate-500 ml-auto whitespace-nowrap">{filteredJobs.length} / {jobs.length} việc</span>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Ngày</th>
                    <th className="px-4 py-3">Khách hàng</th>
                    <th className="px-4 py-3">Mã máy</th>
                    <th className="px-4 py-3">Loại việc</th>
                    <th className="px-4 py-3">KTV</th>
                    <th className="px-4 py-3 text-center">KM</th>
                    <th className="px-4 py-3">Báo cáo HĐ</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    {currentUserRole !== 'staff' && <th className="px-4 py-3 text-right">Thao tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loading ? (
                    <tr><td colSpan={currentUserRole === 'staff' ? 8 : 9} className="text-center py-8 text-slate-400">Đang tải dữ liệu...</td></tr>
                  ) : filteredJobs.length === 0 ? (
                    <tr><td colSpan={currentUserRole === 'staff' ? 8 : 9} className="text-center py-8 text-slate-400">{jobs.length === 0 ? 'Chưa có công việc nào' : 'Không có việc khớp bộ lọc'}{jobs.length > 0 && jobFilterActive && <button onClick={clearJobFilters} className="text-blue-600 hover:underline ml-1">— Bỏ lọc</button>}</td></tr>
                  ) : (
                    filteredJobs.map((job) => (
                      <tr key={job.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-3 whitespace-nowrap">{formatDate(job.ngay)}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{job.soct_khach_hang?.ten_khach_hang}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" /> {job.soct_khach_hang?.dia_chi}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{job.ma_may || '-'}</td>
                        <td className="px-4 py-3">{job.loai_cong_viec}</td>
                        <td className="px-4 py-3">{job.soct_users?.full_name || <span className="text-amber-600 italic">Chưa giao</span>}</td>
                        <td className="px-4 py-3 text-center text-xs">
                          {job.km ? `${job.km.toLocaleString('vi-VN')} km` : '0 km'}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {job.report && <div className="text-slate-700">Phiếu: {job.report}</div>}
                          {(() => {
                            const vt = job.soct_chi_tiet_vat_tu || []
                            const tong = vt.reduce((s, v) => s + (Number(v.thanh_tien) || 0) + (v.hoa_don ? (Number(v.thanh_tien) || 0) * (Number(v.vat) || 0) / 100 : 0), 0)
                            const coHD = vt.some(v => v.hoa_don)
                            if (tong <= 0) return null
                            return (
                              <div className={coHD ? 'text-emerald-600' : 'text-amber-600'}>
                                {coHD ? 'Có HĐ' : 'Chưa HĐ'}: {Math.round(tong).toLocaleString('vi-VN')} đ
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border
                            ${job.ket_qua === 'Hoàn thành' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              job.ket_qua === 'Đang làm' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              job.ket_qua === 'Lắp tiếp' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-slate-100 text-slate-700 border-slate-200'}`}
                          >
                            {job.ket_qua}
                          </span>
                        </td>
                        {currentUserRole !== 'staff' && (
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => confirmDelete(job.id)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "kho_hang" && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Thanh tab con của Kho hàng */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/50">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-max max-w-full overflow-x-auto">
                {([['ton_kho','Tồn kho'],['dat_hang','Đặt hàng'],['thong_ke','Thống kê nhập']] as const)
                  .filter(([k]) => k !== 'ton_kho' || currentUserRole === 'admin')
                  .map(([k,l]) => (
                  <button key={k} onClick={() => setKhoTab(k as any)} className={`px-4 py-2 rounded-md font-medium text-sm transition whitespace-nowrap ${effectiveKhoTab === k ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{l}</button>
                ))}
              </div>
            </div>

            <div className="p-6 space-y-6">
              {effectiveKhoTab === "ton_kho" && currentUserRole === 'admin' && (
                <>
                  <h2 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">Quản lý Kho Hàng (Vật tư)</h2>
                  <InventoryManagementTool inventory={inventory} onUpdateSuccess={fetchData} showNotification={showNotification} confirmDelete={confirmDelete} />
                  <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 mt-8">
                    <h3 className="text-lg font-semibold text-slate-700 mb-2">Nhập hàng hóa từ Excel (Bulk Import)</h3>
                    <p className="text-sm text-slate-500 mb-6">
                      Copy danh sách từ Excel và dán vào đây.<br/>
                      <b>Thứ tự cột yêu cầu:</b> Mã hàng | Tên vật tư | Model máy | Tồn kho
                    </p>
                    <BulkImportInventoryTool onImportSuccess={fetchData} showNotification={showNotification} />
                  </div>
                </>
              )}
              {effectiveKhoTab === "dat_hang" && (
                <DatHangTool inventory={inventory} nhaCungCapOptions={dmOptions('nha_cung_cap')} onUpdateSuccess={fetchData} showNotification={showNotification} />
              )}
              {effectiveKhoTab === "thong_ke" && (
                <NhapHangThangTool showNotification={showNotification} />
              )}
            </div>
          </div>
        )}
        {activeTab === "theo_doi_may" && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Thanh tab con của Theo dõi máy */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/50">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-max max-w-full overflow-x-auto">
                <button
                  onClick={() => setMonitorTab("bao_tri")}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition whitespace-nowrap ${monitorTab === 'bao_tri' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Bảo trì
                </button>
                <button
                  onClick={() => setMonitorTab("giam_dinh")}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition whitespace-nowrap ${monitorTab === 'giam_dinh' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Giám định
                </button>
              </div>
            </div>

            <div className="p-6">
              {monitorTab === "bao_tri" && (
                <BaoTriTool customers={customers} showNotification={showNotification} />
              )}
              {monitorTab === "giam_dinh" && (
                <GiamDinhTool customers={customers} inventory={inventory} ktvOptions={dmOptions('ktv_giam_dinh')} tinhTrangOptions={dmOptions('tinh_trang_may')} showNotification={showNotification} />
              )}
            </div>
          </div>
        )}
        {activeTab === "he_thong" && currentUserRole === 'admin' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Thanh tab con của Hệ thống */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/50">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-max max-w-full overflow-x-auto">
                <button
                  onClick={() => setSystemTab("cai_dat")}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition whitespace-nowrap ${systemTab === 'cai_dat' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Cài đặt hệ thống
                </button>
                <button
                  onClick={() => setSystemTab("tai_khoan")}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition whitespace-nowrap ${systemTab === 'tai_khoan' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Tài khoản
                </button>
                <button
                  onClick={() => setSystemTab("khach_hang")}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition whitespace-nowrap ${systemTab === 'khach_hang' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Danh sách khách hàng
                </button>
                <button
                  onClick={() => setSystemTab("danh_muc")}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition whitespace-nowrap ${systemTab === 'danh_muc' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Danh mục
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* TAB CON: CÀI ĐẶT HỆ THỐNG (để trống, bổ sung sau) */}
              {systemTab === "cai_dat" && (
                <div className="text-center text-slate-400 text-sm py-12 border border-dashed border-slate-200 rounded-lg">
                  Chưa có cài đặt nào — sẽ bổ sung sau.
                </div>
              )}

              {/* TAB CON: TÀI KHOẢN */}
              {systemTab === "tai_khoan" && (
                <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50">
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">Quản lý Tài khoản (KTV & Nhân viên)</h3>
                  <p className="text-sm text-slate-500 mb-6">Thêm mới, cập nhật tên đăng nhập và mật khẩu cho Kỹ thuật viên.</p>
                  <UserManagementTool users={technicians} onUpdateSuccess={fetchData} showNotification={showNotification} confirmDelete={confirmDelete} />
                </div>
              )}

              {/* TAB CON: DANH SÁCH KHÁCH HÀNG */}
              {systemTab === "khach_hang" && (
                <>
                  <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50">
                    <h3 className="text-lg font-semibold text-slate-700 mb-2">Danh sách Khách hàng (Điểm máy)</h3>
                    <p className="text-sm text-slate-500 mb-4">Toàn bộ khách hàng / điểm máy hiện có trong hệ thống.</p>
                    <CustomerListTool customers={customers} loaiHdOptions={dmOptions('loai_hd', ['HĐBT','MF'])} hdbtCanhBaoThang={hdbtCanhBaoThang} onUpdateSuccess={fetchData} showNotification={showNotification} />
                  </div>

                  <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50">
                    <h3 className="text-lg font-semibold text-slate-700 mb-2">Nhập dữ liệu Khách Hàng (Bulk Import)</h3>
                    <p className="text-sm text-slate-500 mb-6">
                      Hỗ trợ 2 định dạng copy-paste:<br/>
                      - <b>Copy từ Excel (Tab-separated):</b> TT | Mã máy | Tên Khách hàng | Địa chỉ | Model | km<br/>
                      - <b>Danh sách Text thô:</b> VD: <code>158 _Ban Nội chính TW #Tòa 4A Nguyễn Cảnh Chân, Hà Nội @Apeos 7580 !7</code><br/>
                      <span className="text-xs text-slate-400">(số đầu = mã khách; sau <b>_</b> = tên KH; sau <b>#</b> = địa chỉ; sau <b>@</b> = model; sau <b>!</b> = số km)</span>
                    </p>

                    <BulkImportTool onImportSuccess={fetchData} showNotification={showNotification} />
                  </div>
                </>
              )}

              {/* TAB CON: DANH MỤC */}
              {systemTab === "danh_muc" && (
                <DanhMucTool danhMuc={danhMuc} cauHinh={cauHinh} onUpdateSuccess={fetchData} showNotification={showNotification} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Thông báo (Notification Banner) */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-md shadow-lg border ${notification.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'} transition-all max-w-sm flex items-start gap-3`}>
          {notification.type === 'success' ? (
            <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
          ) : (
            <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          )}
          <div className="text-sm font-medium">{notification.message}</div>
          <button onClick={() => setNotification(null)} className="ml-auto shrink-0 opacity-70 hover:opacity-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
      )}

      {/* Modal Xác Nhận (Confirm Dialog) */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Xác nhận xóa</h3>
              <p className="text-slate-500">{confirmDialog.message}</p>
            </div>
            <div className="bg-slate-50 p-4 flex justify-end gap-3 border-t border-slate-100">
              <Button variant="outline" onClick={() => setConfirmDialog({ isOpen: false, id: "", message: "", type: "job" })}>Hủy bỏ</Button>
              <Button variant="destructive" onClick={handleExecuteDelete}>Xác nhận xóa</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Thêm Công Việc */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-slate-800">Giao công việc mới</h2>
              <button onClick={closeAndResetModal} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <form onSubmit={handleCreateJob} className="p-6 space-y-6">
              {/* Cụm: Ngày & Kỹ thuật viên */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Ngày</label>
                  <div className="relative w-full">
                    <div className="flex h-10 w-full items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 font-mono">
                      {formatDate(formData.ngay) || "Chọn ngày"}
                      <svg className="w-4 h-4 ml-auto text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <input
                      type="date"
                      value={formData.ngay}
                      onChange={(e) => setFormData({...formData, ngay: e.target.value})}
                      required
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Kỹ thuật viên</label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    value={formData.ktv_id}
                    onChange={(e) => setFormData({...formData, ktv_id: e.target.value})}
                  >
                    <option value="">-- Chưa giao KTV --</option>
                    {technicians.filter(t => t.role !== 'admin').map(t => (
                      <option key={t.id} value={t.id}>{t.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cụm: Mã máy (hẹp) & Khách hàng (rộng) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Mã máy <span className="text-amber-500 font-normal text-xs italic ml-1">(Gõ mã để điền KH)</span></label>
                  <Input
                    placeholder="VD: 35953"
                    value={formData.ma_may}
                    onChange={(e) => handleMaMayChange(e.target.value)}
                  />
                </div>

                {(() => {
                  // Mỗi mã máy chỉ ứng với 1 khách hàng: nếu mã máy đã khớp một khách,
                  // khóa dropdown lại (khách được xác định theo mã máy, sửa mã máy để đổi).
                  const lockedCustomer = formData.ma_may.trim()
                    ? customers.find(c => c.ma_may && c.ma_may.toLowerCase() === formData.ma_may.trim().toLowerCase())
                    : undefined
                  const isLocked = !!lockedCustomer
                  const selected = formData.id_khach_hang && formData.id_khach_hang !== "NEW"
                    ? customers.find(c => c.id === formData.id_khach_hang)
                    : undefined
                  return (
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-medium text-slate-700">
                        Khách hàng <span className="text-red-500">*</span>
                        {isLocked && <span className="text-slate-400 font-normal text-xs italic ml-1">(khóa theo mã máy)</span>}
                      </label>
                      <select
                        className={`w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none ${isLocked ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : 'bg-white'}`}
                        value={formData.id_khach_hang}
                        onChange={(e) => setFormData({...formData, id_khach_hang: e.target.value})}
                        required
                        disabled={isLocked}
                        title={isLocked ? 'Khách hàng được xác định theo mã máy. Sửa/xóa mã máy để chọn khách khác.' : undefined}
                      >
                        <option value="">-- Chọn khách hàng --</option>
                        <option value="NEW" className="font-semibold text-blue-600">+ Tạo khách hàng (máy) mới</option>
                        {customers.map(c => (
                          <option key={c.id} value={c.id}>{c.ten_khach_hang}</option>
                        ))}
                      </select>
                      {selected && (selected.model || selected.dia_chi) && (
                        <div className="flex flex-wrap gap-2 text-xs pt-1">
                          {selected.model && <span className="text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-100">Model: <b>{selected.model}</b></span>}
                          {selected.dia_chi && <span className="text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-100 max-w-full truncate" title={selected.dia_chi}>Địa chỉ: <b>{selected.dia_chi}</b></span>}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Phần thêm mới khách hàng/máy */}
                {formData.id_khach_hang === "NEW" && (
                  <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4 bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                    <div className="space-y-2">
                       <label className="text-sm font-medium text-slate-700">Tên Khách Hàng mới <span className="text-red-500">*</span></label>
                       <Input placeholder="Nhập tên khách hàng" value={formData.ten_khach_hang_moi} onChange={(e) => setFormData({...formData, ten_khach_hang_moi: e.target.value})} required={formData.id_khach_hang === "NEW"} />
                    </div>
                    <div className="space-y-2">
                       <label className="text-sm font-medium text-slate-700">Địa chỉ mới <span className="text-red-500">*</span></label>
                       <Input placeholder="VD: 2 Hoàng Văn Thụ, Ba Đình, Hà Nội" value={formData.dia_chi_moi} onChange={(e) => setFormData({...formData, dia_chi_moi: e.target.value})} required={formData.id_khach_hang === "NEW"} />
                    </div>
                    <div className="space-y-2">
                       <label className="text-sm font-medium text-slate-700">Model máy</label>
                       <Input placeholder="VD: bizhub 950i" value={formData.model_moi} onChange={(e) => setFormData({...formData, model_moi: e.target.value})} />
                    </div>
                  </div>
                )}
              </div>

              {/* Phù hiệu trạng thái máy (khi mã máy khớp một khách) */}
              {(() => {
                const mm = formData.ma_may.trim()
                const matched = mm ? customers.find(c => c.ma_may && c.ma_may.toLowerCase() === mm.toLowerCase()) : undefined
                if (!matched) return null
                const hd = hdbtStatus(matched.ngay_het_han_hdbt)
                const recent = jobs.find(j => j.ma_may && j.ma_may.toLowerCase() === mm.toLowerCase() && j.ket_qua === 'Hoàn thành' && j.ngay && (Date.now() - new Date(j.ngay).getTime()) <= 30 * 86400000)
                const gd = mayStatus?.giam_dinh || []
                const gdVatTu = gd.flatMap((g: any) => g.soct_giam_dinh_vat_tu || [])
                const pill = 'px-2.5 py-1 rounded-full text-xs font-semibold border'
                return (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {mayStatus && (mayStatus.bao_tri_thang
                        ? <span className={`${pill} bg-emerald-50 text-emerald-700 border-emerald-200`}>✓ Đã bảo trì T{mayStatus.thang_nam.split('-')[1]}</span>
                        : <span className={`${pill} bg-amber-50 text-amber-700 border-amber-200`}>Chưa bảo trì tháng này</span>)}
                      {hd && <span className={`${pill} ${hd.cls}`}>HĐBT: {hd.note} ({hd.label})</span>}
                      {gd.length > 0 && <span className={`${pill} bg-red-50 text-red-700 border-red-200`}>Giám định: {gdVatTu.length} vật tư chờ thay</span>}
                      {recent && <span className={`${pill} bg-slate-100 text-slate-600 border-slate-200`}>Đã sửa gần đây</span>}
                    </div>
                    {gd.length > 0 && (
                      <div className="border border-red-100 bg-red-50/40 rounded-lg p-3 space-y-2">
                        <div className="flex justify-between items-center flex-wrap gap-2">
                          <span className="text-xs font-semibold text-red-700">Vật tư giám định đề xuất thay</span>
                          <Button type="button" variant="outline" size="sm" onClick={handleAddGiamDinhVatTu} className="h-8 text-xs border-red-200 text-red-700 hover:bg-red-50">Đưa vào ca</Button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {gdVatTu.map((v: any) => (
                            <span key={v.id} className="text-xs bg-white border border-red-100 rounded px-2 py-1"><span className="font-mono text-slate-700">{v.ma_hang}</span> {v.soct_kho_hang?.ten_hang || ''} <span className="text-slate-400">×{v.so_luong}</span></span>
                          ))}
                        </div>
                        <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
                          <input type="checkbox" checked={dongGiamDinh} onChange={(e) => setDongGiamDinh(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
                          Đóng giám định (đã thay) khi lưu việc — dùng Số phiếu bên dưới
                        </label>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Dòng: Loại công việc | Số phiếu | Khoảng cách */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Loại công việc <span className="text-red-500">*</span></label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    value={formData.loai_cong_viec}
                    onChange={(e) => setFormData({...formData, loai_cong_viec: e.target.value})}
                  >
                    {dmOptions('loai_cong_viec', ['Lắp máy','Sửa máy','Giao mực','Thay vật tư','Bảo trì','Bảo hành','Hỗ trợ thầu','Hỗ trợ đại lý','Khiếu nại','Kiểm tra','Khác']).map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Số phiếu (Report)</label>
                  <Input
                    placeholder="VD: RP-2026-001"
                    value={formData.report}
                    onChange={(e) => setFormData({...formData, report: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Khoảng cách (KM)</label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      className="bg-white pr-10"
                      value={formData.km}
                      onChange={(e) => setFormData({...formData, km: parseFloat(e.target.value) || 0})}
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 text-sm">
                      km
                    </div>
                  </div>
                  {formData.id_khach_hang && customers.find(c => c.id === formData.id_khach_hang)?.km_mac_dinh === null && (
                    <span className="text-xs text-amber-600 italic mt-1 block">Hệ thống sẽ tự tính tọa độ & KM khi lưu</span>
                  )}
                </div>
              </div>

              {/* Vật tư đi kèm */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-slate-700">Vật tư / Linh kiện thay thế</h3>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddVatTu} className="h-8 text-xs gap-1">
                    <Plus className="w-3 h-3" /> Thêm vật tư
                  </Button>
                </div>
                <div className="p-4 space-y-3 bg-white">
                  {formData.vat_tu.length === 0 ? (
                    <p className="text-sm text-slate-400 italic text-center py-2">Chưa có vật tư nào được chọn.</p>
                  ) : (
                    formData.vat_tu.map((vt, index) => {
                      const selectedItem = inventory.find(i => i.ma_hang === vt.ma_hang)
                      const sl = parseInt(vt.so_luong) || 0
                      const dg = parseFloat(vt.don_gia) || 0
                      const thanhTien = dg * sl
                      return (
                        <div key={index} className="bg-slate-50 p-3 rounded-md border border-slate-100 space-y-2">
                          {/* Vật tư trên một dòng: Mã hàng | SL | Đơn giá | VAT | Thành tiền | HĐ | xóa */}
                          <div className="flex gap-2 items-end">
                            <div className="flex-1 min-w-0">
                              <label className="text-xs font-medium text-slate-500 mb-1 block">Mã hàng hóa (Kho)</label>
                              <MaterialCombobox inventory={inventory} value={vt.ma_hang} onChange={(v) => handleUpdateVatTu(index, 'ma_hang', v)} />
                            </div>
                            <div className="w-16 shrink-0">
                              <label className="text-xs font-medium text-slate-500 mb-1 block">SL</label>
                              <Input type="number" min="1" className="h-9 bg-white" value={vt.so_luong} onChange={(e) => handleUpdateVatTu(index, 'so_luong', e.target.value)} required />
                            </div>
                            <div className="w-28 shrink-0">
                              <label className="text-xs font-medium text-slate-500 mb-1 block">Đơn giá</label>
                              <Input type="text" inputMode="numeric" placeholder="0" className="h-9 bg-white" value={vt.don_gia === "" ? "" : Number(vt.don_gia).toLocaleString('vi-VN')} onChange={(e) => handleUpdateVatTu(index, 'don_gia', e.target.value.replace(/\D/g, ''))} />
                            </div>
                            <div className="w-20 shrink-0">
                              <label className="text-xs font-medium text-slate-500 mb-1 block">VAT %</label>
                              <Input type="number" min="0" step="0.1" placeholder="0" className="h-9 bg-white" value={vt.vat} onChange={(e) => handleUpdateVatTu(index, 'vat', e.target.value)} />
                            </div>
                            <div className="w-32 shrink-0">
                              <label className="text-xs font-medium text-slate-500 mb-1 block">Thành tiền</label>
                              <div className="h-9 flex items-center justify-end px-2 rounded-md border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-700 whitespace-nowrap overflow-hidden">{thanhTien.toLocaleString('vi-VN')} đ</div>
                            </div>
                            <label className="shrink-0 flex items-center gap-1.5 h-9 cursor-pointer select-none">
                              <input type="checkbox" checked={vt.hoa_don} onChange={(e) => handleUpdateVatTu(index, 'hoa_don', e.target.checked)} className="w-4 h-4 accent-blue-600" />
                              <span className="text-xs font-medium text-slate-600">HĐ</span>
                            </label>
                            <button type="button" onClick={() => handleRemoveVatTu(index)} className="text-slate-400 hover:text-red-500 p-2 shrink-0 h-9 flex items-center">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Dòng thông tin tồn kho và model */}
                          {selectedItem && (
                            <div className="text-xs text-slate-500 bg-white px-2.5 py-1 rounded border border-slate-100 font-medium">
                              Tồn kho: <span className={`font-semibold ${selectedItem.ton_kho <= 0 ? 'text-red-500' : 'text-emerald-600'}`}>{selectedItem.ton_kho}</span> | Model máy tương thích: <span className="font-semibold text-slate-700">{selectedItem.model || 'Dùng chung'}</span>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Dòng tổng cộng */}
                {formData.vat_tu.length > 0 && (() => {
                  let tongChuaHD = 0, tongCoHD = 0, tienVAT = 0
                  for (const vt of formData.vat_tu) {
                    const tt = (parseFloat(vt.don_gia) || 0) * (parseInt(vt.so_luong) || 0)
                    if (vt.hoa_don) { tongCoHD += tt; tienVAT += tt * (parseFloat(vt.vat) || 0) / 100 }
                    else { tongChuaHD += tt }
                  }
                  const tongThanhToan = tongChuaHD + tongCoHD + tienVAT
                  const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN')
                  return (
                    <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm space-y-1">
                      <div className="flex justify-between text-slate-600"><span>Tổng chưa hóa đơn</span><span className="font-medium">{fmt(tongChuaHD)} đ</span></div>
                      <div className="flex justify-between text-slate-600"><span>Tổng có hóa đơn (chưa VAT)</span><span className="font-medium">{fmt(tongCoHD)} đ</span></div>
                      <div className="flex justify-between text-slate-600"><span>Tiền VAT (phần có hóa đơn)</span><span className="font-medium">{fmt(tienVAT)} đ</span></div>
                      <div className="flex justify-between text-slate-800 font-bold border-t border-slate-200 pt-1 mt-1"><span>Tổng thanh toán</span><span className="text-blue-700">{fmt(tongThanhToan)} đ</span></div>
                    </div>
                  )
                })()}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Ghi chú</label>
                <textarea
                  className="w-full p-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none min-h-[80px]"
                  placeholder="Nhập ghi chú cho KTV..."
                  value={formData.ghi_chu}
                  onChange={(e) => setFormData({...formData, ghi_chu: e.target.value})}
                ></textarea>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={closeAndResetModal}>Hủy</Button>
                <Button type="submit">Lưu công việc & Báo KTV</Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

interface BulkImportToolProps {
  onImportSuccess: () => void
  showNotification: (type: 'success' | 'error', msg: string) => void
}

// Ô chọn ngày hiển thị DD/MM/YYYY (native date ẩn opacity-0 nằm đè lên)
function DateField({ value, onChange, className, heightClass = "h-10", placeholder = "dd/mm/yyyy" }: { value: string, onChange: (v: string) => void, className?: string, heightClass?: string, placeholder?: string }) {
  const f = (s: string) => { if (!s) return ''; const d = new Date(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` }
  return (
    <div className={`relative ${className || ''}`}>
      <div className={`flex ${heightClass} w-full items-center rounded-md border border-slate-200 bg-white px-3 text-sm ${value ? 'text-slate-700' : 'text-slate-400'}`}>
        {value ? f(value) : placeholder}
        <svg className="w-4 h-4 ml-auto text-slate-400 pointer-events-none shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
      </div>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
    </div>
  )
}

// Dropdown chọn nhiều (checkbox) — dùng chung cho các bộ lọc.
// Danh sách render qua portal để không bị khuất bởi thẻ overflow-hidden.
function MultiCheckDropdown({ label, options, selected, onChange }: { label: string, options: string[], selected: string[], onChange: (vals: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const updateRect = useCallback(() => { if (btnRef.current) setRect(btnRef.current.getBoundingClientRect()) }, [])
  useEffect(() => {
    if (!open) return
    updateRect()
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => { window.removeEventListener('scroll', updateRect, true); window.removeEventListener('resize', updateRect) }
  }, [open, updateRect])
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])
  return (
    <div className="shrink-0">
      <button ref={btnRef} type="button" onClick={() => setOpen(o => !o)} className={`h-9 px-3 rounded-md border text-sm bg-white flex items-center gap-1.5 hover:border-slate-300 ${selected.length > 0 ? 'border-blue-300' : 'border-slate-200'}`}>
        <span>{label}</span>
        {selected.length > 0 && <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-1.5 rounded-full">{selected.length}</span>}
        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[45]" onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, zIndex: 46 }} className="min-w-[11rem] max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg py-1">
            {options.map(o => (
              <label key={o} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-sm text-slate-700">
                <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} className="w-4 h-4 accent-blue-600" />
                {o}
              </label>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

function InventoryManagementTool({ inventory, onUpdateSuccess, showNotification, confirmDelete }: { inventory: any[], onUpdateSuccess: () => void, showNotification: (type: 'success' | 'error', msg: string) => void, confirmDelete: (id: string, type: 'job' | 'user' | 'inventory') => void }) {
  const [formData, setFormData] = useState({
    ma_hang: "",
    ten_hang: "",
    model: "",
    hang: "",
    ton_kho: 0
  })
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [highlightMH, setHighlightMH] = useState("")
  const formRef = useRef<HTMLFormElement>(null)

  // Cảnh báo trùng: đang thêm mới mà mã hàng đã có trong kho
  const dupItem = !isEditing && formData.ma_hang.trim()
    ? inventory.find(i => i.ma_hang === formData.ma_hang.trim().toUpperCase())
    : undefined

  const resetForm = () => {
    setFormData({ ma_hang: "", ten_hang: "", model: "", hang: "", ton_kho: 0 })
    setIsEditing(false)
  }

  const handleEdit = (item: any) => {
    setFormData({
      ma_hang: item.ma_hang,
      ten_hang: item.ten_hang,
      model: item.model || "",
      hang: item.hang || "",
      ton_kho: item.ton_kho || 0
    })
    setIsEditing(true)
    setHighlightMH(item.ma_hang)
    // Đưa form sửa vào tầm nhìn (form nằm phía trên, danh sách có thể đang cuộn xa)
    setTimeout(() => formRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/admin/kho-hang', {
        method: 'POST', // API route uses upsert for POST
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (res.ok) {
        showNotification('success', isEditing ? "Cập nhật vật tư thành công!" : "Thêm vật tư mới thành công!")
        resetForm()
        onUpdateSuccess()
      } else {
        const err = await res.json()
        showNotification('error', err.error)
      }
    } catch (error) {
      showNotification('error', "Lỗi kết nối!")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <form ref={formRef} onSubmit={handleSave} className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="space-y-1 lg:col-span-1">
          <label className="text-xs font-semibold text-slate-600">Mã hàng *</label>
          <Input required value={formData.ma_hang} onChange={(e) => setFormData({...formData, ma_hang: e.target.value.toUpperCase()})} disabled={isEditing} placeholder="VD: DR017" className={`bg-white ${dupItem ? 'border-amber-400 focus:ring-amber-400' : ''}`} />
          {dupItem && (
            <div className="text-xs text-amber-600 flex items-center gap-2 flex-wrap">
              ⚠ Mã đã tồn tại.
              <button type="button" onClick={() => handleEdit(dupItem)} className="underline font-medium">Sửa dòng này</button>
              <button type="button" onClick={() => { setHighlightMH(dupItem.ma_hang); setTimeout(() => document.getElementById('inv-' + dupItem.ma_hang)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0) }} className="underline text-slate-500">Xem dòng</button>
            </div>
          )}
        </div>
        <div className="space-y-1 lg:col-span-2">
          <label className="text-xs font-semibold text-slate-600">Tên hàng / Vật tư *</label>
          <Input required value={formData.ten_hang} onChange={(e) => setFormData({...formData, ten_hang: e.target.value})} placeholder="VD: Trống lấy ảnh DR017" className="bg-white" />
        </div>
        <div className="space-y-1 lg:col-span-1">
          <label className="text-xs font-semibold text-slate-600">Model máy</label>
          <Input value={formData.model} onChange={(e) => setFormData({...formData, model: e.target.value})} placeholder="VD: PP 7136" className="bg-white" />
        </div>
        <div className="space-y-1 lg:col-span-1">
          <label className="text-xs font-semibold text-slate-600">Số lượng Tồn *</label>
          <Input type="number" required value={formData.ton_kho} onChange={(e) => setFormData({...formData, ton_kho: parseInt(e.target.value) || 0})} className="bg-white" />
        </div>

        <div className="space-y-1 lg:col-span-5 flex justify-end gap-2 mt-2">
          {isEditing && <Button type="button" variant="outline" onClick={resetForm} className="h-9">Hủy</Button>}
          <Button type="submit" disabled={loading} className="h-9">{loading ? "Đang lưu..." : isEditing ? "Cập nhật vật tư" : "Thêm vật tư mới"}</Button>
        </div>
      </form>

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-500">{inventory.length} vật tư trong kho</span>
        <ClearAllButton count={inventory.length} label="vật tư trong kho" onConfirm={async () => {
          const res = await fetch('/api/admin/kho-hang?all=1', { method: 'DELETE' })
          if (res.ok) { showNotification('success', 'Đã xóa toàn bộ vật tư.'); onUpdateSuccess() } else showNotification('error', 'Xóa không thành công')
        }} />
      </div>
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden max-h-[500px] overflow-y-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 shadow-sm z-10">
            <tr>
              <th className="px-4 py-3 font-semibold">Mã hàng</th>
              <th className="px-4 py-3 font-semibold">Tên vật tư</th>
              <th className="px-4 py-3 font-semibold">Model máy</th>
              <th className="px-4 py-3 font-semibold text-center">Tồn kho</th>
              <th className="px-4 py-3 font-semibold text-center w-24">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {inventory.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Kho hàng đang trống.</td></tr>
            ) : inventory.map((item) => (
              <tr key={item.ma_hang} id={'inv-' + item.ma_hang} className={`transition-colors ${highlightMH === item.ma_hang ? 'bg-amber-100' : 'hover:bg-slate-50'}`}>
                <td className="px-4 py-3 font-mono font-medium text-slate-700">{item.ma_hang}</td>
                <td className="px-4 py-3 font-medium text-slate-800">{item.ten_hang}</td>
                <td className="px-4 py-3">{item.model || <span className="text-slate-400 italic">Dùng chung</span>}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${item.ton_kho <= 0 ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                    {item.ton_kho}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                    <button onClick={() => handleEdit(item)} title="Sửa" className="text-blue-500 hover:text-blue-700 p-1.5 bg-blue-50 hover:bg-blue-100 rounded-md transition"><PenSquare className="w-4 h-4" /></button>
                    <button onClick={() => confirmDelete(item.ma_hang, 'inventory')} title="Xóa" className="text-red-500 hover:text-red-700 p-1.5 bg-red-50 hover:bg-red-100 rounded-md transition"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function UserManagementTool({ users, onUpdateSuccess, showNotification, confirmDelete }: { users: any[], onUpdateSuccess: () => void, showNotification: (type: 'success' | 'error', msg: string) => void, confirmDelete: (id: string, type: 'job' | 'user' | 'inventory') => void }) {
  const [formData, setFormData] = useState({
    id: "",
    full_name: "",
    username: "",
    password: "",
    role: "ktv",
    telegram_id: ""
  })
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)

  // QR đăng nhập cho KTV
  const [qrModal, setQrModal] = useState<{ id: string; name: string; url: string; dataUrl: string } | null>(null)
  const [qrLoadingId, setQrLoadingId] = useState<string | null>(null)

  const resetForm = () => {
    setFormData({ id: "", full_name: "", username: "", password: "", role: "ktv", telegram_id: "" })
    setIsEditing(false)
  }

  // Bật/tắt trạng thái hoạt động (KTV nghỉ việc -> tắt để vô hiệu phiên & QR)
  const handleToggleActive = async (user: any) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, is_active: !(user.is_active !== false) })
      })
      if (res.ok) {
        showNotification('success', user.is_active !== false ? "Đã ngừng hoạt động tài khoản." : "Đã kích hoạt lại tài khoản.")
        onUpdateSuccess()
      } else {
        const err = await res.json()
        showNotification('error', err.error)
      }
    } catch {
      showNotification('error', "Lỗi kết nối!")
    }
  }

  // Tạo (hoặc tạo lại) QR đăng nhập cho KTV rồi hiển thị để in/quét
  const handleGenerateQr = async (user: any, regenerate: boolean) => {
    setQrLoadingId(user.id)
    try {
      const res = await fetch('/api/admin/ktv-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, regenerate })
      })
      if (res.ok) {
        const { data } = await res.json()
        const dataUrl = await QRCodeLib.toDataURL(data.enrollUrl, { width: 320, margin: 2 })
        setQrModal({ id: user.id, name: user.full_name, url: data.enrollUrl, dataUrl })
        if (regenerate) showNotification('success', "Đã tạo QR mới, QR cũ đã bị thu hồi.")
      } else {
        const err = await res.json()
        showNotification('error', err.error)
      }
    } catch {
      showNotification('error', "Lỗi khi tạo QR!")
    } finally {
      setQrLoadingId(null)
    }
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
    setFormData({
      id: user.id,
      full_name: user.full_name,
      username: user.username || "",
      password: "", // Không show password cũ
      role: user.role,
      telegram_id: user.telegram_id || ""
    })
    setIsEditing(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const method = isEditing ? 'PUT' : 'POST'
    try {
      const res = await fetch('/api/admin/users', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (res.ok) {
        showNotification('success', isEditing ? "Cập nhật nhân viên thành công!" : "Tạo nhân viên thành công!")
        resetForm()
        onUpdateSuccess()
      } else {
        const err = await res.json()
        showNotification('error', err.error)
      }
    } catch (error) {
      showNotification('error', "Lỗi kết nối!")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSave} className="bg-white p-4 rounded-lg border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Họ và Tên *</label>
          <Input required value={formData.full_name} onChange={(e) => setFormData({...formData, full_name: e.target.value})} placeholder="VD: Nguyễn Văn A" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Tên đăng nhập *</label>
          <Input required value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} placeholder="VD: nguyenva" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">{isEditing ? "Mật khẩu mới" : "Mật khẩu *"}</label>
          <Input required={!isEditing} type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} placeholder={isEditing ? "(Bỏ trống nếu không đổi)" : "Nhập mật khẩu"} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Quyền hạn *</label>
          <select className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500" value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})}>
            <option value="ktv">Kỹ thuật viên (KTV)</option>
            <option value="staff">Staff (Chỉ xem sổ)</option>
            <option value="tech_admin">Tech Admin</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="space-y-1 lg:col-span-2 flex items-end gap-2">
          {isEditing && <Button type="button" variant="outline" onClick={resetForm} className="h-10">Hủy sửa</Button>}
          <Button type="submit" disabled={loading} className="h-10 w-full sm:w-auto">{loading ? "Đang lưu..." : isEditing ? "Cập nhật tài khoản" : "Tạo tài khoản mới"}</Button>
        </div>
      </form>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden max-h-[400px] overflow-y-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
            <tr>
              <th className="px-4 py-2">Họ Tên</th>
              <th className="px-4 py-2">Tên đăng nhập</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2 text-center">Trạng thái</th>
              <th className="px-4 py-2 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const active = u.is_active !== false
              return (
              <tr key={u.id} className={`hover:bg-slate-50 ${!active ? 'opacity-60' : ''}`}>
                <td className="px-4 py-2 font-medium text-slate-800">{u.full_name}</td>
                <td className="px-4 py-2 font-mono text-xs">{u.username || <span className="text-slate-400 italic">N/A</span>}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${u.role === 'admin' ? 'bg-red-50 text-red-600' : u.role === 'ktv' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>{u.role}</span>
                </td>
                <td className="px-4 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${active ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                    {active ? 'Hoạt động' : 'Ngừng'}
                  </span>
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {u.role === 'ktv' && (
                    <button
                      onClick={() => handleGenerateQr(u, false)}
                      disabled={qrLoadingId === u.id}
                      title="Tạo QR đăng nhập"
                      className="text-violet-600 hover:text-violet-800 p-1 bg-violet-50 hover:bg-violet-100 rounded transition mr-2 disabled:opacity-50"
                    >
                      <QrCode className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleToggleActive(u)}
                    title={active ? 'Ngừng hoạt động' : 'Kích hoạt lại'}
                    className={`p-1 rounded transition mr-2 ${active ? 'text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100' : 'text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100'}`}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleEdit(u)} className="text-blue-500 hover:text-blue-700 p-1"><PenSquare className="w-4 h-4" /></button>
                  <button onClick={() => confirmDelete(u.id, 'user')} className="text-red-500 hover:text-red-700 p-1 ml-2"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal hiển thị QR đăng nhập KTV */}
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
    </div>
  )
}

// Ô tìm kiếm vật tư kiểu "Google": gõ mã/tên/model để lọc, chọn từ danh sách gợi ý.
// Danh sách gợi ý render qua portal (position: fixed) để không bị khuất bởi modal/thẻ overflow.
function MaterialCombobox({ inventory, value, onChange }: { inventory: any[], value: string, onChange: (ma_hang: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [rect, setRect] = useState<DOMRect | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const updateRect = useCallback(() => {
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect())
  }, [])

  useEffect(() => {
    if (!open) return
    updateRect()
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => {
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
  }, [open, updateRect])

  const selected = inventory.find(i => i.ma_hang === value)
  const q = query.trim().toLowerCase()
  const results = (q
    ? inventory.filter(i =>
        (i.ma_hang || "").toLowerCase().includes(q) ||
        (i.ten_hang || "").toLowerCase().includes(q) ||
        (i.model || "").toLowerCase().includes(q))
    : inventory
  ).slice(0, 30)

  return (
    <>
      <input
        ref={inputRef}
        className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
        placeholder="Gõ mã / tên / model để tìm vật tư..."
        value={open ? query : (selected ? `${selected.ma_hang} - ${selected.ten_hang}` : "")}
        onFocus={() => { setOpen(true); setQuery("") }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
      />
      {open && rect && createPortal(
        <div
          style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 100 }}
          className="max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg"
        >
          {results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">Không tìm thấy vật tư khớp.</div>
          ) : results.map(item => (
            <button
              type="button"
              key={item.ma_hang}
              onMouseDown={(e) => { e.preventDefault(); onChange(item.ma_hang); setQuery(""); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex justify-between items-center gap-2 ${item.ma_hang === value ? 'bg-blue-50' : ''}`}
            >
              <span className="truncate"><span className="font-mono font-medium text-slate-700">{item.ma_hang}</span> <span className="text-slate-500">- {item.ten_hang}</span></span>
              <span className={`text-xs shrink-0 ${item.ton_kho <= 0 ? 'text-red-500' : 'text-emerald-600'}`}>Tồn: {item.ton_kho}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}

// Khớp model vật tư với model máy khách theo đúng cách trên Google Sheets:
// lấy số trong model khách (bizhub 551i -> 551) rồi giữ vật tư có model chứa số đó.
function modelNumber(model: string) {
  const m = (model || '').match(/\d+/)
  return m ? m[0] : ''
}
function matchModelGD(itemModel: string, custModel: string) {
  const num = modelNumber(custModel)
  if (!num) return true                 // model khách không có số -> không lọc
  return (itemModel || '').includes(num) // vật tư không có model / không chứa số -> loại
}

function GiamDinhTool({ customers, inventory, ktvOptions, tinhTrangOptions, showNotification }: { customers: any[], inventory: any[], ktvOptions: string[], tinhTrangOptions: string[], showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const emptyForm = { ma_may: "", ngay_giam_dinh: new Date().toISOString().split('T')[0], ktv_giam_dinh: "", vi_tri: "", so_dem: "", tinh_trang_may: "", da_bao_gia: false, ghi_chu: "" }
  const [form, setForm] = useState(emptyForm)
  const [vatTu, setVatTu] = useState<{ ma_hang: string, so_luong: string, ghi_chu: string }[]>([])
  const [onlyModel, setOnlyModel] = useState(true)
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [closing, setClosing] = useState<{ id: string, so_report: string, ngay_thay: string } | null>(null)
  // Bộ lọc BBGĐ — mặc định Chờ thay + Chưa báo giá
  const [gdFilters, setGdFilters] = useState({ maMay: "", trangThai: "cho_thay", baoGia: "chua" })

  const cust = form.ma_may.trim() ? customers.find(c => c.ma_may && c.ma_may.toLowerCase() === form.ma_may.trim().toLowerCase()) : undefined
  const filteredInventory = onlyModel && cust?.model ? inventory.filter(i => matchModelGD(i.model, cust.model)) : inventory

  const filteredRecords = records.filter(r => {
    const f = gdFilters
    if (f.maMay && !(r.ma_may || '').toLowerCase().includes(f.maMay.trim().toLowerCase())) return false
    if (f.trangThai === 'cho_thay' && r.da_thay) return false
    if (f.trangThai === 'da_thay' && !r.da_thay) return false
    if (f.baoGia === 'co' && !r.da_bao_gia) return false
    if (f.baoGia === 'chua' && r.da_bao_gia) return false
    return true
  })
  const gdFilterActive = !!(gdFilters.maMay || gdFilters.trangThai !== 'cho_thay' || gdFilters.baoGia !== 'chua')

  const fetchRecords = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/giam-dinh')
      const json = await res.json()
      setRecords(json.data || [])
    } catch { showNotification('error', "Không tải được danh sách giám định") }
    finally { setLoading(false) }
  }
  useEffect(() => { fetchRecords() }, [])

  const addVt = () => setVatTu(prev => [...prev, { ma_hang: "", so_luong: "1", ghi_chu: "" }])
  const updateVt = (i: number, field: 'ma_hang' | 'so_luong' | 'ghi_chu', val: string) => {
    setVatTu(prev => prev.map((v, idx) => idx === i ? { ...v, [field]: val } : v))
  }
  const removeVt = (i: number) => setVatTu(prev => prev.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    if (!form.ma_may.trim()) return showNotification('error', "Nhập mã máy")
    setSaving(true)
    try {
      const res = await fetch('/api/admin/giam-dinh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, id_khach_hang: cust?.id || null, vat_tu: vatTu.filter(v => v.ma_hang) })
      })
      if (res.ok) {
        showNotification('success', "Đã lưu biên bản giám định.")
        setForm(emptyForm); setVatTu([]); fetchRecords()
      } else {
        const err = await res.json(); showNotification('error', err.error)
      }
    } catch { showNotification('error', "Lỗi kết nối!") }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/giam-dinh?id=${id}`, { method: 'DELETE' })
      if (res.ok) fetchRecords(); else showNotification('error', "Xóa không thành công")
    } catch { showNotification('error', "Lỗi kết nối!") }
  }

  const handleClose = async () => {
    if (!closing) return
    if (!closing.so_report.trim()) return showNotification('error', "Nhập số phiếu (report)")
    try {
      const res = await fetch('/api/admin/giam-dinh', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: closing.id, da_thay: true, ngay_thay: closing.ngay_thay, so_report: closing.so_report })
      })
      if (res.ok) { showNotification('success', "Đã đóng biên bản (đã thay)."); setClosing(null); fetchRecords() }
      else { const err = await res.json(); showNotification('error', err.error) }
    } catch { showNotification('error', "Lỗi kết nối!") }
  }

  const toggleBaoGia = async (r: any) => {
    const res = await fetch('/api/admin/giam-dinh', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, da_bao_gia: !r.da_bao_gia }) })
    if (res.ok) fetchRecords(); else showNotification('error', "Cập nhật không thành công")
  }

  const fmtDate = (s: string) => { if (!s) return ''; const d = new Date(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` }

  return (
    <div className="space-y-6">
      {/* FORM NHẬP BIÊN BẢN */}
      <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-4">
        <h3 className="text-lg font-semibold text-slate-700">Nhập biên bản giám định</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Mã máy *</label>
            <Input placeholder="Nhập mã máy" value={form.ma_may} onChange={(e) => setForm({ ...form, ma_may: e.target.value })} className="bg-white" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Khách hàng (tự tra theo mã máy)</label>
            <div className="h-10 flex items-center px-3 rounded-md border border-slate-200 bg-slate-100 text-sm text-slate-600 overflow-hidden whitespace-nowrap text-ellipsis">
              {cust ? cust.ten_khach_hang : <span className="text-slate-400 italic">Chưa khớp mã máy</span>}
            </div>
            {cust && (
              <div className="flex flex-wrap gap-2 text-xs pt-1">
                {cust.model && <span className="text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-100">Model: <b>{cust.model}</b></span>}
                {cust.dia_chi && <span className="text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-100 max-w-full truncate" title={cust.dia_chi}>Địa chỉ: <b>{cust.dia_chi}</b></span>}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Ngày giám định</label>
            <DateField value={form.ngay_giam_dinh} onChange={(v) => setForm({ ...form, ngay_giam_dinh: v })} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">KTV giám định</label>
            <Input list="gd-ktv-list" placeholder="VD: Đức Thể" value={form.ktv_giam_dinh} onChange={(e) => setForm({ ...form, ktv_giam_dinh: e.target.value })} className="bg-white" />
            <datalist id="gd-ktv-list">{ktvOptions.map(o => <option key={o} value={o} />)}</datalist>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Vị trí đặt máy</label>
            <Input placeholder="VD: P.115" value={form.vi_tri} onChange={(e) => setForm({ ...form, vi_tri: e.target.value })} className="bg-white" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Số đếm</label>
            <Input inputMode="numeric" placeholder="VD: 538000" value={form.so_dem} onChange={(e) => setForm({ ...form, so_dem: e.target.value })} className="bg-white" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Tình trạng máy</label>
            <Input list="gd-tt-list" placeholder="VD: Bản in vệt đen, kẹt giấy..." value={form.tinh_trang_may} onChange={(e) => setForm({ ...form, tinh_trang_may: e.target.value })} className="bg-white" />
            <datalist id="gd-tt-list">{tinhTrangOptions.map(o => <option key={o} value={o} />)}</datalist>
          </div>
        </div>

        {/* Vật tư đề xuất thay */}
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center gap-3 flex-wrap">
            <h4 className="text-sm font-semibold text-slate-700">Vật tư đề xuất thay</h4>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                <input type="checkbox" checked={onlyModel} onChange={(e) => setOnlyModel(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                Chỉ vật tư hợp model
              </label>
              <Button type="button" variant="outline" size="sm" onClick={addVt} className="h-8 text-xs gap-1"><Plus className="w-3 h-3" /> Thêm</Button>
            </div>
          </div>
          <div className="p-4 space-y-2">
            {vatTu.length === 0 ? (
              <p className="text-sm text-slate-400 italic text-center py-1">Chưa có vật tư đề xuất.</p>
            ) : vatTu.map((vt, i) => (
              <div key={i} className="flex gap-2 items-end">
                <div className="flex-1">
                  <MaterialCombobox inventory={filteredInventory} value={vt.ma_hang} onChange={(v) => updateVt(i, 'ma_hang', v)} />
                </div>
                <div className="w-20">
                  <Input type="number" min="1" className="h-9 bg-white" value={vt.so_luong} onChange={(e) => updateVt(i, 'so_luong', e.target.value)} />
                </div>
                <button type="button" onClick={() => removeVt(i)} className="text-slate-400 hover:text-red-500 p-2 shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={form.da_bao_gia} onChange={(e) => setForm({ ...form, da_bao_gia: e.target.checked })} className="w-4 h-4 accent-blue-600" />
            Đã báo giá
          </label>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? "Đang lưu..." : "Lưu biên bản giám định"}</Button>
        </div>
      </div>

      {/* DANH SÁCH BIÊN BẢN + BỘ LỌC */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <h3 className="text-sm font-bold text-slate-700">Danh sách biên bản giám định</h3>
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">{filteredRecords.length}/{records.length}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-1">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Lọc theo mã máy..." className="pl-9 bg-white h-9" value={gdFilters.maMay} onChange={(e) => setGdFilters({ ...gdFilters, maMay: e.target.value })} />
          </div>
          <select value={gdFilters.trangThai} onChange={(e) => setGdFilters({ ...gdFilters, trangThai: e.target.value })} className="h-9 px-2 rounded-md border border-slate-200 text-sm bg-white outline-none">
            <option value="">Trạng thái: Tất cả</option>
            <option value="cho_thay">Chờ thay</option>
            <option value="da_thay">Đã thay</option>
          </select>
          <select value={gdFilters.baoGia} onChange={(e) => setGdFilters({ ...gdFilters, baoGia: e.target.value })} className="h-9 px-2 rounded-md border border-slate-200 text-sm bg-white outline-none">
            <option value="">Báo giá: Tất cả</option>
            <option value="chua">Chưa báo giá</option>
            <option value="co">Đã báo giá</option>
          </select>
          {gdFilterActive && <button onClick={() => setGdFilters({ maMay: "", trangThai: "", baoGia: "" })} className="text-xs text-red-600 hover:underline font-medium">Bỏ lọc</button>}
        </div>
        {loading ? (
          <p className="text-sm text-slate-400 text-center py-8">Đang tải...</p>
        ) : records.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-400 text-sm">Chưa có biên bản giám định nào.</div>
        ) : filteredRecords.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-400 text-sm">Không có biên bản khớp bộ lọc.</div>
        ) : filteredRecords.map((r) => (
          <div key={r.id} className={`bg-white rounded-lg border p-4 space-y-2 ${r.da_thay ? 'border-slate-200 opacity-75' : 'border-amber-200'}`}>
            <div className="flex justify-between items-start gap-3 flex-wrap">
              <div>
                <div className="font-medium text-slate-800">{r.soct_khach_hang?.ten_khach_hang || 'Không rõ khách hàng'}</div>
                <div className="text-xs text-slate-500">Mã máy <span className="font-mono">{r.ma_may}</span> · {r.soct_khach_hang?.model || '-'} · GĐ {fmtDate(r.ngay_giam_dinh)}{r.ktv_giam_dinh ? ` · ${r.ktv_giam_dinh}` : ''}</div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${r.da_bao_gia ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                  {r.da_bao_gia ? 'Đã báo giá' : 'Chưa báo giá'}
                </span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${r.da_thay ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                  {r.da_thay ? `Đã thay${r.so_report ? ` · ${r.so_report}` : ''}` : 'Chờ thay'}
                </span>
              </div>
            </div>

            {r.tinh_trang_may && <div className="text-xs text-slate-600">Tình trạng: {r.tinh_trang_may}{r.so_dem ? ` · Số đếm ${Number(r.so_dem).toLocaleString('vi-VN')}` : ''}</div>}

            {r.soct_giam_dinh_vat_tu?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {r.soct_giam_dinh_vat_tu.map((v: any) => (
                  <span key={v.id} className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1">
                    <span className="font-mono text-slate-700">{v.ma_hang}</span> {v.soct_kho_hang?.ten_hang || ''} <span className="text-slate-400">×{v.so_luong}</span>
                  </span>
                ))}
              </div>
            )}

            {closing && closing.id === r.id ? (
              <div className="flex items-end gap-2 flex-wrap border-t border-slate-100 pt-2">
                <div><label className="text-xs text-slate-500 block mb-1">Số phiếu *</label><Input value={closing.so_report} onChange={(e) => setClosing({ ...closing, so_report: e.target.value })} className="h-9 bg-white w-36" placeholder="VD: 956807" /></div>
                <div><label className="text-xs text-slate-500 block mb-1">Ngày thay</label><DateField value={closing.ngay_thay} onChange={(v) => setClosing({ ...closing, ngay_thay: v })} heightClass="h-9" className="w-36" /></div>
                <Button onClick={handleClose} className="h-9 bg-emerald-600 hover:bg-emerald-700">Xác nhận đã thay</Button>
                <Button variant="outline" onClick={() => setClosing(null)} className="h-9">Hủy</Button>
              </div>
            ) : (
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-2">
                <Button variant="outline" onClick={() => toggleBaoGia(r)} className={`h-8 text-xs ${r.da_bao_gia ? 'text-slate-600' : 'border-blue-200 text-blue-700 hover:bg-blue-50'}`}>{r.da_bao_gia ? 'Bỏ đánh dấu báo giá' : 'Đánh dấu đã báo giá'}</Button>
                {!r.da_thay && <Button variant="outline" onClick={() => setClosing({ id: r.id, so_report: r.so_report || "", ngay_thay: new Date().toISOString().split('T')[0] })} className="h-8 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50">Đóng (đã thay)</Button>}
                <button onClick={() => handleDelete(r.id)} className="text-red-500 hover:text-red-700 p-1.5 bg-red-50 hover:bg-red-100 rounded-md transition"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Nút xóa cứng toàn bộ một danh sách — yêu cầu gõ "XÓA" để xác nhận
function ClearAllButton({ count, label, onConfirm }: { count: number, label: string, onConfirm: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [txt, setTxt] = useState("")
  const [busy, setBusy] = useState(false)
  if (count === 0) return null
  const ok = ['XÓA', 'XOA'].includes(txt.trim().toUpperCase())
  return (
    <>
      <Button variant="outline" onClick={() => { setOpen(true); setTxt("") }} className="border-red-200 text-red-600 hover:bg-red-50 gap-1 h-9 text-xs shrink-0"><Trash2 className="w-3.5 h-3.5" /> Xóa toàn bộ</Button>
      {open && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 space-y-3">
              <h3 className="text-lg font-bold text-red-700 flex items-center gap-2"><Trash2 className="w-5 h-5" /> Xóa toàn bộ {label}</h3>
              <p className="text-sm text-slate-600">Thao tác này xóa <b>{count}</b> bản ghi khỏi cơ sở dữ liệu (xóa cứng, <b>không thể hoàn tác</b>) cùng dữ liệu liên quan. Nhập <b>XÓA</b> để xác nhận.</p>
              <Input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Gõ XÓA" className="bg-white" autoFocus />
            </div>
            <div className="bg-slate-50 p-4 flex justify-end gap-2 border-t border-slate-100">
              <Button variant="outline" onClick={() => setOpen(false)}>Hủy</Button>
              <Button variant="destructive" disabled={!ok || busy} onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); setOpen(false) }}>{busy ? 'Đang xóa...' : 'Xác nhận xóa'}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function NhapHangThangTool({ showNotification }: { showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [thang, setThang] = useState("")
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const fetchRows = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/nhap-hang-thang' + (thang ? `?thang_nam=${thang}` : ''))
      const json = await res.json()
      setRows(json.data || [])
    } catch { showNotification('error', "Không tải được thống kê") }
    finally { setLoading(false) }
  }
  useEffect(() => { fetchRows() }, [thang])

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Lọc theo tháng (để trống = tất cả)</label>
          <input type="month" value={thang} onChange={(e) => setThang(e.target.value)} className="h-10 px-3 rounded-md border border-slate-200 text-sm outline-none bg-white block" />
        </div>
        {thang && <Button variant="outline" onClick={() => setThang("")} className="h-10">Xem tất cả</Button>}
      </div>
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden max-h-[480px] overflow-y-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 shadow-sm z-10">
            <tr><th className="px-4 py-3 font-semibold">Tháng</th><th className="px-4 py-3 font-semibold">Mã hàng</th><th className="px-4 py-3 font-semibold">Tên vật tư</th><th className="px-4 py-3 font-semibold text-center">SL nhập</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Đang tải...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Chưa có dữ liệu nhập.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-mono text-xs">{r.thang_nam.split('-').reverse().join('/')}</td>
                <td className="px-4 py-2.5 font-mono font-medium text-slate-700">{r.ma_hang}</td>
                <td className="px-4 py-2.5">{r.soct_kho_hang?.ten_hang || ''}</td>
                <td className="px-4 py-2.5 text-center font-bold text-emerald-600">{r.so_luong_nhap}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DatHangTool({ inventory, nhaCungCapOptions, onUpdateSuccess, showNotification }: { inventory: any[], nhaCungCapOptions: string[], onUpdateSuccess: () => void, showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [form, setForm] = useState({ ngay_dat: new Date().toISOString().split('T')[0], nha_cung_cap: "", so_don_hang: "", da_dat: false })
  const [lines, setLines] = useState<{ ma_hang: string, sl_dat: string }[]>([{ ma_hang: "", sl_dat: "1" }])
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [receiving, setReceiving] = useState<{ ctId: string, ngay_nhan: string, so_luong_nhan: string } | null>(null)
  const [delId, setDelId] = useState<string | null>(null)
  const [orderFilters, setOrderFilters] = useState({ maHang: "", ncc: "", conThieu: true, hvTu: "", hvDen: "" })

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/dat-hang')
      const json = await res.json()
      setOrders(json.data || [])
    } catch { showNotification('error', "Không tải được đơn đặt hàng") }
    finally { setLoading(false) }
  }
  useEffect(() => { fetchOrders() }, [])

  // Sinh số đơn mặc định PO-YYMMDD-NNN theo ngày + số thứ tự trong ngày
  const genSoDon = (ngay: string) => {
    const d = new Date(ngay)
    const p = `PO-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-`
    let max = 0
    for (const o of orders) if (o.so_don_hang?.startsWith(p)) { const n = parseInt(o.so_don_hang.slice(p.length)) || 0; if (n > max) max = n }
    return p + String(max + 1).padStart(3, '0')
  }
  // Điền số đơn tự động khi trống hoặc đang là mã tự sinh (giữ nguyên nếu người dùng gõ số khác)
  useEffect(() => {
    setForm(f => (!f.so_don_hang || /^PO-\d{6}-\d{3}$/.test(f.so_don_hang)) ? { ...f, so_don_hang: genSoDon(f.ngay_dat) } : f)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, form.ngay_dat])

  const filteredOrders = orders.filter(o => {
    const of = orderFilters
    if (of.conThieu && o.hoan_thanh) return false
    if (of.ncc && o.nha_cung_cap !== of.ncc) return false
    if (of.maHang) {
      const q = of.maHang.trim().toLowerCase()
      if (!(o.soct_dat_hang_ct || []).some((l: any) => (l.ma_hang || '').toLowerCase().includes(q) || (l.soct_kho_hang?.ten_hang || '').toLowerCase().includes(q))) return false
    }
    if (of.hvTu || of.hvDen) {
      const receipts = (o.soct_dat_hang_ct || []).flatMap((l: any) => l.soct_hang_ve_dot || [])
      if (!receipts.some((h: any) => (!of.hvTu || h.ngay_nhan >= of.hvTu) && (!of.hvDen || h.ngay_nhan <= of.hvDen))) return false
    }
    return true
  })

  const addLine = () => setLines(p => [...p, { ma_hang: "", sl_dat: "1" }])
  const updLine = (i: number, f: 'ma_hang' | 'sl_dat', v: string) => setLines(p => p.map((l, idx) => idx === i ? { ...l, [f]: v } : l))
  const rmLine = (i: number) => setLines(p => p.filter((_, idx) => idx !== i))

  const handleCreate = async () => {
    const valid = lines.filter(l => l.ma_hang && parseInt(l.sl_dat) > 0)
    if (valid.length === 0) return showNotification('error', "Thêm ít nhất một dòng hàng hợp lệ")
    setSaving(true)
    try {
      const res = await fetch('/api/admin/dat-hang', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, lines: valid }) })
      if (res.ok) {
        showNotification('success', "Đã tạo đơn đặt hàng.")
        setForm({ ngay_dat: new Date().toISOString().split('T')[0], nha_cung_cap: "", so_don_hang: "", da_dat: false })
        setLines([{ ma_hang: "", sl_dat: "1" }]); fetchOrders()
      } else { const err = await res.json(); showNotification('error', err.error) }
    } catch { showNotification('error', "Lỗi kết nối!") }
    finally { setSaving(false) }
  }

  const toggleDaDat = async (o: any) => {
    const res = await fetch('/api/admin/dat-hang', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: o.id, da_dat: !o.da_dat }) })
    if (res.ok) fetchOrders(); else showNotification('error', "Cập nhật không thành công")
  }
  const deleteOrder = async (id: string) => {
    const res = await fetch(`/api/admin/dat-hang?id=${id}`, { method: 'DELETE' })
    setDelId(null)
    if (res.ok) { showNotification('success', "Đã xóa đơn (hoàn tồn kho các đợt đã nhận)."); onUpdateSuccess(); fetchOrders() }
    else showNotification('error', "Xóa không thành công")
  }
  const saveReceipt = async () => {
    if (!receiving || !(parseInt(receiving.so_luong_nhan) > 0)) return showNotification('error', "Nhập số lượng nhận")
    const res = await fetch('/api/admin/hang-ve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(receiving.ctId ? { id_dat_hang_ct: receiving.ctId, ngay_nhan: receiving.ngay_nhan, so_luong_nhan: receiving.so_luong_nhan } : {}) })
    if (res.ok) { showNotification('success', "Đã ghi hàng về (tồn kho tự cộng)."); setReceiving(null); onUpdateSuccess(); fetchOrders() }
    else { const err = await res.json(); showNotification('error', err.error) }
  }
  const deleteReceipt = async (id: string) => {
    const res = await fetch(`/api/admin/hang-ve?id=${id}`, { method: 'DELETE' })
    if (res.ok) { onUpdateSuccess(); fetchOrders() } else showNotification('error', "Xóa đợt hàng về không thành công")
  }

  const fmtDate = (s: string) => { if (!s) return ''; const d = new Date(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` }
  const daNhan = (line: any) => (line.soct_hang_ve_dot || []).reduce((s: number, h: any) => s + h.so_luong_nhan, 0)

  const exportOrdersCsv = () => {
    const headers = ['Ngày đặt', 'Nhà cung cấp', 'Số đơn', 'Trạng thái', 'Mã hàng', 'Tên hàng', 'SL đặt', 'Đã nhận', 'Còn thiếu']
    const cell = (v: any) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const rows: any[][] = []
    for (const o of filteredOrders) for (const l of (o.soct_dat_hang_ct || [])) {
      const nhan = daNhan(l)
      rows.push([fmtDate(o.ngay_dat), o.nha_cung_cap, o.so_don_hang, o.da_dat ? 'Đã đặt' : 'Nháp', l.ma_hang, l.soct_kho_hang?.ten_hang, l.sl_dat, nhan, l.sl_dat - nhan])
    }
    const csv = [headers, ...rows].map(r => r.map(cell).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `dat-hang-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* FORM TẠO ĐƠN */}
      <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-4">
        <h3 className="text-lg font-semibold text-slate-700">Tạo đơn đặt hàng</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Ngày đặt</label>
            <DateField value={form.ngay_dat} onChange={(v) => setForm({ ...form, ngay_dat: v })} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Nhà cung cấp</label>
            <Input list="dh-ncc-list" placeholder="Chọn hoặc gõ NCC" value={form.nha_cung_cap} onChange={(e) => setForm({ ...form, nha_cung_cap: e.target.value })} className="bg-white" />
            <datalist id="dh-ncc-list">{nhaCungCapOptions.map(o => <option key={o} value={o} />)}</datalist>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Số đơn hàng</label>
            <Input placeholder="VD: PO-2026-001" value={form.so_don_hang} onChange={(e) => setForm({ ...form, so_don_hang: e.target.value })} className="bg-white" />
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
          <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex justify-between items-center">
            <h4 className="text-sm font-semibold text-slate-700">Dòng hàng đặt</h4>
            <Button type="button" variant="outline" size="sm" onClick={addLine} className="h-8 text-xs gap-1"><Plus className="w-3 h-3" /> Thêm dòng</Button>
          </div>
          <div className="p-4 space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="flex gap-2 items-end">
                <div className="flex-1 min-w-0">
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Mã hàng</label>
                  <MaterialCombobox inventory={inventory} value={l.ma_hang} onChange={(v) => updLine(i, 'ma_hang', v)} />
                </div>
                <div className="w-28">
                  <label className="text-xs font-medium text-slate-500 mb-1 block">SL đặt</label>
                  <Input type="number" min="1" className="h-9 bg-white" value={l.sl_dat} onChange={(e) => updLine(i, 'sl_dat', e.target.value)} />
                </div>
                <button type="button" onClick={() => rmLine(i)} className="text-slate-400 hover:text-red-500 p-2 shrink-0 h-9"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={form.da_dat} onChange={(e) => setForm({ ...form, da_dat: e.target.checked })} className="w-4 h-4 accent-blue-600" />
            Đã đặt (đã gửi NCC) — bỏ trống nếu còn nháp
          </label>
          <Button onClick={handleCreate} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? "Đang lưu..." : "Tạo đơn"}</Button>
        </div>
      </div>

      {/* DANH SÁCH ĐƠN + BỘ LỌC */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap px-1">
          <h3 className="text-sm font-bold text-slate-700">Danh sách đơn đặt hàng ({filteredOrders.length}/{orders.length})</h3>
          <Button variant="outline" onClick={exportOrdersCsv} className="gap-2 h-9 text-xs"><Download className="w-4 h-4" /> Xuất CSV</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-1">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Lọc theo mã hàng / tên..." className="pl-9 bg-white h-9" value={orderFilters.maHang} onChange={(e) => setOrderFilters({ ...orderFilters, maHang: e.target.value })} />
          </div>
          <select value={orderFilters.ncc} onChange={(e) => setOrderFilters({ ...orderFilters, ncc: e.target.value })} className="h-9 px-2 rounded-md border border-slate-200 text-sm bg-white outline-none">
            <option value="">NCC: Tất cả</option>
            {nhaCungCapOptions.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none h-9">
            <input type="checkbox" checked={orderFilters.conThieu} onChange={(e) => setOrderFilters({ ...orderFilters, conThieu: e.target.checked })} className="w-4 h-4 accent-blue-600" />
            Chỉ đơn còn thiếu
          </label>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Hàng về</span>
            <DateField value={orderFilters.hvTu} onChange={(v) => setOrderFilters({ ...orderFilters, hvTu: v })} heightClass="h-9" className="w-32" />
            <span>–</span>
            <DateField value={orderFilters.hvDen} onChange={(v) => setOrderFilters({ ...orderFilters, hvDen: v })} heightClass="h-9" className="w-32" />
          </div>
          {(orderFilters.maHang || orderFilters.ncc || !orderFilters.conThieu || orderFilters.hvTu || orderFilters.hvDen) && (
            <button onClick={() => setOrderFilters({ maHang: "", ncc: "", conThieu: true, hvTu: "", hvDen: "" })} className="text-xs text-red-600 hover:underline font-medium">Bỏ lọc</button>
          )}
        </div>
        {loading ? <p className="text-sm text-slate-400 text-center py-8">Đang tải...</p>
          : orders.length === 0 ? <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-400 text-sm">Chưa có đơn đặt hàng nào.</div>
          : filteredOrders.length === 0 ? <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-400 text-sm">Không có đơn khớp bộ lọc.</div>
          : filteredOrders.map(o => (
            <div key={o.id} className={`bg-white rounded-lg border p-4 space-y-3 ${o.hoan_thanh ? 'border-slate-200 opacity-80' : 'border-slate-200'}`}>
              <div className="flex justify-between items-start gap-3 flex-wrap">
                <div>
                  <div className="font-medium text-slate-800">{o.nha_cung_cap || 'Chưa có NCC'} {o.so_don_hang && <span className="text-slate-400 font-normal">· {o.so_don_hang}</span>}</div>
                  <div className="text-xs text-slate-500">Ngày đặt {fmtDate(o.ngay_dat)}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => toggleDaDat(o)} className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${o.da_dat ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{o.da_dat ? 'Đã đặt' : 'Nháp'}</button>
                  {o.hoan_thanh && <span className="px-2.5 py-1 rounded-full text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200">Đã đủ hàng</span>}
                  {delId === o.id ? (
                    <span className="flex items-center gap-1 text-xs">
                      <button onClick={() => deleteOrder(o.id)} className="text-red-600 font-semibold px-2 py-1 bg-red-50 rounded">Xác nhận xóa</button>
                      <button onClick={() => setDelId(null)} className="text-slate-500 px-2 py-1">Hủy</button>
                    </span>
                  ) : (
                    <button onClick={() => setDelId(o.id)} className="text-red-500 hover:text-red-700 p-1.5 bg-red-50 hover:bg-red-100 rounded-md" title="Xóa đơn"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              </div>

              <div className="border border-slate-100 rounded-md overflow-hidden">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2 font-medium">Mã hàng</th><th className="px-3 py-2 font-medium text-center">Đặt</th><th className="px-3 py-2 font-medium text-center">Đã nhận</th><th className="px-3 py-2 font-medium text-center">Còn thiếu</th><th className="px-3 py-2 font-medium">Đợt hàng về</th><th className="px-3 py-2"></th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {(o.soct_dat_hang_ct || []).map((line: any) => {
                      const nhan = daNhan(line); const thieu = line.sl_dat - nhan
                      return (
                        <tr key={line.id} className={line.hoan_thanh ? 'bg-emerald-50/40' : ''}>
                          <td className="px-3 py-2"><span className="font-mono font-medium text-slate-700">{line.ma_hang}</span> <span className="text-slate-500">{line.soct_kho_hang?.ten_hang || ''}</span></td>
                          <td className="px-3 py-2 text-center">{line.sl_dat}</td>
                          <td className="px-3 py-2 text-center font-medium text-emerald-600">{nhan}</td>
                          <td className={`px-3 py-2 text-center font-medium ${thieu > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{thieu > 0 ? thieu : '—'}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {(line.soct_hang_ve_dot || []).map((h: any) => (
                                <span key={h.id} className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
                                  {fmtDate(h.ngay_nhan)}: <b>{h.so_luong_nhan}</b>
                                  <button onClick={() => deleteReceipt(h.id)} className="text-slate-400 hover:text-red-500" title="Xóa đợt này">✕</button>
                                </span>
                              ))}
                            </div>
                            {receiving && receiving.ctId === line.id && (
                              <div className="flex items-end gap-1.5 mt-1.5">
                                <DateField value={receiving.ngay_nhan} onChange={(v) => setReceiving({ ...receiving, ngay_nhan: v })} heightClass="h-8" className="w-36" />
                                <Input type="number" min="1" placeholder="SL nhận" value={receiving.so_luong_nhan} onChange={(e) => setReceiving({ ...receiving, so_luong_nhan: e.target.value })} className="h-8 bg-white w-24" />
                                <Button onClick={saveReceipt} className="h-8 text-xs px-3 bg-emerald-600 hover:bg-emerald-700">Lưu</Button>
                                <Button variant="outline" onClick={() => setReceiving(null)} className="h-8 text-xs px-3">Hủy</Button>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {!line.hoan_thanh && (!receiving || receiving.ctId !== line.id) && (
                              <button onClick={() => setReceiving({ ctId: line.id, ngay_nhan: new Date().toISOString().split('T')[0], so_luong_nhan: "" })} className="text-blue-600 hover:text-blue-800 text-xs font-medium whitespace-nowrap">+ Ghi hàng về</button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {o.ghi_chu && <div className="text-xs text-slate-500 italic">Ghi chú: {o.ghi_chu}</div>}
            </div>
          ))}
      </div>
    </div>
  )
}

const DANH_MUC_NHOMS = [
  { key: 'loai_cong_viec', label: 'Loại công việc' },
  { key: 'loai_hd', label: 'Loại hợp đồng' },
  { key: 'ktv_giam_dinh', label: 'KTV giám định' },
  { key: 'tinh_trang_may', label: 'Tình trạng máy' },
  { key: 'nha_cung_cap', label: 'Nhà cung cấp' },
]

function DanhMucTool({ danhMuc, cauHinh, onUpdateSuccess, showNotification }: { danhMuc: any[], cauHinh: Record<string, string>, onUpdateSuccess: () => void, showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [nhom, setNhom] = useState('loai_cong_viec')
  const [newVal, setNewVal] = useState("")
  const [editId, setEditId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState("")
  const [hdbtThang, setHdbtThang] = useState(cauHinh.hdbt_canh_bao_thang || "2")

  const items = danhMuc.filter(d => d.nhom === nhom)

  const call = async (method: string, body?: any, qs = "") => {
    const res = await fetch('/api/admin/danh-muc' + qs, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    if (res.ok) { onUpdateSuccess(); return true }
    const err = await res.json(); showNotification('error', err.error); return false
  }

  const addVal = async () => {
    if (!newVal.trim()) return
    if (await call('POST', { nhom, gia_tri: newVal.trim() })) { setNewVal(""); showNotification('success', "Đã thêm giá trị.") }
  }
  const saveEdit = async () => {
    if (!editId || !editVal.trim()) return
    if (await call('PUT', { id: editId, gia_tri: editVal.trim() })) setEditId(null)
  }
  const saveHdbt = async () => {
    const res = await fetch('/api/admin/cau-hinh', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ khoa: 'hdbt_canh_bao_thang', gia_tri: String(parseInt(hdbtThang) || 2) }) })
    if (res.ok) { showNotification('success', "Đã lưu mốc cảnh báo HĐBT."); onUpdateSuccess() }
    else showNotification('error', "Lưu không thành công")
  }

  return (
    <div className="space-y-6">
      {/* Cấu hình cảnh báo HĐBT */}
      <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50">
        <h3 className="text-lg font-semibold text-slate-700 mb-2">Cấu hình cảnh báo HĐBT</h3>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Cảnh báo trước (tháng)</label>
            <Input type="number" min="1" className="w-32 bg-white" value={hdbtThang} onChange={(e) => setHdbtThang(e.target.value)} />
          </div>
          <Button onClick={saveHdbt} className="h-10">Lưu</Button>
          <p className="text-xs text-slate-500 flex-1 min-w-[200px]">Khách có ngày hết hạn HĐBT trong vòng số tháng này sẽ được cảnh báo trên Sổ công tác.</p>
        </div>
      </div>

      {/* Quản lý danh mục dropdown */}
      <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-4">
        <h3 className="text-lg font-semibold text-slate-700">Danh mục dropdown</h3>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-max max-w-full overflow-x-auto">
          {DANH_MUC_NHOMS.map(n => (
            <button key={n.key} onClick={() => { setNhom(n.key); setEditId(null) }} className={`px-3 py-1.5 rounded-md font-medium text-xs transition whitespace-nowrap ${nhom === n.key ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{n.label}</button>
          ))}
        </div>

        <div className="flex gap-2">
          <Input placeholder="Thêm giá trị mới..." className="bg-white" value={newVal} onChange={(e) => setNewVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVal() } }} />
          <Button onClick={addVal} className="gap-1 shrink-0"><Plus className="w-4 h-4" /> Thêm</Button>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden max-h-[400px] overflow-y-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
              <tr><th className="px-4 py-2 font-semibold">Giá trị</th><th className="px-4 py-2 font-semibold text-center w-24">Trạng thái</th><th className="px-4 py-2 font-semibold text-right w-28">Thao tác</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">Nhóm này chưa có giá trị. Thêm ở trên.</td></tr>
              ) : items.map(it => (
                <tr key={it.id} className={`hover:bg-slate-50 ${it.active ? '' : 'opacity-50'}`}>
                  <td className="px-4 py-2">
                    {editId === it.id ? (
                      <div className="flex gap-2">
                        <Input value={editVal} onChange={(e) => setEditVal(e.target.value)} className="h-8 bg-white" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit() } }} />
                        <Button onClick={saveEdit} className="h-8 text-xs px-3">Lưu</Button>
                        <Button variant="outline" onClick={() => setEditId(null)} className="h-8 text-xs px-3">Hủy</Button>
                      </div>
                    ) : <span className="font-medium text-slate-800">{it.gia_tri}</span>}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button onClick={() => call('PUT', { id: it.id, active: !it.active })} className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${it.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                      {it.active ? 'Đang dùng' : 'Đã ẩn'}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button onClick={() => { setEditId(it.id); setEditVal(it.gia_tri) }} className="text-blue-500 hover:text-blue-700 p-1"><PenSquare className="w-4 h-4" /></button>
                    <button onClick={() => call('DELETE', undefined, `?id=${it.id}`)} className="text-red-500 hover:text-red-700 p-1 ml-1"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function BaoTriTool({ customers, showNotification }: { customers: any[], showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [thangNam, setThangNam] = useState(new Date().toISOString().slice(0, 7))
  const [text, setText] = useState("")
  const [preview, setPreview] = useState<{ ma_may: string, cust: any, excluded: boolean }[] | null>(null)
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const customerByMaMay = new Map(customers.filter(c => c.ma_may).map(c => [String(c.ma_may).toLowerCase(), c]))
  const kept = preview ? preview.filter(p => !p.excluded) : []
  const unknownKept = kept.filter(p => !p.cust).length
  const daBaoTriSet = new Set(records.map((r: any) => String(r.ma_may).toLowerCase()))
  const dupKept = kept.filter(p => daBaoTriSet.has(p.ma_may.toLowerCase())).length

  const fetchRecords = async (thang: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/bao-tri?thang_nam=${thang}`)
      const json = await res.json()
      setRecords(json.data || [])
    } catch {
      showNotification('error', "Không tải được dữ liệu bảo trì")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRecords(thangNam) }, [thangNam])

  const handleAnalyze = () => {
    const raw = text.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)
    const seen = new Set<string>()
    const list: { ma_may: string, cust: any, excluded: boolean }[] = []
    for (const m of raw) {
      const key = m.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      list.push({ ma_may: m, cust: customerByMaMay.get(key) || null, excluded: false })
    }
    if (list.length === 0) return showNotification('error', "Nhập ít nhất một mã máy")
    setPreview(list)
  }

  const toggleExclude = (i: number) => {
    setPreview(prev => prev ? prev.map((p, idx) => idx === i ? { ...p, excluded: !p.excluded } : p) : prev)
  }

  const handleSave = async () => {
    if (!preview) return
    const ma_mays = preview.filter(p => !p.excluded).map(p => p.ma_may)
    if (ma_mays.length === 0) return showNotification('error', "Không còn mã nào để lưu")
    setSaving(true)
    try {
      const res = await fetch('/api/admin/bao-tri', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thang_nam: thangNam, ma_mays })
      })
      if (res.ok) {
        const data = await res.json()
        showNotification('success', `Đã đánh dấu ${data.count} máy bảo trì tháng ${thangNam.split('-').reverse().join('/')}.`)
        setText(""); setPreview(null)
        fetchRecords(thangNam)
      } else {
        const err = await res.json()
        showNotification('error', err.error)
      }
    } catch {
      showNotification('error', "Lỗi kết nối!")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/bao-tri?id=${id}`, { method: 'DELETE' })
      if (res.ok) fetchRecords(thangNam)
      else showNotification('error', "Xóa không thành công")
    } catch {
      showNotification('error', "Lỗi kết nối!")
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  }

  return (
    <div className="space-y-6">
      <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Tháng bảo trì</label>
            <input type="month" value={thangNam} onChange={(e) => setThangNam(e.target.value)} className="h-10 px-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white block" />
          </div>
          <p className="text-sm text-slate-500 flex-1">Dán danh sách <b>mã máy</b> đã bảo trì trong tháng (cách nhau bởi xuống dòng, dấu phẩy hoặc khoảng trắng).</p>
        </div>
        <textarea
          rows={4}
          className="w-full p-3 rounded-md border border-slate-200 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="VD: 35971 36068 36084..."
          value={text}
          onChange={(e) => { setText(e.target.value); setPreview(null) }}
        />

        {!preview ? (
          <Button onClick={handleAnalyze} variant="outline">
            Phân tích ({text.split(/[\s,;]+/).filter(Boolean).length} mã)
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <span className="text-emerald-700 font-medium">{kept.length} mã sẽ lưu</span>
              {unknownKept > 0 && <span className="text-red-600 font-medium">⚠ {unknownKept} mã lạ (không khớp khách hàng)</span>}
              {dupKept > 0 && <span className="text-amber-600 font-medium">⚠ {dupKept} mã đã bảo trì tháng này (trùng)</span>}
              {preview.length - kept.length > 0 && <span className="text-slate-400">· {preview.length - kept.length} mã đã bỏ</span>}
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto bg-white">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-100 sticky top-0 border-b border-slate-200">
                  <tr><th className="px-3 py-2 font-medium text-center w-12">Bỏ</th><th className="px-3 py-2 font-medium">Mã máy</th><th className="px-3 py-2 font-medium">Khách hàng</th><th className="px-3 py-2 font-medium">HĐBT</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.map((p, i) => {
                    const daBaoTri = daBaoTriSet.has(p.ma_may.toLowerCase())
                    return (
                    <tr key={i} className={p.excluded ? 'opacity-40 line-through' : (!p.cust ? 'bg-red-50' : (daBaoTri ? 'bg-amber-50' : ''))}>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={p.excluded} onChange={() => toggleExclude(i)} className="w-4 h-4 accent-red-500 no-underline" title="Tick để bỏ mã này, không lưu" />
                      </td>
                      <td className="px-3 py-2 font-mono font-medium">{p.ma_may}{daBaoTri && <span className="ml-1.5 text-amber-600 font-normal">(đã bảo trì)</span>}</td>
                      <td className="px-3 py-2">{p.cust ? p.cust.ten_khach_hang : <span className="text-red-600 font-medium">Không khớp — có thể nhập sai</span>}</td>
                      <td className="px-3 py-2">{p.cust ? (p.cust.loai_hd || <span className="text-slate-300">—</span>) : ''}</td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving || kept.length === 0} className="bg-emerald-600 hover:bg-emerald-700">
                {saving ? "Đang lưu..." : `Xác nhận lưu ${kept.length} mã`}
              </Button>
              <Button variant="outline" onClick={() => setPreview(null)}>Sửa lại</Button>
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2 px-1">
          <h3 className="text-sm font-bold text-slate-700">Đã bảo trì tháng {thangNam.split('-').reverse().join('/')}</h3>
          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">{records.length} máy</span>
          <div className="ml-auto">
            <ClearAllButton count={records.length} label={`bảo trì tháng ${thangNam.split('-').reverse().join('/')}`} onConfirm={async () => {
              const res = await fetch(`/api/admin/bao-tri?all=1&thang_nam=${thangNam}`, { method: 'DELETE' })
              if (res.ok) { showNotification('success', 'Đã xóa toàn bộ bảo trì tháng này.'); fetchRecords(thangNam) } else showNotification('error', 'Xóa không thành công')
            }} />
          </div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden max-h-[420px] overflow-y-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 shadow-sm z-10">
              <tr>
                <th className="px-4 py-3 font-semibold">Mã máy</th>
                <th className="px-4 py-3 font-semibold">Khách hàng</th>
                <th className="px-4 py-3 font-semibold">Ngày</th>
                <th className="px-4 py-3 font-semibold text-center w-16">Xóa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Đang tải...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Chưa có máy nào được đánh dấu bảo trì tháng này.</td></tr>
              ) : records.map((r) => {
                const kh = customerByMaMay.get(String(r.ma_may).toLowerCase())
                return (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-slate-700">{r.ma_may}</td>
                    <td className="px-4 py-3">{kh ? kh.ten_khach_hang : <span className="text-slate-400 italic">Không khớp khách hàng</span>}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(r.ngay)}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => handleDelete(r.id)} className="text-red-500 hover:text-red-700 p-1.5 bg-red-50 hover:bg-red-100 rounded-md transition"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Trạng thái hạn HĐBT theo ngày hết hạn
function hdbtStatus(dateStr: string | null) {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp = new Date(dateStr); exp.setHours(0, 0, 0, 0)
  const days = Math.round((exp.getTime() - today.getTime()) / 86400000)
  const label = `${String(exp.getDate()).padStart(2, '0')}/${String(exp.getMonth() + 1).padStart(2, '0')}/${exp.getFullYear()}`
  if (days < 0) return { label, cls: 'bg-red-50 text-red-700 border-red-200', note: 'Đã hết hạn' }
  if (days <= 30) return { label, cls: 'bg-amber-50 text-amber-700 border-amber-200', note: `Còn ${days} ngày` }
  return { label, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', note: 'Còn hạn' }
}

function CustomerListTool({ customers, loaiHdOptions, hdbtCanhBaoThang, onUpdateSuccess, showNotification }: { customers: any[], loaiHdOptions: string[], hdbtCanhBaoThang: number, onUpdateSuccess: () => void, showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [search, setSearch] = useState("")
  const [hdFilter, setHdFilter] = useState("all")
  const [filterOpen, setFilterOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const [highlightCust, setHighlightCust] = useState("")

  // Trùng mã máy: mã máy đang sửa đã có ở khách khác
  const dupCust = editing && (editing.ma_may || "").trim()
    ? customers.find(c => c.ma_may && c.id !== editing.id && c.ma_may.toLowerCase() === editing.ma_may.trim().toLowerCase())
    : undefined

  const filterLabel = hdFilter === 'all' ? 'Tất cả'
    : hdFilter === 'has' ? 'Có hợp đồng'
    : hdFilter === 'expiring' ? `Sắp hết hạn (${hdbtCanhBaoThang} tháng)`
    : hdFilter === 'expired' ? 'Đã hết hạn'
    : hdFilter.startsWith('hd:') ? hdFilter.slice(3)
    : 'Tất cả'
  const selectFilter = (v: string) => { setHdFilter(v); setFilterOpen(false) }

  const q = search.trim().toLowerCase()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const limit = new Date(today); limit.setMonth(limit.getMonth() + hdbtCanhBaoThang)

  const filtered = customers.filter(c => {
    if (q && !(
      (c.ten_khach_hang || "").toLowerCase().includes(q) ||
      (c.ma_may || "").toLowerCase().includes(q) ||
      (c.dia_chi || "").toLowerCase().includes(q) ||
      (c.model || "").toLowerCase().includes(q) ||
      (c.loai_hd || "").toLowerCase().includes(q)
    )) return false
    if (hdFilter === 'all') return true
    if (hdFilter === 'has') return c.loai_hd === 'HĐBT' || c.loai_hd === 'MF'
    if (hdFilter.startsWith('hd:')) return c.loai_hd === hdFilter.slice(3)
    const exp = c.ngay_het_han_hdbt ? new Date(c.ngay_het_han_hdbt) : null
    if (hdFilter === 'expiring') return exp !== null && exp >= today && exp <= limit
    if (hdFilter === 'expired') return exp !== null && exp < today
    return true
  })

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/khach-hang', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          ten_khach_hang: editing.ten_khach_hang,
          ma_may: editing.ma_may,
          dia_chi: editing.dia_chi,
          model: editing.model,
          km_mac_dinh: editing.km_mac_dinh,
          loai_hd: editing.loai_hd,
          ngay_het_han_hdbt: editing.ngay_het_han_hdbt,
        })
      })
      if (res.ok) { showNotification('success', "Đã cập nhật khách hàng."); setEditing(null); onUpdateSuccess() }
      else { const err = await res.json(); showNotification('error', err.error) }
    } catch { showNotification('error', "Lỗi kết nối!") }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Tìm mã máy, tên KH, địa chỉ, model, HĐ..." className="pl-9 bg-white" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="relative shrink-0">
            <button type="button" onClick={() => setFilterOpen(o => !o)} className="h-10 px-3 rounded-md border border-slate-200 text-sm bg-white flex items-center gap-2 min-w-[13rem] justify-between hover:border-slate-300">
              <span className="truncate">{filterLabel}</span>
              <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {filterOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setFilterOpen(false)} />
                <div className="absolute z-40 mt-1 w-56 bg-white border border-slate-200 rounded-md shadow-lg py-1 text-sm">
                  <button type="button" onClick={() => selectFilter('all')} className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 ${hdFilter === 'all' ? 'text-blue-700 font-medium' : 'text-slate-700'}`}>Tất cả</button>
                  <button type="button" onClick={() => selectFilter('has')} className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 ${hdFilter === 'has' ? 'text-blue-700 font-medium' : 'text-slate-700'}`}>Có hợp đồng</button>
                  <button type="button" onClick={() => selectFilter('expiring')} className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 ${hdFilter === 'expiring' ? 'text-blue-700 font-medium' : 'text-slate-700'}`}>Sắp hết hạn ({hdbtCanhBaoThang} tháng)</button>
                  <button type="button" onClick={() => selectFilter('expired')} className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 ${hdFilter === 'expired' ? 'text-blue-700 font-medium' : 'text-slate-700'}`}>Đã hết hạn</button>
                  {loaiHdOptions.length > 0 && (
                    <div className="relative group border-t border-slate-100 mt-1 pt-1">
                      <div className="flex items-center justify-between px-3 py-1.5 text-slate-700 hover:bg-slate-50 cursor-default">
                        <span>Theo loại hợp đồng</span>
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                      </div>
                      <div className="hidden group-hover:block absolute left-full top-0 -mt-1 w-44 bg-white border border-slate-200 rounded-md shadow-lg py-1">
                        {loaiHdOptions.map(v => (
                          <button type="button" key={v} onClick={() => selectFilter(`hd:${v}`)} className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 ${hdFilter === `hd:${v}` ? 'text-blue-700 font-medium' : 'text-slate-700'}`}>{v}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500 whitespace-nowrap">
            {(q || hdFilter !== 'all') ? `${filtered.length} / ${customers.length}` : `Tổng: ${customers.length}`} khách hàng
          </span>
          <ClearAllButton count={customers.length} label="khách hàng" onConfirm={async () => {
            const res = await fetch('/api/admin/khach-hang?all=1', { method: 'DELETE' })
            if (res.ok) { showNotification('success', 'Đã xóa toàn bộ khách hàng.'); onUpdateSuccess() } else showNotification('error', 'Xóa không thành công')
          }} />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden max-h-[500px] overflow-y-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 shadow-sm z-10">
            <tr>
              <th className="px-4 py-3 font-semibold">Mã máy</th>
              <th className="px-4 py-3 font-semibold">Tên khách hàng</th>
              <th className="px-4 py-3 font-semibold">Model</th>
              <th className="px-4 py-3 font-semibold text-center">KM</th>
              <th className="px-4 py-3 font-semibold text-center">Loại HĐ</th>
              <th className="px-4 py-3 font-semibold text-center">Hết hạn HĐBT</th>
              <th className="px-4 py-3 font-semibold text-center w-16">Sửa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {customers.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Chưa có khách hàng nào. Nhập dữ liệu ở mục bên dưới.</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Không tìm thấy khách hàng khớp từ khóa.</td></tr>
            ) : filtered.map((c) => {
              const hd = hdbtStatus(c.ngay_het_han_hdbt)
              return (
                <tr key={c.id} id={'kh-' + c.id} className={`transition-colors ${highlightCust === c.id ? 'bg-amber-100' : 'hover:bg-slate-50'}`}>
                  <td className="px-4 py-3 font-mono font-medium text-slate-700">{c.ma_may || <span className="text-slate-400 italic">—</span>}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{c.ten_khach_hang}<div className="text-xs text-slate-400 font-normal truncate max-w-xs" title={c.dia_chi}>{c.dia_chi}</div></td>
                  <td className="px-4 py-3">{c.model || <span className="text-slate-400 italic">—</span>}</td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">{c.km_mac_dinh != null ? `${Number(c.km_mac_dinh).toLocaleString('vi-VN')}` : '—'}</td>
                  <td className="px-4 py-3 text-center">{c.loai_hd || <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    {hd ? <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${hd.cls}`} title={hd.note}>{hd.label}</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setEditing({ ...c, ngay_het_han_hdbt: c.ngay_het_han_hdbt || "" })} className="text-blue-500 hover:text-blue-700 p-1.5 bg-blue-50 hover:bg-blue-100 rounded-md transition"><PenSquare className="w-4 h-4" /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal sửa khách hàng */}
      {editing && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">Sửa khách hàng</h3>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-semibold text-slate-600">Tên khách hàng</label>
                <Input value={editing.ten_khach_hang || ""} onChange={(e) => setEditing({ ...editing, ten_khach_hang: e.target.value })} className="bg-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Mã máy</label>
                <Input value={editing.ma_may || ""} onChange={(e) => setEditing({ ...editing, ma_may: e.target.value })} className={`bg-white ${dupCust ? 'border-amber-400 focus:ring-amber-400' : ''}`} />
                {dupCust && (
                  <div className="text-xs text-amber-600 flex items-center gap-1 flex-wrap">
                    ⚠ Trùng mã của: {dupCust.ten_khach_hang}.
                    <button type="button" onClick={() => { setEditing(null); setHighlightCust(dupCust.id); setTimeout(() => document.getElementById('kh-' + dupCust.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50) }} className="underline font-medium">Xem dòng</button>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Model</label>
                <Input value={editing.model || ""} onChange={(e) => setEditing({ ...editing, model: e.target.value })} className="bg-white" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-semibold text-slate-600">Địa chỉ</label>
                <Input value={editing.dia_chi || ""} onChange={(e) => setEditing({ ...editing, dia_chi: e.target.value })} className="bg-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Khoảng cách (km)</label>
                <Input type="number" step="0.1" value={editing.km_mac_dinh ?? ""} onChange={(e) => setEditing({ ...editing, km_mac_dinh: e.target.value })} className="bg-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Loại hợp đồng</label>
                <select className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white" value={editing.loai_hd || ""} onChange={(e) => setEditing({ ...editing, loai_hd: e.target.value })}>
                  <option value="">— Không —</option>
                  {loaiHdOptions.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-semibold text-slate-600">Ngày hết hạn HĐBT</label>
                <DateField value={editing.ngay_het_han_hdbt || ""} onChange={(v) => setEditing({ ...editing, ngay_het_han_hdbt: v })} />
              </div>
            </div>
            <div className="bg-slate-50 p-4 flex justify-end gap-2 border-t border-slate-100">
              <Button variant="outline" onClick={() => setEditing(null)}>Hủy</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "Đang lưu..." : "Lưu"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BulkImportInventoryTool({ onImportSuccess, showNotification }: BulkImportToolProps) {
  const [text, setText] = useState("")
  const [records, setRecords] = useState<any[]>([])
  const [importing, setImporting] = useState(false)

  const handleParse = () => {
    if (!text.trim()) return showNotification('error', "Vui lòng nhập dữ liệu để phân tích")

    const lines = text.split("\n")
    const parsed: any[] = []

    for (let line of lines) {
      const cleanLine = line.trim()
      if (!cleanLine) continue

      if (cleanLine.includes("\t")) {
        // Định dạng Excel (Tab separated)
        const cols = cleanLine.split("\t")

        // Bỏ qua dòng tiêu đề nếu người dùng copy cả tiêu đề
        if (cols[0]?.toLowerCase().includes("mã hàng") || cols[1]?.toLowerCase().includes("vật tư")) {
          continue
        }

        const ma_hang = cols[0]?.trim().toUpperCase() || ""
        const ten_hang = cols[1]?.trim() || ""
        const model = cols[2]?.trim() || ""
        const ton_kho_raw = cols[3]?.trim() || "0"

        if (ma_hang && ten_hang) {
          parsed.push({
            ma_hang,
            ten_hang,
            model,
            hang: "",
            ton_kho: parseInt(ton_kho_raw) || 0
          })
        }
      } else {
        // Định dạng thô cho vật tư chưa hỗ trợ regex
      }
    }

    if (parsed.length === 0) {
      showNotification('error', "Không tìm thấy dòng dữ liệu nào đúng định dạng. Đảm bảo copy Excel đúng 4 cột: Mã hàng | Tên vật tư | Model | Tồn kho.")
    } else {
      setRecords(parsed)
    }
  }

  const handleSave = async () => {
    if (records.length === 0) return
    setImporting(true)

    try {
      const res = await fetch("/api/admin/kho-hang/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: records })
      })

      if (res.ok) {
        const data = await res.json()
        showNotification('success', `Đã lưu thành công ${data.count} vật tư vào cơ sở dữ liệu!`)
        setText("")
        setRecords([])
        onImportSuccess()
      } else {
        const err = await res.json()
        showNotification('error', "Lỗi khi import: " + err.error)
      }
    } catch (error) {
      console.error(error)
      showNotification('error', "Lỗi kết nối khi import dữ liệu")
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <textarea
          rows={6}
          className="w-full p-3 rounded-md border border-slate-200 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="Dán dữ liệu Excel (gồm các cột Mã hàng, Tên vật tư, Model, Tồn kho) vào đây..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        ></textarea>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleParse} variant="outline">
          Phân tích dữ liệu ({text.split("\n").filter(l => l.trim()).length} dòng)
        </Button>
        {records.length > 0 && (
          <Button onClick={handleSave} disabled={importing} className="bg-emerald-600 hover:bg-emerald-700">
            {importing ? "Đang lưu..." : `Xác nhận nạp ${records.length} vật tư vào CSDL`}
          </Button>
        )}
      </div>

      {records.length > 0 && (
        <div className="border border-slate-200 rounded-lg overflow-hidden max-h-80 overflow-y-auto mt-4">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100 text-slate-600 font-medium sticky top-0 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2">Mã hàng</th>
                <th className="px-3 py-2">Tên vật tư</th>
                <th className="px-3 py-2">Model máy</th>
                <th className="px-3 py-2 text-center">Tồn kho</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((rec, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono font-medium">{rec.ma_hang}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">{rec.ten_hang}</td>
                  <td className="px-3 py-2">{rec.model}</td>
                  <td className="px-3 py-2 text-center font-bold text-emerald-600">{rec.ton_kho}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function BulkImportTool({ onImportSuccess, showNotification }: BulkImportToolProps) {
  const [text, setText] = useState("")
  const [records, setRecords] = useState<any[]>([])
  const [importing, setImporting] = useState(false)

  const handleParse = () => {
    if (!text.trim()) return showNotification('error', "Vui lòng nhập dữ liệu để phân tích")

    const lines = text.split("\n")
    const parsed: any[] = []

    for (let line of lines) {
      const cleanLine = line.trim()
      if (!cleanLine) continue

      if (cleanLine.includes("\t")) {
        // Định dạng Excel (Tab separated): TT | Mã máy | Tên KH | Địa chỉ | Model | km
        const cols = cleanLine.split("\t")

        // Bỏ qua dòng tiêu đề nếu người dùng copy cả tiêu đề
        if (cols[1]?.toLowerCase().includes("mã máy") || cols[2]?.toLowerCase().includes("khách")) {
          continue
        }

        const ma_may = cols[1]?.trim() || ""
        const ten_khach_hang = cols[2]?.trim() || ""
        const dia_chi = cols[3]?.trim() || ""
        const model = cols[4]?.trim() || ""
        const km_raw = cols[5]?.trim() || "0"

        if (ma_may && ten_khach_hang && dia_chi) {
          parsed.push({
            ma_may,
            ten_khach_hang,
            dia_chi,
            model,
            km_mac_dinh: parseFloat(km_raw) || 0
          })
        }
      } else {
        // Định dạng thô: "<mã khách> _<Tên KH> #<Địa chỉ> @<Model> !<km>"
        // km (phần sau dấu !) là tùy chọn.
        const match = cleanLine.match(/^(.*?)_(.+?)#(.+?)@(.+?)(?:\s*!\s*([\d.]+))?\s*$/)
        if (match) {
          parsed.push({
            ma_may: match[1]?.trim() || "",
            ten_khach_hang: match[2]?.trim() || "",
            dia_chi: match[3]?.trim() || "",
            model: match[4]?.trim() || "",
            km_mac_dinh: match[5] ? (parseFloat(match[5]) || 0) : 0
          })
        }
      }
    }

    if (parsed.length === 0) {
      showNotification('error', "Không tìm thấy dòng dữ liệu nào đúng định dạng. Vui lòng kiểm tra lại.")
    } else {
      setRecords(parsed)
    }
  }

  const handleSave = async () => {
    if (records.length === 0) return
    setImporting(true)

    try {
      const res = await fetch("/api/admin/khach-hang/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customers: records })
      })

      if (res.ok) {
        const data = await res.json()
        showNotification('success', `Đã lưu thành công ${data.count} khách hàng vào cơ sở dữ liệu!`)
        setText("")
        setRecords([])
        onImportSuccess()
      } else {
        const err = await res.json()
        showNotification('error', "Lỗi khi import: " + err.error)
      }
    } catch (error) {
      console.error(error)
      showNotification('error', "Lỗi kết nối khi import dữ liệu")
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <textarea
          rows={8}
          className="w-full p-3 rounded-md border border-slate-200 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="Dán dữ liệu Excel (gồm các cột) hoặc Danh sách thô vào đây..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        ></textarea>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleParse} variant="outline">
          Phân tích dữ liệu ({text.split("\n").filter(l => l.trim()).length} dòng)
        </Button>
        {records.length > 0 && (
          <Button onClick={handleSave} disabled={importing} className="bg-emerald-600 hover:bg-emerald-700">
            {importing ? "Đang lưu..." : `Xác nhận lưu ${records.length} bản ghi vào CSDL`}
          </Button>
        )}
      </div>

      {records.length > 0 && (
        <div className="border border-slate-200 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100 text-slate-600 font-medium sticky top-0 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2">Mã máy</th>
                <th className="px-3 py-2">Khách hàng</th>
                <th className="px-3 py-2">Địa chỉ</th>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2 text-center">KM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((rec, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono">{rec.ma_may}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">{rec.ten_khach_hang}</td>
                  <td className="px-3 py-2">{rec.dia_chi}</td>
                  <td className="px-3 py-2">{rec.model}</td>
                  <td className="px-3 py-2 text-center">{rec.km_mac_dinh} km</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

