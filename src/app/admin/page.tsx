"use client"

import { useState, useEffect } from "react"
import { Plus, Search, Trash2, MapPin, RefreshCw, PenSquare, QrCode, Power } from "lucide-react"
import QRCodeLib from "qrcode"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// Types
type Job = {
  id: string
  ngay: string
  ma_may: string
  loai_cong_viec: string
  km: number
  ket_qua: string
  ghi_chu: string
  report?: string
  so_tien: number
  loai_thanh_toan: string
  soct_khach_hang: { ten_khach_hang: string; dia_chi: string; km_mac_dinh: number }
  soct_users: { full_name: string } | null
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
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  // States for Add Job Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [customers, setCustomers] = useState<any[]>([])
  const [technicians, setTechnicians] = useState<any[]>([])
  const [inventory, setInventory] = useState<any[]>([]) // Thêm state inventory

  const [formData, setFormData] = useState({
    ngay: new Date().toISOString().split('T')[0], // Mặc định ngày hôm nay
    ma_may: "",
    id_khach_hang: "",
    loai_cong_viec: "Kiểm tra",
    km: 0,
    ktv_id: "",
    report: "",
    so_tien: 0,
    loai_thanh_toan: "Hóa đơn", // Hóa đơn hoặc Chưa hóa đơn
    ghi_chu: "",
    vat_tu: [] as {ma_hang: string, so_luong: string}[],
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
      so_tien: 0,
      loai_thanh_toan: "Hóa đơn",
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
      const [jobsRes, customersRes, usersRes, inventoryRes] = await Promise.all([
        fetch('/api/admin/cong-viec'),
        fetch('/api/admin/khach-hang'),
        fetch('/api/admin/users'),
        fetch('/api/admin/kho-hang')
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

      if (jobsData.data) setJobs(jobsData.data)
      if (customersData.data) setCustomers(customersData.data)
      if (usersData.data) setTechnicians(usersData.data)
      if (inventoryData.data) setInventory(inventoryData.data)
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

  // Xử lý thêm vật tư
  const handleAddVatTu = () => {
    setFormData(prev => ({
      ...prev,
      vat_tu: [...prev.vat_tu, { ma_hang: "", so_luong: "1" }]
    }))
  }

  const handleUpdateVatTu = (index: number, field: 'ma_hang' | 'so_luong', value: string) => {
    const newVatTu = [...formData.vat_tu]
    newVatTu[index][field] = value
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
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200 gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
            </div>
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

        {activeTab === "cong_viec" && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Toolbar */}
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input placeholder="Tìm mã máy, tên khách hàng..." className="pl-9 bg-white" />
              </div>
              {/* Tất cả role văn phòng (admin, tech_admin, staff) đều được giao việc cho KTV */}
              <Button onClick={() => setIsModalOpen(true)} className="w-full sm:w-auto gap-2">
                <Plus className="w-4 h-4" /> Giao việc mới
              </Button>
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
                  ) : jobs.length === 0 ? (
                    <tr><td colSpan={currentUserRole === 'staff' ? 8 : 9} className="text-center py-8 text-slate-400">Chưa có công việc nào</td></tr>
                  ) : (
                    jobs.map((job) => (
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
                          {job.so_tien > 0 && (
                            <div className={job.loai_thanh_toan === 'Hóa đơn' ? 'text-emerald-600' : 'text-amber-600'}>
                              {job.loai_thanh_toan}: {job.so_tien.toLocaleString('vi-VN')}
                            </div>
                          )}
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
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-6 space-y-6">
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
          </div>
        )}
        {activeTab === "he_thong" && currentUserRole === 'admin' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
            <h2 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">Cài đặt Hệ thống</h2>

            <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50">
              <h3 className="text-lg font-semibold text-slate-700 mb-2">Quản lý Tài khoản (KTV & Nhân viên)</h3>
              <p className="text-sm text-slate-500 mb-6">Thêm mới, cập nhật tên đăng nhập và mật khẩu cho Kỹ thuật viên.</p>
              <UserManagementTool users={technicians} onUpdateSuccess={fetchData} showNotification={showNotification} confirmDelete={confirmDelete} />
            </div>

            <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50">
              <h3 className="text-lg font-semibold text-slate-700 mb-2">Nhập dữ liệu Khách Hàng (Bulk Import)</h3>
              <p className="text-sm text-slate-500 mb-6">
                Hỗ trợ 2 định dạng copy-paste:<br/>
                - <b>Copy từ Excel (Tab-separated):</b> Cột thứ tự TT | Mã máy | Mã máy 2026 | Máy Khách hàng | Khách hàng | Địa chỉ | Model | Share | km ...<br/>
                - <b>Danh sách Text thô:</b> VD: <code>158 _Ban Nội chính TW #Tòa 4A... @Apeos 7580</code>
              </p>

              <BulkImportTool onImportSuccess={fetchData} showNotification={showNotification} />
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-slate-800">Giao công việc mới</h2>
              <button onClick={closeAndResetModal} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <form onSubmit={handleCreateJob} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Dòng 1: Ngày & Kỹ thuật viên */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Ngày</label>
                  <div className="relative w-full">
                    {/* Ô hiển thị Text định dạng DD/MM/YYYY */}
                    <div className="flex h-10 w-full items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 font-mono">
                      {formatDate(formData.ngay) || "Chọn ngày"}
                      <svg className="w-4 h-4 ml-auto text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    {/* Ô Input date thực tế nằm đè lên nhưng ẩn đi (opacity-0) */}
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
                    {technicians.map(t => (
                      <option key={t.id} value={t.id}>{t.full_name}</option>
                    ))}
                  </select>
                </div>

                {/* Dòng 2: Mã máy & Khách hàng */}
                <div className="space-y-2 flex flex-col justify-start">
                  <label className="text-sm font-medium text-slate-700">Mã máy <span className="text-amber-500 font-normal text-xs italic ml-1">(Gõ mã để điền tự động KH)</span></label>
                  <Input
                    placeholder="Nhập mã máy (VD: 35953)"
                    value={formData.ma_may}
                    onChange={(e) => handleMaMayChange(e.target.value)}
                  />
                  {/* Căn chỉnh khoảng trắng với Khách hàng nếu chưa có model */}
                  {formData.id_khach_hang && formData.id_khach_hang !== "NEW" && customers.find(c => c.id === formData.id_khach_hang)?.model ? (
                    <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1.5 rounded border border-blue-100 font-medium w-max mt-2">
                      Model: <span className="font-semibold">{customers.find(c => c.id === formData.id_khach_hang)?.model}</span>
                    </div>
                  ) : <div className="h-[28px] mt-2 hidden md:block"></div>}
                </div>

                <div className="space-y-2 flex flex-col justify-start">
                  <label className="text-sm font-medium text-slate-700">Khách hàng <span className="text-red-500">*</span></label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    value={formData.id_khach_hang}
                    onChange={(e) => setFormData({...formData, id_khach_hang: e.target.value})}
                    required
                  >
                    <option value="">-- Chọn khách hàng --</option>
                    <option value="NEW" className="font-semibold text-blue-600">+ Tạo khách hàng (máy) mới</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.ten_khach_hang}</option>
                    ))}
                  </select>
                  {/* Căn chỉnh khoảng trắng với Mã máy nếu chưa có địa chỉ */}
                  {formData.id_khach_hang && formData.id_khach_hang !== "NEW" && customers.find(c => c.id === formData.id_khach_hang)?.dia_chi ? (
                    <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1.5 rounded border border-blue-100 font-medium truncate w-full mt-2" title={customers.find(c => c.id === formData.id_khach_hang)?.dia_chi}>
                      Địa chỉ: <span className="font-semibold">{customers.find(c => c.id === formData.id_khach_hang)?.dia_chi}</span>
                    </div>
                  ) : <div className="h-[28px] mt-2 hidden md:block"></div>}
                </div>

                {/* Phần thêm mới khách hàng/máy */}
                {formData.id_khach_hang === "NEW" && (
                  <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 bg-blue-50/50 p-4 rounded-lg border border-blue-100">
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

                {/* Dòng 3: Loại công việc & Khoảng cách */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Loại công việc <span className="text-red-500">*</span></label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    value={formData.loai_cong_viec}
                    onChange={(e) => setFormData({...formData, loai_cong_viec: e.target.value})}
                  >
                    <option>Lắp máy</option>
                    <option>Sửa máy</option>
                    <option>Giao mực</option>
                    <option>Thay vật tư</option>
                    <option>Bảo trì</option>
                    <option>Bảo hành</option>
                    <option>Hỗ trợ thầu</option>
                    <option>Hỗ trợ đại lý</option>
                    <option>Khiếu nại</option>
                    <option>Kiểm tra</option>
                    <option>Khác</option>
                  </select>
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
                      return (
                        <div key={index} className="bg-slate-50 p-3 rounded-md border border-slate-100 space-y-2">
                          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                            <div className="flex-1 w-full">
                              <label className="text-xs font-medium text-slate-500 mb-1 block">Mã hàng hóa (Kho)</label>
                              <select
                                className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                value={vt.ma_hang}
                                onChange={(e) => handleUpdateVatTu(index, 'ma_hang', e.target.value)}
                                required
                              >
                                <option value="">-- Chọn mã vật tư --</option>
                                {inventory.map(item => (
                                  <option key={item.ma_hang} value={item.ma_hang}>
                                    {item.ma_hang} - {item.ten_hang}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="w-full sm:w-24">
                              <label className="text-xs font-medium text-slate-500 mb-1 block">Số lượng</label>
                              <Input
                                type="number"
                                min="1"
                                className="h-9 bg-white"
                                value={vt.so_luong}
                                onChange={(e) => handleUpdateVatTu(index, 'so_luong', e.target.value)}
                                required
                              />
                            </div>

                            <div className="w-full sm:w-auto flex justify-end mt-4 sm:mt-0 pt-5">
                              <button type="button" onClick={() => handleRemoveVatTu(index)} className="text-slate-400 hover:text-red-500 p-2">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Dòng thông tin tồn kho và model phụ đặt ở dưới, cân bằng toàn bộ hàng */}
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
              </div>

              {/* Thông tin đối chiếu tài chính */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Số phiếu (Report)</label>
                  <Input
                    placeholder="VD: RP-2026-001"
                    value={formData.report}
                    onChange={(e) => setFormData({...formData, report: e.target.value})}
                  />
                </div>
                <div className="space-y-2 relative">
                  <label className="text-sm font-medium text-slate-700">Số tiền</label>
                  {/* Fake input formatted cho đẹp */}
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Nhập số tiền"
                      value={formData.so_tien === 0 ? '' : formData.so_tien.toLocaleString('vi-VN')}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\./g, '')
                        setFormData({...formData, so_tien: parseFloat(val) || 0})
                      }}
                      className="pr-8"
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 text-sm">
                      đ
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Loại thanh toán</label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    value={formData.loai_thanh_toan}
                    onChange={(e) => setFormData({...formData, loai_thanh_toan: e.target.value})}
                  >
                    <option value="Hóa đơn">Hóa đơn</option>
                    <option value="Chưa hóa đơn">Chưa hóa đơn</option>
                  </select>
                </div>
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
      <form onSubmit={handleSave} className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="space-y-1 lg:col-span-1">
          <label className="text-xs font-semibold text-slate-600">Mã hàng *</label>
          <Input required value={formData.ma_hang} onChange={(e) => setFormData({...formData, ma_hang: e.target.value.toUpperCase()})} disabled={isEditing} placeholder="VD: DR017" className="bg-white" />
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
              <tr key={item.ma_hang} className="hover:bg-slate-50 transition-colors">
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
        // Định dạng Excel (Tab separated)
        const cols = cleanLine.split("\t")

        // Bỏ qua dòng tiêu đề nếu người dùng copy cả tiêu đề
        if (cols[1]?.toLowerCase().includes("mã máy") || cols[4]?.toLowerCase().includes("khách hàng")) {
          continue
        }

        const ma_may = cols[1]?.trim() || ""
        const ten_khach_hang = cols[4]?.trim() || ""
        const dia_chi = cols[5]?.trim() || ""
        const model = cols[6]?.trim() || ""
        const km_raw = cols[8]?.trim() || "0"

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
        // Định dạng thô: "Mã_máy _Khách hàng #Địa chỉ @Model"
        // Regex: (ma_may) _(khach_hang) #(dia_chi) @(model)
        const match = cleanLine.match(/^(\S+)?\s*_(.+?)\s*#(.+?)\s*@(.+)$/)
        if (match) {
          parsed.push({
            ma_may: match[1]?.trim() || "",
            ten_khach_hang: match[2]?.trim() || "",
            dia_chi: match[3]?.trim() || "",
            model: match[4]?.trim() || "",
            km_mac_dinh: 0 // Thô không có KM, mặc định 0
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

