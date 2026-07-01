"use client"

import { useState, useEffect } from "react"
import { Plus, Search, Trash2, MapPin, RefreshCw, PenSquare } from "lucide-react"
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
  hoa_don: number
  chua_hoa_don: number
  soct_khach_hang: { ten_khach_hang: string; dia_chi: string; km_mac_dinh: number }
  soct_users: { full_name: string } | null
}

export default function AdminDashboard() {
  // Notification State
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  // Custom Confirm Dialog State
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, jobId: "", message: "" })

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 5000)
  }

  // Role giả lập (Mock Auth)
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'tech_admin' | 'staff'>('admin')

  const [activeTab, setActiveTab] = useState("cong_viec")
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  // States for Add Job Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [customers, setCustomers] = useState<any[]>([])
  const [technicians, setTechnicians] = useState<any[]>([])
  const [inventory, setInventory] = useState<any[]>([]) // Thêm state inventory

  const [formData, setFormData] = useState({
    ma_may: "",
    id_khach_hang: "",
    loai_cong_viec: "Kiểm tra",
    km: 0,
    ktv_id: "",
    report: "",
    hoa_don: 0,
    chua_hoa_don: 0,
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
      ma_may: "",
      id_khach_hang: "",
      loai_cong_viec: "Kiểm tra",
      km: 0,
      ktv_id: "",
      report: "",
      hoa_don: 0,
      chua_hoa_don: 0,
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

  useEffect(() => {
    fetchData()
  }, [])

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

  const confirmDelete = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      jobId: id,
      message: "Bạn có chắc chắn muốn xóa công việc này khỏi sổ công tác không?"
    })
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/cong-viec?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        showNotification('success', "Đã xóa công việc thành công.")
        fetchData()
      } else {
        showNotification('error', "Xóa công việc không thành công.")
      }
    } catch (error) {
      console.error(error)
      showNotification('error', "Lỗi kết nối khi xóa công việc.")
    } finally {
      setConfirmDialog({ isOpen: false, jobId: "", message: "" })
    }
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
              <p className="text-xs text-slate-400">Quyền: <span className="font-bold text-slate-600 uppercase">{currentUserRole}</span></p>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {/* Mock Role Switcher */}
            <div className="flex items-center gap-2 text-xs bg-slate-100 p-2 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-600">Simulate Role:</span>
              <select
                value={currentUserRole}
                onChange={(e) => {
                  const newRole = e.target.value as 'admin' | 'tech_admin' | 'staff'
                  setCurrentUserRole(newRole)
                  if (newRole === 'staff') setActiveTab("cong_viec")
                }}
                className="bg-white border rounded px-1.5 py-0.5 text-slate-700 outline-none font-medium"
              >
                <option value="admin">Admin (Full)</option>
                <option value="tech_admin">Tech Admin (No System)</option>
                <option value="staff">Staff (Sổ công tác only)</option>
              </select>
            </div>

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
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loading ? (
                    <tr><td colSpan={9} className="text-center py-8 text-slate-400">Đang tải dữ liệu...</td></tr>
                  ) : jobs.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-8 text-slate-400">Chưa có công việc nào</td></tr>
                  ) : (
                    jobs.map((job) => (
                      <tr key={job.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-3 whitespace-nowrap">{new Date(job.ngay).toLocaleDateString('vi-VN')}</td>
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
                          {job.km} km
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {job.report && <div className="text-slate-700">Phiếu: {job.report}</div>}
                          {job.hoa_don > 0 && <div className="text-emerald-600">Đã HĐ: {job.hoa_don.toLocaleString('vi-VN')}</div>}
                          {job.chua_hoa_don > 0 && <div className="text-amber-600">Chưa HĐ: {job.chua_hoa_don.toLocaleString('vi-VN')}</div>}
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
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => confirmDelete(job.id)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "kho_hang" && (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-700 mb-2">Tính năng Kho Hàng đang phát triển</h2>
            <p className="text-slate-500 max-w-md mx-auto">Module quản lý tồn kho, đặt hàng và phê duyệt nhập/xuất vật tư sẽ được cập nhật trong phiên bản tiếp theo.</p>
          </div>
        )}
        {activeTab === "he_thong" && currentUserRole === 'admin' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
            <h2 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">Cài đặt Hệ thống</h2>

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
              <Button variant="outline" onClick={() => setConfirmDialog({ isOpen: false, jobId: "", message: "" })}>Hủy bỏ</Button>
              <Button variant="destructive" onClick={() => handleDelete(confirmDialog.jobId)}>Xác nhận xóa</Button>
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

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Mã máy <span className="text-amber-500 font-normal text-xs italic ml-1">(Gõ mã để điền tự động KH)</span></label>
                  <Input
                    placeholder="Nhập mã máy (VD: 35953)"
                    value={formData.ma_may}
                    onChange={(e) => handleMaMayChange(e.target.value)}
                  />
                  {formData.id_khach_hang && formData.id_khach_hang !== "NEW" && customers.find(c => c.id === formData.id_khach_hang)?.model && (
                     <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block mt-1">
                       Model: <span className="font-semibold">{customers.find(c => c.id === formData.id_khach_hang)?.model}</span>
                     </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Khách hàng <span className="text-red-500">*</span></label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.id_khach_hang}
                    onChange={(e) => setFormData({...formData, id_khach_hang: e.target.value})}
                    required
                  >
                    <option value="">-- Chọn khách hàng --</option>
                    <option value="NEW" className="font-semibold text-blue-600">+ Tạo khách hàng (máy) mới</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.ten_khach_hang} ({c.dia_chi})</option>
                    ))}
                  </select>
                </div>

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

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Loại công việc <span className="text-red-500">*</span></label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
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
                  <label className="text-sm font-medium text-slate-700">Kỹ thuật viên</label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.ktv_id}
                    onChange={(e) => setFormData({...formData, ktv_id: e.target.value})}
                  >
                    <option value="">-- Chưa giao KTV --</option>
                    {technicians.map(t => (
                      <option key={t.id} value={t.id}>{t.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 flex flex-col md:flex-row gap-6 items-start md:items-center">
                <div className="flex items-center gap-2 flex-1 w-full">
                  <label className="text-sm font-medium text-slate-700 whitespace-nowrap">Khoảng cách (KM):</label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    className="w-full md:w-32 bg-white"
                    value={formData.km}
                    onChange={(e) => setFormData({...formData, km: parseFloat(e.target.value) || 0})}
                  />
                  {formData.id_khach_hang && customers.find(c => c.id === formData.id_khach_hang)?.km_mac_dinh === null && (
                    <span className="text-xs text-amber-600 italic">Hệ thống sẽ tự tính tọa độ & KM khi lưu</span>
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
                        <div key={index} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center bg-slate-50 p-3 rounded-md border border-slate-100">
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
                            {selectedItem && (
                              <div className="text-xs mt-1 text-slate-600">
                                Tồn kho: <span className={`font-semibold ${selectedItem.ton_kho <= 0 ? 'text-red-500' : 'text-emerald-600'}`}>{selectedItem.ton_kho}</span> | Model: {selectedItem.model || 'N/A'}
                              </div>
                            )}
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

                          <div className="w-full sm:w-auto flex justify-end mt-4 sm:mt-0">
                            <button type="button" onClick={() => handleRemoveVatTu(index)} className="text-slate-400 hover:text-red-500 p-2">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
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
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Hóa đơn (Số tiền)</label>
                  <Input
                    type="number"
                    placeholder="Đã xuất hóa đơn"
                    value={formData.hoa_don}
                    onChange={(e) => setFormData({...formData, hoa_don: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Chưa hóa đơn (Số tiền)</label>
                  <Input
                    type="number"
                    placeholder="Chưa xuất hóa đơn"
                    value={formData.chua_hoa_don}
                    onChange={(e) => setFormData({...formData, chua_hoa_don: parseFloat(e.target.value) || 0})}
                  />
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

