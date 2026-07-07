"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { Plus, Search, Trash2, MapPin, RefreshCw, PenSquare, QrCode, Power, Download, ClipboardList, CheckCircle2, Clock, Wallet, Package, ShoppingCart, AlertTriangle, Users, Wrench, ClipboardCheck, Boxes, Upload, SlidersHorizontal, ChevronLeft, ChevronRight } from "lucide-react"
import QRCodeLib from "qrcode"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TAB_TREE, TAB_ROLES, DEFAULT_TAB_VIS } from "@/lib/tabs"
import { supabase } from "@/lib/supabase"

// Kênh realtime (đồng bộ với lib/realtime.ts + app KTV): server phát broadcast sau mỗi thay đổi việc
const JOBS_TOPIC = "soct_jobs"
const JOBS_EVENT = "changed"

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

// ————————————————————————————————————————————————————————————————
// Phân trang: 20 dòng/trang cho mọi danh sách (tránh cuộn vô tận)
const PAGE_SIZE = 20
function usePaged<T>(items: T[], perPage = PAGE_SIZE) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(items.length / perPage))
  useEffect(() => { setPage(p => Math.min(p, pageCount)) }, [pageCount])
  const pageItems = items.slice((page - 1) * perPage, page * perPage)
  return { page, setPage, pageCount, pageItems, total: items.length, perPage }
}

// Thanh điều hướng trang — chỉ hiện khi có >1 trang
function Pagination({ page, pageCount, total, perPage, onPage }: { page: number, pageCount: number, total: number, perPage: number, onPage: (p: number) => void }) {
  if (pageCount <= 1) return null
  const from = (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)
  // Tính dải số trang gọn gàng quanh trang hiện tại
  const nums: number[] = []
  const push = (n: number) => { if (n >= 1 && n <= pageCount && !nums.includes(n)) nums.push(n) }
  push(1); push(2)
  for (let i = page - 1; i <= page + 1; i++) push(i)
  push(pageCount - 1); push(pageCount)
  nums.sort((a, b) => a - b)
  const btn = "h-8 min-w-8 px-2 rounded-md border text-sm transition"
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap px-1 pt-3 pb-1">
      <span className="text-xs text-slate-500">Hiển thị <b>{from}</b>–<b>{to}</b> / {total.toLocaleString('vi-VN')} dòng</span>
      <div className="flex items-center gap-1">
        <button className={`${btn} border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed`} disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="w-4 h-4" /></button>
        {nums.map((n, i) => (
          <span key={n} className="flex items-center">
            {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-slate-400">…</span>}
            <button className={`${btn} ${n === page ? 'bg-blue-600 border-blue-600 text-white font-semibold' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`} onClick={() => onPage(n)}>{n}</button>
          </span>
        ))}
        <button className={`${btn} border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed`} disabled={page >= pageCount} onClick={() => onPage(page + 1)}><ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  )
}

// ————————————————————————————————————————————————————————————————
// Tùy biến hiển thị cột: mỗi bảng khai báo danh sách cột, cột locked không tắt được.
type ColDef = { key: string, label: string, locked?: boolean }
function useColView(storageKey: string, defs: ColDef[]) {
  const lockedKeys = defs.filter(d => d.locked).map(d => d.key)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  useEffect(() => {
    try {
      const raw = localStorage.getItem('colview:' + storageKey)
      if (raw) setHidden(new Set((JSON.parse(raw) as string[]).filter(k => !lockedKeys.includes(k))))
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])
  const persist = (s: Set<string>) => { try { localStorage.setItem('colview:' + storageKey, JSON.stringify([...s])) } catch { /* ignore */ } }
  const toggle = (k: string) => setHidden(prev => {
    if (lockedKeys.includes(k)) return prev
    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); persist(n); return n
  })
  const reset = () => { setHidden(new Set()); persist(new Set()) }
  const show = (k: string) => !hidden.has(k)
  return { show, toggle, reset, defs }
}

// Nút "Cột" mở menu tick chọn cột hiển thị
function ColumnMenu({ view }: { view: ReturnType<typeof useColView> }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative shrink-0">
      <Button variant="outline" onClick={() => setOpen(o => !o)} className="gap-1.5 h-9 text-sm"><SlidersHorizontal className="w-4 h-4" /> Cột</Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-2 max-h-96 overflow-auto">
            <div className="text-xs font-semibold text-slate-500 px-3 pb-1">Hiển thị cột</div>
            {view.defs.map(d => (
              <label key={d.key} className={`flex items-center gap-2 px-3 py-1.5 text-sm ${d.locked ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700 hover:bg-slate-50 cursor-pointer'}`}>
                <input type="checkbox" checked={view.show(d.key)} disabled={d.locked} onChange={() => view.toggle(d.key)} className="w-4 h-4 accent-blue-600" />
                <span className="flex-1">{d.label}</span>
                {d.locked && <span className="text-[10px] text-slate-400">khóa</span>}
              </label>
            ))}
            <button onClick={view.reset} className="w-full text-left text-xs text-blue-600 hover:underline px-3 pt-1.5">Hiện tất cả</button>
          </div>
        </>
      )}
    </div>
  )
}

const JOBS_COLS: ColDef[] = [
  { key: 'ngay', label: 'Ngày', locked: true },
  { key: 'khach', label: 'Khách hàng', locked: true },
  { key: 'ma_may', label: 'Mã máy' },
  { key: 'loai', label: 'Loại việc' },
  { key: 'ktv', label: 'KTV' },
  { key: 'km', label: 'KM' },
  { key: 'bao_cao', label: 'Báo cáo HĐ' },
  { key: 'trang_thai', label: 'Trạng thái' },
  { key: 'thaotac', label: 'Thao tác', locked: true },
]

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
  const [systemTab, setSystemTab] = useState<"cai_dat" | "tai_khoan" | "khach_hang" | "danh_muc" | "bao_cao" | "audit" | "doi_mat_khau">("tai_khoan")
  // Tab con bên trong "Theo dõi máy"
  const [monitorTab, setMonitorTab] = useState<"bao_tri" | "giam_dinh">("bao_tri")
  // Tab con bên trong "Kho hàng" (tech_admin không thấy Tồn kho -> mặc định Đặt hàng)
  const [khoTab, setKhoTab] = useState<"ton_kho" | "dat_hang" | "thong_ke">("ton_kho")
  const [cauHinh, setCauHinh] = useState<Record<string, string>>({})

  // Ẩn/hiện tab (lớn + con) theo role. Admin thấy hết; Hệ thống khóa admin-only.
  const tabVisCfg: Record<string, Record<string, boolean>> = (() => { try { return JSON.parse(cauHinh.tab_visibility || '{}') } catch { return {} } })()
  const roleVis = (role: string) => ({ ...(DEFAULT_TAB_VIS[role] || {}), ...(tabVisCfg[role] || {}) })
  const tabVisible = (tab: string) => {
    if (currentUserRole === 'admin') return true
    if (tab === 'cong_viec') return true
    if (tab === 'he_thong') return false
    return !!roleVis(currentUserRole)[tab]
  }
  // Tab con: key "cha.con"; mặc định hiện nếu chưa cấu hình riêng
  const subVisible = (parent: string, sub: string) => {
    if (currentUserRole === 'admin') return true
    const v = roleVis(currentUserRole)[`${parent}.${sub}`]
    return v === undefined ? true : !!v
  }
  // Nếu tab con đang chọn bị ẩn -> nhảy về tab con hiện đầu tiên
  const firstVisibleSub = (parent: string, subs: string[], current: string) =>
    subVisible(parent, current) ? current : (subs.find(s => subVisible(parent, s)) || current)
  const effectiveKhoTab = firstVisibleSub('kho_hang', ['ton_kho', 'dat_hang', 'thong_ke'], khoTab)
  const effectiveMonitorTab = firstVisibleSub('theo_doi_may', ['bao_tri', 'giam_dinh'], monitorTab) as "bao_tri" | "giam_dinh"
  const repeatNgay = parseInt(cauHinh.repeat_ngay || '30') || 30
  const nguongTonThap = parseInt(cauHinh.nguong_ton_thap || '0') || 0

  // Nếu cấu hình tắt "mặc định hôm nay" -> bỏ lọc ngày mặc định (chạy một lần sau khi tải cấu hình)
  const jobFilterInitRef = useRef(false)
  useEffect(() => {
    if (jobFilterInitRef.current || Object.keys(cauHinh).length === 0) return
    jobFilterInitRef.current = true
    if (cauHinh.mac_dinh_hom_nay === '0') setJobFilters(f => ({ ...f, tuNgay: '', denNgay: '' }))
  }, [cauHinh])
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
  const [editingJobId, setEditingJobId] = useState<string | null>(null)
  const [editingKetQua, setEditingKetQua] = useState<string>('')
  const [traJobId, setTraJobId] = useState<string | null>(null)
  const [customers, setCustomers] = useState<any[]>([])
  const [technicians, setTechnicians] = useState<any[]>([])
  const [inventory, setInventory] = useState<any[]>([]) // Thêm state inventory
  const [danhMuc, setDanhMuc] = useState<{ id: string, nhom: string, gia_tri: string, thu_tu: number, active: boolean }[]>([])
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
    so_luong: 1,
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
    setEditingJobId(null)
    setEditingKetQua('')
    setDongGiamDinh(false)
    setFormData({
      ngay: new Date().toISOString().split('T')[0],
      ma_may: "",
      id_khach_hang: "",
      loai_cong_viec: "Kiểm tra",
      km: 0,
      so_luong: 1,
      ktv_id: "",
      report: "",
      ghi_chu: "",
      vat_tu: [],
      ten_khach_hang_moi: "",
      dia_chi_moi: "",
      model_moi: ""
    })
  }

  // Mở modal sửa phiếu. Admin sửa được mọi trạng thái (kể cả đã Hoàn thành);
  // vai trò khác chỉ sửa khi KTV chưa nhận việc.
  const handleEditJob = (job: any) => {
    if (job.ket_qua !== 'Chờ nhận' && currentUserRole !== 'admin') { showNotification('error', 'KTV đã nhận việc — không thể sửa phiếu này'); return }
    setEditingJobId(job.id)
    setEditingKetQua(job.ket_qua || '')
    setDongGiamDinh(false)
    setMayStatus(null)
    setFormData({
      ngay: job.ngay || new Date().toISOString().split('T')[0],
      ma_may: job.ma_may || '',
      id_khach_hang: job.id_khach_hang || '',
      loai_cong_viec: job.loai_cong_viec || 'Kiểm tra',
      km: job.km || 0,
      so_luong: job.so_luong || 1,
      ktv_id: job.ktv_id || '',
      report: job.report || '',
      ghi_chu: job.ghi_chu || '',
      vat_tu: (job.soct_chi_tiet_vat_tu || []).map((v: any) => ({ ma_hang: v.ma_hang, so_luong: String(v.so_luong), don_gia: String(v.don_gia ?? ''), vat: String(v.vat ?? ''), hoa_don: !!v.hoa_don })),
      ten_khach_hang_moi: "", dia_chi_moi: "", model_moi: ""
    })
    setIsModalOpen(true)
  }

  // Trả / hủy trả 1 dòng vật tư về kho (phiếu đã Hoàn thành)
  const handleTraVatTu = async (lineId: string, want: boolean) => {
    try {
      const res = await fetch('/api/admin/cong-viec/tra-vat-tu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: lineId, da_tra: want }) })
      if (res.ok) { showNotification('success', want ? 'Đã trả vật tư về kho (cộng tồn).' : 'Đã hủy trả (trừ tồn lại).'); fetchData() }
      else { const j = await res.json(); showNotification('error', j.error) }
    } catch { showNotification('error', 'Lỗi kết nối!') }
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

  // Realtime: KTV nhận/đổi trạng thái việc -> trang office tự cập nhật (không cần F5)
  const fetchDataRef = useRef(fetchData)
  fetchDataRef.current = fetchData
  useEffect(() => {
    if (!currentAdmin) return
    const channel = supabase
      .channel(JOBS_TOPIC)
      .on('broadcast', { event: JOBS_EVENT }, () => { fetchDataRef.current() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentAdmin])

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
      vat_tu: [...prev.vat_tu, { ma_hang: "", so_luong: "1", don_gia: "", vat: "", hoa_don: true }]
    }))
  }

  // Đưa vật tư đề xuất từ (các) biên bản giám định chờ thay vào ca việc
  const handleAddGiamDinhVatTu = () => {
    if (!mayStatus) return
    const lines = mayStatus.giam_dinh.flatMap((g: any) =>
      (g.soct_giam_dinh_vat_tu || []).map((v: any) => ({ ma_hang: v.ma_hang, so_luong: String(v.so_luong), don_gia: "", vat: "", hoa_don: true }))
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
        method: editingJobId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingJobId
          ? { ...formData, id: editingJobId, id_khach_hang: finalCustomerId, edit: true }
          : { ...formData, id_khach_hang: finalCustomerId })
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
        const wasEdit = !!editingJobId
        closeAndResetModal()
        showNotification('success', wasEdit ? "Đã cập nhật công việc!" : "Tạo và giao công việc mới thành công!")
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
    // Bỏ vật tư đã trả về kho khỏi tiền (khách không lấy -> không phát sinh)
    const vt = (job.soct_chi_tiet_vat_tu || []).filter((v: any) => !v.da_tra)
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
  }).sort((a, b) => {
    // Mới nhất -> cũ nhất: theo ngày giảm dần, cùng ngày thì số phiếu giảm dần
    if (a.ngay !== b.ngay) return a.ngay < b.ngay ? 1 : -1
    return String(b.report || '').localeCompare(String(a.report || ''), undefined, { numeric: true })
  })

  const clearJobFilters = () => setJobFilters({ search: "", tuNgay: "", denNgay: "", loaiViec: [], ktvId: "", hoaDon: "", trangThai: [] })
  const jobFilterActive = !!(jobFilters.search || jobFilters.tuNgay || jobFilters.denNgay || jobFilters.loaiViec.length || jobFilters.ktvId || jobFilters.hoaDon || jobFilters.trangThai.length)
  const jobsCol = useColView('jobs', JOBS_COLS)
  const jobsPaged = usePaged(filteredJobs)

  // Thẻ KPI tóm tắt (tính trên danh sách đã lọc)
  const jobStats = (() => {
    let done = 0, doing = 0, waiting = 0, unassigned = 0, revenue = 0, revenueHD = 0
    for (const j of filteredJobs) {
      if (j.ket_qua === 'Hoàn thành') done++
      else if (j.ket_qua === 'Đang làm') doing++
      else if (j.ket_qua === 'Chờ nhận') waiting++
      if (!(j as any).ktv_id) unassigned++
      const { tong, coHD } = jobTien(j)
      revenue += tong
      if (coHD) revenueHD += tong
    }
    return { total: filteredJobs.length, done, doing, waiting, unassigned, revenue, revenueHD }
  })()

  const exportJobsExcel = () => {
    const headers = ['Ngày', 'Khách hàng', 'Địa chỉ', 'Mã máy', 'Loại việc', 'KTV', 'KM', 'Số phiếu', 'Tiền', 'Hóa đơn', 'Trạng thái']
    const rows = filteredJobs.map(j => {
      const { tong, coHD } = jobTien(j)
      return [formatDate(j.ngay), j.soct_khach_hang?.ten_khach_hang, j.soct_khach_hang?.dia_chi, j.ma_may, j.loai_cong_viec, j.soct_users?.full_name || 'Chưa giao', j.km, j.report, tong, coHD ? 'Có HĐ' : 'Chưa HĐ', j.ket_qua]
    })
    exportRowsToExcel('so-cong-tac', headers, rows)
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
              <h1 className="text-2xl font-bold text-slate-800">{cauHinh.app_ten || 'Admin Dashboard'}</h1>
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

              {tabVisible('hoan_phieu') && (
                <button
                  onClick={() => setActiveTab("hoan_phieu")}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition ${activeTab === 'hoan_phieu' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Hoàn phiếu
                </button>
              )}

              {tabVisible('cong_no') && (
                <button
                  onClick={() => setActiveTab("cong_no")}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition ${activeTab === 'cong_no' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Công nợ
                </button>
              )}

              {tabVisible('kho_hang') && (
                <button
                  onClick={() => setActiveTab("kho_hang")}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition ${activeTab === 'kho_hang' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Kho hàng
                </button>
              )}

              {tabVisible('theo_doi_may') && (
                <button
                  onClick={() => setActiveTab("theo_doi_may")}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition ${activeTab === 'theo_doi_may' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Theo dõi máy
                </button>
              )}

              <button
                onClick={() => setActiveTab("he_thong")}
                className={`px-4 py-2 rounded-md font-medium text-sm transition ${activeTab === 'he_thong' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Hệ thống
              </button>
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
          <StatCards items={[
            { label: 'Tổng việc', value: jobStats.total.toLocaleString('vi-VN'), sub: `trên ${jobs.length.toLocaleString('vi-VN')} tất cả`, icon: ClipboardList, tint: 'text-blue-600 bg-blue-50 ring-blue-100' },
            { label: 'Hoàn thành', value: jobStats.done.toLocaleString('vi-VN'), sub: jobStats.total ? `${Math.round(jobStats.done / jobStats.total * 100)}% khối lượng` : '—', icon: CheckCircle2, tint: 'text-emerald-600 bg-emerald-50 ring-emerald-100' },
            { label: 'Đang làm / Chờ', value: (jobStats.doing + jobStats.waiting).toLocaleString('vi-VN'), sub: `${jobStats.unassigned.toLocaleString('vi-VN')} chưa giao`, icon: Clock, tint: 'text-amber-600 bg-amber-50 ring-amber-100' },
            { label: 'Phát sinh tiền', value: `${jobStats.revenue.toLocaleString('vi-VN')} đ`, sub: `có HĐ: ${jobStats.revenueHD.toLocaleString('vi-VN')} đ`, icon: Wallet, tint: 'text-indigo-600 bg-indigo-50 ring-indigo-100' },
          ]} />
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
                  <Button variant="outline" onClick={exportJobsExcel} className="gap-2"><Download className="w-4 h-4" /> Xuất Excel</Button>
                  {currentUserRole === 'admin' && (
                    <ImportJobsTool customers={customers} technicians={technicians} inventory={inventory} onSuccess={fetchData} showNotification={showNotification} />
                  )}
                  {currentUserRole === 'admin' && (
                    <ClearAllButton count={jobs.length} label="phiếu giao việc" onConfirm={async () => {
                      try {
                        const res = await fetch('/api/admin/cong-viec?all=1', { method: 'DELETE' })
                        const j = await res.json().catch(() => ({}))
                        if (!res.ok) throw new Error(j.error || 'Không xóa được')
                        showNotification('success', 'Đã xóa toàn bộ phiếu giao việc')
                        fetchData()
                      } catch (e: any) { showNotification('error', e.message || 'Không xóa được') }
                    }} />
                  )}
                  <Button onClick={() => { setEditingJobId(null); setEditingKetQua(''); setIsModalOpen(true) }} className="gap-2"><Plus className="w-4 h-4" /> Giao việc mới</Button>
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
                  {technicians.filter(t => t.role === 'ktv').map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
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
                <ColumnMenu view={jobsCol} />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200">
                  <tr>
                    {jobsCol.show('ngay') && <th className="px-4 py-3">Ngày</th>}
                    {jobsCol.show('khach') && <th className="px-4 py-3">Khách hàng</th>}
                    {jobsCol.show('ma_may') && <th className="px-4 py-3">Mã máy</th>}
                    {jobsCol.show('loai') && <th className="px-4 py-3">Loại việc</th>}
                    {jobsCol.show('ktv') && <th className="px-4 py-3">KTV</th>}
                    {jobsCol.show('km') && <th className="px-4 py-3 text-center">KM</th>}
                    {jobsCol.show('bao_cao') && <th className="px-4 py-3">Báo cáo HĐ</th>}
                    {jobsCol.show('trang_thai') && <th className="px-4 py-3">Trạng thái</th>}
                    {jobsCol.show('thaotac') && <th className="px-4 py-3 text-right">Thao tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loading ? (
                    <tr><td colSpan={9} className="text-center py-8 text-slate-400">Đang tải dữ liệu...</td></tr>
                  ) : filteredJobs.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-8 text-slate-400">{jobs.length === 0 ? 'Chưa có công việc nào' : 'Không có việc khớp bộ lọc'}{jobs.length > 0 && jobFilterActive && <button onClick={clearJobFilters} className="text-blue-600 hover:underline ml-1">— Bỏ lọc</button>}</td></tr>
                  ) : (
                    jobsPaged.pageItems.map((job) => (
                      <tr key={job.id} className="hover:bg-slate-50/80 transition">
                        {jobsCol.show('ngay') && <td className="px-4 py-3 whitespace-nowrap">{formatDate(job.ngay)}</td>}
                        {jobsCol.show('khach') && <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{job.soct_khach_hang?.ten_khach_hang}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" /> {job.soct_khach_hang?.dia_chi}
                          </div>
                        </td>}
                        {jobsCol.show('ma_may') && <td className="px-4 py-3 font-mono text-xs">{job.ma_may || '-'}</td>}
                        {jobsCol.show('loai') && <td className="px-4 py-3">{job.loai_cong_viec}</td>}
                        {jobsCol.show('ktv') && <td className="px-4 py-3">{job.soct_users?.full_name || <span className="text-amber-600 italic">Chưa giao</span>}</td>}
                        {jobsCol.show('km') && <td className="px-4 py-3 text-center text-xs">
                          {job.km ? `${job.km.toLocaleString('vi-VN')} km` : '0 km'}
                        </td>}
                        {jobsCol.show('bao_cao') && <td className="px-4 py-3 text-xs">
                          {job.report && <div className="text-slate-700">Phiếu: {job.report}</div>}
                          {(() => {
                            const allVt = job.soct_chi_tiet_vat_tu || []
                            if (allVt.length === 0) return null
                            const active = allVt.filter(v => !(v as any).da_tra)
                            const returned = allVt.length - active.length
                            const tong = active.reduce((s, v) => s + (Number(v.thanh_tien) || 0) + (v.hoa_don ? (Number(v.thanh_tien) || 0) * (Number(v.vat) || 0) / 100 : 0), 0)
                            const coHD = active.some(v => v.hoa_don)
                            return (
                              <>
                                {active.length > 0 && (
                                  <div className={coHD ? 'text-emerald-600' : 'text-amber-600'}>
                                    {coHD ? 'Có HĐ' : 'Chưa HĐ'}: {Math.round(tong).toLocaleString('vi-VN')} đ
                                  </div>
                                )}
                                {returned > 0 && <div className="text-indigo-600 text-[11px] font-medium">↩ Đã trả kho {returned}/{allVt.length}</div>}
                              </>
                            )
                          })()}
                        </td>}
                        {jobsCol.show('trang_thai') && <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-block whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium border
                            ${job.ket_qua === 'Hoàn thành' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              job.ket_qua === 'Đang làm' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              job.ket_qua === 'Lắp tiếp' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-slate-100 text-slate-700 border-slate-200'}`}
                          >
                            {job.ket_qua}
                          </span>
                        </td>}
                        {jobsCol.show('thaotac') && <td className="px-4 py-3 text-right whitespace-nowrap">
                          {(job.ket_qua === 'Chờ nhận' || currentUserRole === 'admin') && (
                            <button onClick={() => handleEditJob(job)} title={job.ket_qua === 'Chờ nhận' ? 'Sửa phiếu' : 'Sửa phiếu (admin)'} className="text-blue-500 hover:text-blue-700 p-1 rounded hover:bg-blue-50 transition">
                              <PenSquare className="w-4 h-4" />
                            </button>
                          )}
                          {currentUserRole !== 'staff' && job.ket_qua === 'Hoàn thành' && (job.soct_chi_tiet_vat_tu || []).length > 0 && (
                            <button onClick={() => setTraJobId(job.id)} title="Vật tư / Trả về kho" className="text-indigo-500 hover:text-indigo-700 p-1 rounded hover:bg-indigo-50 transition ml-1">
                              <Boxes className="w-4 h-4" />
                            </button>
                          )}
                          {currentUserRole !== 'staff' && (
                            <button onClick={() => confirmDelete(job.id)} title="Xóa phiếu" className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition ml-1">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 pb-2">
              <Pagination page={jobsPaged.page} pageCount={jobsPaged.pageCount} total={jobsPaged.total} perPage={jobsPaged.perPage} onPage={jobsPaged.setPage} />
            </div>
          </div>
        )}

        {activeTab === "kho_hang" && tabVisible('kho_hang') && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Thanh tab con của Kho hàng */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/50">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-max max-w-full overflow-x-auto">
                {([['ton_kho','Tồn kho'],['dat_hang','Đặt hàng'],['thong_ke','Thống kê nhập']] as const)
                  .filter(([k]) => subVisible('kho_hang', k))
                  .map(([k,l]) => (
                  <button key={k} onClick={() => setKhoTab(k as any)} className={`px-4 py-2 rounded-md font-medium text-sm transition whitespace-nowrap ${effectiveKhoTab === k ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{l}</button>
                ))}
              </div>
            </div>

            <div className="p-6 space-y-6">
              {effectiveKhoTab === "ton_kho" && (
                <>
                  <h2 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">Quản lý Kho Hàng (Vật tư)</h2>
                  <InventoryManagementTool inventory={inventory} lowStock={nguongTonThap} onUpdateSuccess={fetchData} showNotification={showNotification} confirmDelete={confirmDelete} />
                  <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 mt-8">
                    <h3 className="text-lg font-semibold text-slate-700 mb-2">Nhập / Xuất kho hàng (Excel)</h3>
                    <p className="text-sm text-slate-500 mb-4">
                      Quy trình: <b>Xóa toàn bộ</b> (nút phía trên) → <b>Xuất Excel</b> để lấy đúng cấu trúc cột → nhập dữ liệu vào file .xlsx → <b>Nhập từ Excel</b>.<br />
                      <b>Cột:</b> Mã hàng | Tên vật tư | Model | Hãng | Tồn kho. Trùng Mã hàng sẽ được cập nhật.
                    </p>
                    <ExcelTool
                      rows={inventory}
                      filename="kho-hang"
                      endpoint="/api/admin/kho-hang/bulk"
                      payloadKey="items"
                      unit="vật tư"
                      requiredKeys={['ma_hang', 'ten_hang']}
                      columns={[
                        { header: 'Mã hàng', key: 'ma_hang', parse: (s) => s ? s.toUpperCase() : null },
                        { header: 'Tên vật tư', key: 'ten_hang' },
                        { header: 'Model', key: 'model' },
                        { header: 'Hãng', key: 'hang' },
                        { header: 'Tồn kho', key: 'ton_kho', parse: (s) => parseInt(s) || 0 },
                      ]}
                      onSuccess={fetchData}
                      showNotification={showNotification}
                    />
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
        {activeTab === "theo_doi_may" && tabVisible('theo_doi_may') && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Thanh tab con của Theo dõi máy */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/50">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-max max-w-full overflow-x-auto">
                {([['bao_tri','Bảo trì'],['giam_dinh','Giám định']] as const)
                  .filter(([k]) => subVisible('theo_doi_may', k))
                  .map(([k,l]) => (
                  <button key={k} onClick={() => setMonitorTab(k as any)} className={`px-4 py-2 rounded-md font-medium text-sm transition whitespace-nowrap ${effectiveMonitorTab === k ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{l}</button>
                ))}
              </div>
            </div>

            <div className="p-6">
              {effectiveMonitorTab === "bao_tri" && (
                <BaoTriTool customers={customers} showNotification={showNotification} />
              )}
              {effectiveMonitorTab === "giam_dinh" && (
                <GiamDinhTool customers={customers} inventory={inventory} ktvOptions={dmOptions('ktv_giam_dinh')} tinhTrangOptions={dmOptions('tinh_trang_may')} showNotification={showNotification} />
              )}
            </div>
          </div>
        )}

        {activeTab === "hoan_phieu" && tabVisible('hoan_phieu') && (
          <PhieuCungTool nguongNgay={parseInt(cauHinh.phieu_cung_canh_bao_ngay || '3') || 3} currentUserRole={currentUserRole} showNotification={showNotification} />
        )}

        {activeTab === "cong_no" && tabVisible('cong_no') && (
          <CongNoTool showNotification={showNotification} />
        )}

        {activeTab === "he_thong" && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Thanh tab con của Hệ thống */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/50">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-max max-w-full overflow-x-auto">
                {currentUserRole === 'admin' && (<>
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
                <button
                  onClick={() => setSystemTab("bao_cao")}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition whitespace-nowrap ${systemTab === 'bao_cao' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Báo cáo tháng
                </button>
                <button
                  onClick={() => setSystemTab("audit")}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition whitespace-nowrap ${systemTab === 'audit' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Audit Logs
                </button>
                </>)}
                <button
                  onClick={() => setSystemTab("doi_mat_khau")}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition whitespace-nowrap ${(systemTab === 'doi_mat_khau' || currentUserRole !== 'admin') ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Đổi mật khẩu
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {currentUserRole === 'admin' && (<>
              {/* TAB CON: CÀI ĐẶT HỆ THỐNG */}
              {systemTab === "cai_dat" && (
                <CaiDatHeThongTool cauHinh={cauHinh} onUpdateSuccess={fetchData} showNotification={showNotification} />
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
                    <CustomerListTool customers={customers} loaiHdOptions={dmOptions('loai_hd', ['HĐBT','MF'])} hangOptions={dmOptions('hang', ['Konica','Fuji','Khác'])} hdbtCanhBaoThang={hdbtCanhBaoThang} onUpdateSuccess={fetchData} showNotification={showNotification} />
                  </div>

                  <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50">
                    <h3 className="text-lg font-semibold text-slate-700 mb-2">Nhập / Xuất khách hàng (Excel)</h3>
                    <p className="text-sm text-slate-500 mb-4">
                      Quy trình: <b>Xóa toàn bộ</b> (nút phía trên) → <b>Xuất Excel</b> để lấy đúng cấu trúc cột → nhập dữ liệu vào file .xlsx → <b>Nhập từ Excel</b>.<br />
                      <b>Cột:</b> Mã máy | Tên khách hàng | Địa chỉ | Model | Hãng | Km | Loại HĐ | Ngày hết hạn HĐBT (DD/MM/YYYY). Trùng Mã máy sẽ được cập nhật.<br />
                      <span className="text-xs text-slate-400">Để trống cột <b>Km</b> → hệ thống tự tính tọa độ &amp; KM từ địa chỉ (chạy tuần tự ~1s/dòng, danh sách lớn sẽ hơi lâu). Dòng đã có Km giữ nguyên.</span>
                    </p>
                    <ExcelTool
                      rows={customers}
                      filename="khach-hang"
                      endpoint="/api/admin/khach-hang/bulk"
                      payloadKey="customers"
                      unit="khách hàng"
                      requiredKeys={['ma_may', 'ten_khach_hang', 'dia_chi']}
                      columns={[
                        { header: 'Mã máy', key: 'ma_may' },
                        { header: 'Tên khách hàng', key: 'ten_khach_hang' },
                        { header: 'Địa chỉ', key: 'dia_chi' },
                        { header: 'Model', key: 'model' },
                        { header: 'Hãng', key: 'hang' },
                        { header: 'Km', key: 'km_mac_dinh', parse: (s) => s ? (parseFloat(s.replace(',', '.')) || 0) : null },
                        { header: 'Loại HĐ', key: 'loai_hd' },
                        { header: 'Ngày hết hạn HĐBT', key: 'ngay_het_han_hdbt', toCsv: (v) => v ? formatDate(v) : '', parse: (s) => parseDDMMYYYY(s) },
                      ]}
                      onSuccess={fetchData}
                      showNotification={showNotification}
                    />
                  </div>
                </>
              )}

              {/* TAB CON: DANH MỤC */}
              {systemTab === "danh_muc" && (
                <DanhMucTool danhMuc={danhMuc} onUpdateSuccess={fetchData} showNotification={showNotification} />
              )}

              {/* TAB CON: BÁO CÁO THÁNG */}
              {systemTab === "bao_cao" && (
                <BaoCaoThangTool showNotification={showNotification} />
              )}

              {/* TAB CON: AUDIT LOGS */}
              {systemTab === "audit" && (
                <AuditLogsTool showNotification={showNotification} />
              )}
              </>)}

              {/* TAB CON: ĐỔI MẬT KHẨU (mọi role) */}
              {(currentUserRole !== 'admin' || systemTab === 'doi_mat_khau') && (
                <DoiMatKhauTool showNotification={showNotification} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal: Vật tư đã dùng / Trả về kho (phiếu Hoàn thành) */}
      {traJobId && (() => {
        const tj = jobs.find(j => j.id === traJobId)
        if (!tj) return null
        const vts = (tj as any).soct_chi_tiet_vat_tu || []
        return (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Vật tư đã dùng {tj.report ? `— Phiếu ${tj.report}` : ''}</h2>
                  <p className="text-xs text-slate-500">{tj.soct_khach_hang?.ten_khach_hang}{tj.ma_may ? ` · Máy ${tj.ma_may}` : ''}</p>
                </div>
                <button onClick={() => setTraJobId(null)} className="text-slate-400 hover:text-slate-600"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              <div className="p-5 space-y-2">
                <p className="text-xs text-slate-500">Khách không lấy vật tư nào thì bấm <b>Trả về kho</b> — tồn kho sẽ cộng lại. Dòng đã trả được giữ để đối soát (có thể Hủy trả nếu nhầm).</p>
                {vts.length === 0 ? <p className="text-sm text-slate-400 text-center py-3">Không có vật tư.</p> : vts.map((v: any) => (
                  <div key={v.id} className={`flex items-center gap-3 p-3 rounded-lg border ${v.da_tra ? 'bg-slate-50 border-slate-200' : 'border-slate-200'}`}>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${v.da_tra ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{v.soct_kho_hang?.ten_hang || v.ma_hang}</div>
                      <div className="text-xs text-slate-500">SL: {v.so_luong} · <span className="font-mono">{v.ma_hang}</span>{v.da_tra ? ' · đã trả về kho' : ''}</div>
                    </div>
                    {v.da_tra ? (
                      <Button variant="outline" onClick={() => handleTraVatTu(v.id, false)} className="h-8 text-xs shrink-0">Hủy trả</Button>
                    ) : (
                      <Button onClick={() => handleTraVatTu(v.id, true)} className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 gap-1 shrink-0"><Boxes className="w-3.5 h-3.5" /> Trả về kho</Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

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
              <h2 className="text-xl font-bold text-slate-800">{editingJobId ? 'Sửa công việc' : 'Giao công việc mới'}</h2>
              <button onClick={closeAndResetModal} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <form onSubmit={handleCreateJob} className="p-6 space-y-6">
              {editingJobId && editingKetQua && editingKetQua !== 'Chờ nhận' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <b>Sửa phiếu đã "{editingKetQua}" (quyền admin).</b> Sửa phiếu này <u>không</u> tự điều chỉnh tồn kho.
                  Nếu thay đổi vật tư của phiếu đã trừ kho, hãy chỉnh tồn ở tab Kho hàng hoặc dùng nút "Trả vật tư" cho đúng.
                </div>
              )}
              {/* Cụm: Ngày (hẹp) & Kỹ thuật viên (rộng) — cân đối với Mã máy/Khách hàng */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Ngày</label>
                  <DateField value={formData.ngay} onChange={(v) => setFormData({...formData, ngay: v})} />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700">Kỹ thuật viên</label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    value={formData.ktv_id}
                    onChange={(e) => setFormData({...formData, ktv_id: e.target.value})}
                  >
                    <option value="">-- Chưa giao KTV --</option>
                    {technicians.filter(t => t.role === 'ktv').map(t => (
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
                const recent = jobs.find(j => j.ma_may && j.ma_may.toLowerCase() === mm.toLowerCase() && j.ket_qua === 'Hoàn thành' && j.ngay && (Date.now() - new Date(j.ngay).getTime()) <= repeatNgay * 86400000)
                const gd = mayStatus?.giam_dinh || []
                const gdVatTu = gd.flatMap((g: any) => g.soct_giam_dinh_vat_tu || [])
                const pill = 'px-2.5 py-1 rounded-full text-xs font-semibold border'
                return (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {/* Chỉ theo dõi bảo trì tháng với máy HĐBT hoặc MF (máy mới bảo trì free 1 năm); loại khác không hiện */}
                      {['HĐBT', 'MF'].includes(matched.loai_hd) && mayStatus && (mayStatus.bao_tri_thang
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

              {/* Dòng: Loại công việc | Số lượng | Số phiếu | Khoảng cách */}
              <div className="grid grid-cols-2 md:grid-cols-12 gap-4">
                <div className="space-y-2 col-span-2 md:col-span-4">
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

                <div className="space-y-2 col-span-1 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700">Số lượng</label>
                  <Input
                    type="number"
                    min="1"
                    className="bg-white"
                    value={formData.so_luong}
                    onChange={(e) => setFormData({ ...formData, so_luong: parseInt(e.target.value) || 1 })}
                  />
                </div>

                <div className="space-y-2 col-span-2 md:col-span-4">
                  <label className="text-sm font-medium text-slate-700">Số phiếu (Report)</label>
                  <Input
                    placeholder="VD: RP-2026-001"
                    value={formData.report}
                    onChange={(e) => setFormData({...formData, report: e.target.value})}
                  />
                </div>

                <div className="space-y-2 col-span-1 md:col-span-2">
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
                    <span className="text-xs text-amber-600 italic mt-1 block">Hệ thống sẽ tự tính KM khi lưu</span>
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
                <Button type="submit">{editingJobId ? 'Cập nhật công việc' : 'Lưu công việc & Báo KTV'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

// ===== Công cụ Import / Export Excel (.xlsx) dùng chung (Khách hàng, Kho hàng) =====
type ExcelCol = { header: string; key: string; toCsv?: (v: any) => string; parse?: (raw: string) => any }

// DD/MM/YYYY -> YYYY-MM-DD (null nếu rỗng/sai)
function parseDDMMYYYY(s: string): string | null {
  const m = (s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}

// Xuất một danh sách (đã lọc) ra file .xlsx với tiêu đề in đậm
async function exportRowsToExcel(filename: string, headers: string[], rows: any[][]) {
  const mod: any = await import('exceljs')
  const ExcelJS = mod.default ?? mod
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Data')
  const h = ws.addRow(headers); h.font = { bold: true }
  for (const r of rows) ws.addRow(r.map(v => v == null ? '' : v))
  headers.forEach((hd, i) => { ws.getColumn(i + 1).width = Math.max(12, String(hd).length + 4) })
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a')
  a.href = url; a.download = `${filename}-${new Date().toISOString().split('T')[0]}.xlsx`; a.click(); URL.revokeObjectURL(url)
}

function ExcelTool({ columns, rows, filename, endpoint, payloadKey, requiredKeys, unit, onSuccess, showNotification }: {
  columns: ExcelCol[]; rows: any[]; filename: string; endpoint: string; payloadKey: string;
  requiredKeys: string[]; unit: string; onSuccess: () => void; showNotification: (type: 'success' | 'error', msg: string) => void
}) {
  const [parsed, setParsed] = useState<any[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const cellText = (r: any, c: ExcelCol) => c.toCsv ? c.toCsv(r[c.key]) : (r[c.key] ?? '')
  // Giá trị ghi ra Excel: có toCsv -> chuỗi (VD ngày); còn lại giữ nguyên (số vẫn là số)
  const exportVal = (r: any, c: ExcelCol) => c.toCsv ? c.toCsv(r[c.key]) : (r[c.key] == null ? '' : r[c.key])
  // Đọc 1 ô Excel ra chuỗi: Date -> DD/MM/YYYY; object (rich text/công thức) -> text
  const cellToStr = (v: any): string => {
    if (v == null) return ''
    if (v instanceof Date) return `${String(v.getDate()).padStart(2, '0')}/${String(v.getMonth() + 1).padStart(2, '0')}/${v.getFullYear()}`
    if (typeof v === 'object') {
      if ('text' in v) return String((v as any).text)
      if ('result' in v) return String((v as any).result)
      if ('richText' in v) return (v as any).richText.map((t: any) => t.text).join('')
      return ''
    }
    return String(v)
  }

  const exportExcel = async () => {
    setBusy(true)
    try {
      const mod: any = await import('exceljs')
      const ExcelJS = mod.default ?? mod
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Data')
      const head = ws.addRow(columns.map(c => c.header)); head.font = { bold: true }
      for (const r of rows) ws.addRow(columns.map(c => exportVal(r, c)))
      columns.forEach((c, i) => { ws.getColumn(i + 1).width = Math.max(12, c.header.length + 4) })
      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob); const a = document.createElement('a')
      a.href = url; a.download = `${filename}-${new Date().toISOString().split('T')[0]}.xlsx`; a.click(); URL.revokeObjectURL(url)
    } catch { showNotification('error', 'Không tạo được file Excel.') }
    finally { setBusy(false) }
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setBusy(true)
    try {
      const mod: any = await import('exceljs')
      const ExcelJS = mod.default ?? mod
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await file.arrayBuffer())
      const ws = wb.worksheets[0]
      if (!ws) { showNotification('error', 'File Excel không có dữ liệu.'); setParsed(null); return }
      const grid: string[][] = []
      ws.eachRow({ includeEmpty: false }, (row: any) => {
        const vals = row.values as any[] // 1-indexed
        grid.push(columns.map((_, i) => cellToStr(vals[i + 1])))
      })
      if (grid.length < 2) { showNotification('error', 'File Excel trống hoặc chỉ có dòng tiêu đề.'); setParsed(null); return }
      const headers = grid[0].map(h => h.trim().toLowerCase())
      const colIdx = columns.map(c => headers.indexOf(c.header.toLowerCase()))
      const recs: any[] = []
      for (let i = 1; i < grid.length; i++) {
        const line = grid[i]
        if (!line.some(c => c.trim() !== '')) continue
        const obj: any = {}
        columns.forEach((c, ci) => {
          const raw = ((colIdx[ci] >= 0 ? line[colIdx[ci]] : line[ci]) ?? '').trim()
          obj[c.key] = c.parse ? c.parse(raw) : (raw || null)
        })
        if (requiredKeys.every(k => obj[k] != null && String(obj[k]).trim() !== '')) recs.push(obj)
      }
      if (recs.length === 0) { showNotification('error', 'Không có dòng hợp lệ (thiếu cột bắt buộc).'); setParsed(null); return }
      setParsed(recs)
    } catch { showNotification('error', 'Không đọc được file Excel.') }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const doImport = async () => {
    if (!parsed) return
    setImporting(true)
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [payloadKey]: parsed }) })
      if (res.ok) { const d = await res.json(); showNotification('success', `Đã import ${d.count} ${unit}.` + (d.geocoded ? ` Tự tính KM cho ${d.geocoded} dòng.` : '')); setParsed(null); onSuccess() }
      else { const err = await res.json(); showNotification('error', 'Lỗi import: ' + err.error) }
    } catch { showNotification('error', 'Lỗi kết nối khi import.') }
    finally { setImporting(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={exportExcel} disabled={busy} className="gap-2"><Download className="w-4 h-4" /> Xuất Excel ({rows.length})</Button>
        <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onFile} className="hidden" />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy} className="gap-2"><Upload className="w-4 h-4" /> Nhập từ Excel</Button>
      </div>
      {parsed && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-slate-600">Đã đọc <b>{parsed.length}</b> dòng hợp lệ.</span>
            <Button onClick={doImport} disabled={importing} className="bg-emerald-600 hover:bg-emerald-700 h-9">{importing ? 'Đang nhập...' : `Xác nhận nhập ${parsed.length} ${unit}`}</Button>
            <button onClick={() => setParsed(null)} className="text-xs text-slate-500 hover:underline">Hủy</button>
          </div>
          <div className="border border-slate-200 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-100 text-slate-600 font-medium sticky top-0 border-b border-slate-200">
                <tr>{columns.map(c => <th key={c.key} className="px-3 py-2">{c.header}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parsed.slice(0, 50).map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">{columns.map(c => <td key={c.key} className="px-3 py-2">{cellText(r, c)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.length > 50 && <p className="text-xs text-slate-400">Xem trước 50/{parsed.length} dòng đầu.</p>}
        </div>
      )}
    </div>
  )
}

// Ô chọn ngày: gõ tay DD/MM/YYYY (ô text) + nút lịch mở native picker (showPicker).
function DateField({ value, onChange, className, heightClass = "h-10", placeholder = "dd/mm/yyyy" }: { value: string, onChange: (v: string) => void, className?: string, heightClass?: string, placeholder?: string }) {
  const fmt = (s: string) => { if (!s) return ''; const d = new Date(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` }
  const dateRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(fmt(value))
  useEffect(() => { setText(fmt(value)) }, [value])

  const onText = (t: string) => {
    setText(t)
    if (t.trim() === '') { onChange(''); return }
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (m) {
      const dd = +m[1], mm = +m[2], yy = +m[3]
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) onChange(`${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`)
    }
  }
  const openPicker = () => {
    const el = dateRef.current
    if (!el) return
    if (typeof el.showPicker === 'function') { try { el.showPicker() } catch { el.focus() } }
    else { el.focus(); el.click() }
  }
  return (
    <div className={`relative flex items-center ${heightClass} rounded-md border border-slate-200 bg-white ${className || ''}`}>
      <input type="text" inputMode="numeric" placeholder={placeholder} value={text} onChange={(e) => onText(e.target.value)} className="flex-1 min-w-0 h-full px-3 bg-transparent text-sm text-slate-700 outline-none rounded-md" />
      <button type="button" onClick={openPicker} aria-label="Chọn ngày" className="px-2 h-full text-slate-400 hover:text-slate-600 shrink-0">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
      </button>
      <input ref={dateRef} type="date" value={value} onChange={(e) => onChange(e.target.value)} tabIndex={-1} aria-hidden="true" className="absolute right-1 bottom-0 w-4 h-4 opacity-0 pointer-events-none" />
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

const INVENTORY_COLS: ColDef[] = [
  { key: 'ma_hang', label: 'Mã hàng', locked: true },
  { key: 'ten_hang', label: 'Tên vật tư', locked: true },
  { key: 'model', label: 'Model máy' },
  { key: 'hang', label: 'Hãng' },
  { key: 'ton_kho', label: 'Tồn kho' },
  { key: 'thaotac', label: 'Thao tác', locked: true },
]

function InventoryManagementTool({ inventory, lowStock = 0, onUpdateSuccess, showNotification, confirmDelete }: { inventory: any[], lowStock?: number, onUpdateSuccess: () => void, showNotification: (type: 'success' | 'error', msg: string) => void, confirmDelete: (id: string, type: 'job' | 'user' | 'inventory') => void }) {
  const col = useColView('inventory', INVENTORY_COLS)
  const paged = usePaged(inventory)
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

  const invTon = inventory.reduce((s, i) => s + (Number(i.ton_kho) || 0), 0)
  const invLow = lowStock > 0 ? inventory.filter(i => (Number(i.ton_kho) || 0) > 0 && (Number(i.ton_kho) || 0) <= lowStock).length : 0
  const invOut = inventory.filter(i => (Number(i.ton_kho) || 0) <= 0).length

  return (
    <div className="space-y-6">
      <StatCards items={[
        { label: 'Mã hàng', value: inventory.length.toLocaleString('vi-VN'), sub: 'đầu mục vật tư', icon: Package, tint: 'text-blue-600 bg-blue-50 ring-blue-100' },
        { label: 'Tổng tồn', value: invTon.toLocaleString('vi-VN'), sub: 'đơn vị trong kho', icon: Boxes, tint: 'text-indigo-600 bg-indigo-50 ring-indigo-100' },
        { label: 'Sắp hết', value: invLow.toLocaleString('vi-VN'), sub: lowStock > 0 ? `tồn ≤ ${lowStock.toLocaleString('vi-VN')}` : 'chưa đặt ngưỡng', icon: AlertTriangle, tint: 'text-amber-600 bg-amber-50 ring-amber-100' },
        { label: 'Hết hàng', value: invOut.toLocaleString('vi-VN'), sub: 'tồn = 0', icon: Trash2, tint: 'text-red-600 bg-red-50 ring-red-100' },
      ]} />
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

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm text-slate-500">{inventory.length} vật tư trong kho</span>
        <div className="flex items-center gap-2">
          <ColumnMenu view={col} />
          <ClearAllButton count={inventory.length} label="vật tư trong kho" onConfirm={async () => {
            const res = await fetch('/api/admin/kho-hang?all=1', { method: 'DELETE' })
            if (res.ok) { showNotification('success', 'Đã xóa toàn bộ vật tư.'); onUpdateSuccess() } else showNotification('error', 'Xóa không thành công')
          }} />
        </div>
      </div>
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200 shadow-sm">
            <tr>
              {col.show('ma_hang') && <th className="px-4 py-3 font-semibold">Mã hàng</th>}
              {col.show('ten_hang') && <th className="px-4 py-3 font-semibold">Tên vật tư</th>}
              {col.show('model') && <th className="px-4 py-3 font-semibold">Model máy</th>}
              {col.show('hang') && <th className="px-4 py-3 font-semibold">Hãng</th>}
              {col.show('ton_kho') && <th className="px-4 py-3 font-semibold text-center">Tồn kho</th>}
              {col.show('thaotac') && <th className="px-4 py-3 font-semibold text-center w-24">Thao tác</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {inventory.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Kho hàng đang trống.</td></tr>
            ) : paged.pageItems.map((item) => (
              <tr key={item.ma_hang} id={'inv-' + item.ma_hang} className={`transition-colors ${highlightMH === item.ma_hang ? 'bg-amber-100' : 'hover:bg-slate-50'}`}>
                {col.show('ma_hang') && <td className="px-4 py-3 font-mono font-medium text-slate-700">{item.ma_hang}</td>}
                {col.show('ten_hang') && <td className="px-4 py-3 font-medium text-slate-800">{item.ten_hang}</td>}
                {col.show('model') && <td className="px-4 py-3">{item.model || <span className="text-slate-400 italic">Dùng chung</span>}</td>}
                {col.show('hang') && <td className="px-4 py-3">{item.hang || <span className="text-slate-400 italic">—</span>}</td>}
                {col.show('ton_kho') && <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${item.ton_kho <= lowStock ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                    {item.ton_kho}
                  </span>
                </td>}
                {col.show('thaotac') && <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                    <button onClick={() => handleEdit(item)} title="Sửa" className="text-blue-500 hover:text-blue-700 p-1.5 bg-blue-50 hover:bg-blue-100 rounded-md transition"><PenSquare className="w-4 h-4" /></button>
                    <button onClick={() => confirmDelete(item.ma_hang, 'inventory')} title="Xóa" className="text-red-500 hover:text-red-700 p-1.5 bg-red-50 hover:bg-red-100 rounded-md transition"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div className="px-4 pb-2">
          <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} perPage={paged.perPage} onPage={paged.setPage} />
        </div>
      </div>
    </div>
  )
}

const USER_COLS: ColDef[] = [
  { key: 'ho_ten', label: 'Họ Tên', locked: true },
  { key: 'username', label: 'Tên đăng nhập', locked: true },
  { key: 'role', label: 'Role' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'trang_thai', label: 'Trạng thái' },
  { key: 'thaotac', label: 'Thao tác', locked: true },
]

function UserManagementTool({ users, onUpdateSuccess, showNotification, confirmDelete }: { users: any[], onUpdateSuccess: () => void, showNotification: (type: 'success' | 'error', msg: string) => void, confirmDelete: (id: string, type: 'job' | 'user' | 'inventory') => void }) {
  const col = useColView('users', USER_COLS)
  const paged = usePaged(users)
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

  const userActive = users.filter(u => u.is_active !== false).length
  const userKtv = users.filter(u => u.role === 'ktv').length

  return (
    <div className="space-y-6">
      <StatCards items={[
        { label: 'Tài khoản', value: users.length.toLocaleString('vi-VN'), sub: 'tổng người dùng', icon: Users, tint: 'text-blue-600 bg-blue-50 ring-blue-100' },
        { label: 'KTV', value: userKtv.toLocaleString('vi-VN'), sub: 'kỹ thuật viên', icon: Wrench, tint: 'text-indigo-600 bg-indigo-50 ring-indigo-100' },
        { label: 'Đang hoạt động', value: userActive.toLocaleString('vi-VN'), sub: `${(users.length - userActive).toLocaleString('vi-VN')} ngừng`, icon: CheckCircle2, tint: 'text-emerald-600 bg-emerald-50 ring-emerald-100' },
      ]} />
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

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm text-slate-500">{users.length} tài khoản</span>
        <ColumnMenu view={col} />
      </div>
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200">
            <tr>
              {col.show('ho_ten') && <th className="px-4 py-2">Họ Tên</th>}
              {col.show('username') && <th className="px-4 py-2">Tên đăng nhập</th>}
              {col.show('role') && <th className="px-4 py-2">Role</th>}
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
                </td>}
              </tr>
              )
            })}
          </tbody>
        </table>
        </div>
        <div className="px-4 pb-2">
          <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} perPage={paged.perPage} onPage={paged.setPage} />
        </div>
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
  const gdPaged = usePaged(filteredRecords)
  const gdStats = {
    total: filteredRecords.length,
    choThay: filteredRecords.filter(r => !r.da_thay).length,
    daThay: filteredRecords.filter(r => r.da_thay).length,
    daBaoGia: filteredRecords.filter(r => r.da_bao_gia).length,
  }

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
        <StatCards items={[
          { label: 'Biên bản', value: gdStats.total.toLocaleString('vi-VN'), sub: `trên ${records.length.toLocaleString('vi-VN')} tất cả`, icon: ClipboardCheck, tint: 'text-blue-600 bg-blue-50 ring-blue-100' },
          { label: 'Chờ thay', value: gdStats.choThay.toLocaleString('vi-VN'), sub: 'chưa thay vật tư', icon: Clock, tint: 'text-amber-600 bg-amber-50 ring-amber-100' },
          { label: 'Đã thay', value: gdStats.daThay.toLocaleString('vi-VN'), sub: 'đã xử lý xong', icon: CheckCircle2, tint: 'text-emerald-600 bg-emerald-50 ring-emerald-100' },
          { label: 'Đã báo giá', value: gdStats.daBaoGia.toLocaleString('vi-VN'), sub: 'đã gửi khách', icon: Wallet, tint: 'text-indigo-600 bg-indigo-50 ring-indigo-100' },
        ]} />
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
        ) : gdPaged.pageItems.map((r) => (
          <div key={r.id} className={`bg-white rounded-lg border p-4 space-y-2 ${r.da_thay ? 'border-slate-200 opacity-75' : 'border-amber-200'}`}>
            <div className="flex justify-between items-start gap-3 flex-wrap">
              <div>
                <div className="font-medium text-slate-800">{r.soct_khach_hang?.ten_khach_hang || 'Không rõ khách hàng'}</div>
                <div className="text-xs text-slate-500">Mã máy <span className="font-mono">{r.ma_may}</span> · {r.soct_khach_hang?.model || '-'} · GĐ {fmtDate(r.ngay_giam_dinh)}{r.ktv_giam_dinh ? ` · ${r.ktv_giam_dinh}` : ''}</div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <span className={`whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-semibold border ${r.da_bao_gia ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                  {r.da_bao_gia ? 'Đã báo giá' : 'Chưa báo giá'}
                </span>
                <span className={`whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-semibold border ${r.da_thay ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
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
        <Pagination page={gdPaged.page} pageCount={gdPaged.pageCount} total={gdPaged.total} perPage={gdPaged.perPage} onPage={gdPaged.setPage} />
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
          <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide sticky top-0 border-b border-slate-200 shadow-sm z-10">
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
  const dhPaged = usePaged(filteredOrders)

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

  const exportOrdersExcel = () => {
    const headers = ['Ngày đặt', 'Nhà cung cấp', 'Số đơn', 'Trạng thái', 'Mã hàng', 'Tên hàng', 'SL đặt', 'Đã nhận', 'Còn thiếu']
    const rows: any[][] = []
    for (const o of filteredOrders) for (const l of (o.soct_dat_hang_ct || [])) {
      const nhan = daNhan(l)
      rows.push([fmtDate(o.ngay_dat), o.nha_cung_cap, o.so_don_hang, o.da_dat ? 'Đã đặt' : 'Nháp', l.ma_hang, l.soct_kho_hang?.ten_hang, l.sl_dat, nhan, l.sl_dat - nhan])
    }
    exportRowsToExcel('dat-hang', headers, rows)
  }

  const orderStats = (() => {
    let daDat = 0, done = 0, thieu = 0
    for (const o of filteredOrders) {
      if (o.da_dat) daDat++
      if (o.hoan_thanh) done++
      for (const l of (o.soct_dat_hang_ct || [])) thieu += Math.max(0, (Number(l.sl_dat) || 0) - daNhan(l))
    }
    return { total: filteredOrders.length, daDat, done, thieu }
  })()

  return (
    <div className="space-y-6">
      <StatCards items={[
        { label: 'Đơn hàng', value: orderStats.total.toLocaleString('vi-VN'), sub: `trên ${orders.length.toLocaleString('vi-VN')} tất cả`, icon: ShoppingCart, tint: 'text-blue-600 bg-blue-50 ring-blue-100' },
        { label: 'Đã đặt NCC', value: orderStats.daDat.toLocaleString('vi-VN'), sub: `${(orderStats.total - orderStats.daDat).toLocaleString('vi-VN')} còn nháp`, icon: CheckCircle2, tint: 'text-indigo-600 bg-indigo-50 ring-indigo-100' },
        { label: 'Đủ hàng', value: orderStats.done.toLocaleString('vi-VN'), sub: 'đã nhận đủ', icon: Package, tint: 'text-emerald-600 bg-emerald-50 ring-emerald-100' },
        { label: 'Còn thiếu', value: orderStats.thieu.toLocaleString('vi-VN'), sub: 'đơn vị chưa về', icon: AlertTriangle, tint: 'text-amber-600 bg-amber-50 ring-amber-100' },
      ]} />
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
          <Button variant="outline" onClick={exportOrdersExcel} className="gap-2 h-9 text-xs"><Download className="w-4 h-4" /> Xuất Excel</Button>
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
          : dhPaged.pageItems.map(o => (
            <div key={o.id} className={`bg-white rounded-lg border p-4 space-y-3 ${o.hoan_thanh ? 'border-slate-200 opacity-80' : 'border-slate-200'}`}>
              <div className="flex justify-between items-start gap-3 flex-wrap">
                <div>
                  <div className="font-medium text-slate-800">{o.nha_cung_cap || 'Chưa có NCC'} {o.so_don_hang && <span className="text-slate-400 font-normal">· {o.so_don_hang}</span>}</div>
                  <div className="text-xs text-slate-500">Ngày đặt {fmtDate(o.ngay_dat)}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => toggleDaDat(o)} className={`whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-semibold border ${o.da_dat ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{o.da_dat ? 'Đã đặt' : 'Nháp'}</button>
                  {o.hoan_thanh && <span className="whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200">Đã đủ hàng</span>}
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
        {!loading && filteredOrders.length > 0 && (
          <Pagination page={dhPaged.page} pageCount={dhPaged.pageCount} total={dhPaged.total} perPage={dhPaged.perPage} onPage={dhPaged.setPage} />
        )}
      </div>
    </div>
  )
}

// Dải thẻ KPI tóm tắt dùng chung cho các tab (số liệu tính trên danh sách đã lọc).
type StatCard = { label: string, value: string, sub?: string, icon: any, tint: string }
function StatCards({ items }: { items: StatCard[] }) {
  const cols = items.length <= 2 ? 'sm:grid-cols-2' : items.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4'
  return (
    <div className={`grid grid-cols-2 ${cols} gap-3 sm:gap-4`}>
      {items.map(c => (
        <div key={c.label} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-start gap-3">
          <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ring-1 ${c.tint}`}><c.icon className="w-5 h-5" /></div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-500">{c.label}</div>
            <div className="text-xl font-bold text-slate-800 leading-tight truncate" title={c.value}>{c.value}</div>
            {c.sub && <div className="text-[11px] text-slate-400 truncate">{c.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

function CaiDatHeThongTool({ cauHinh, onUpdateSuccess, showNotification }: { cauHinh: Record<string, string>, onUpdateSuccess: () => void, showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [cfg, setCfg] = useState({
    app_ten: cauHinh.app_ten || '',
    vp_lat: cauHinh.vp_lat || '',
    vp_lng: cauHinh.vp_lng || '',
    repeat_ngay: cauHinh.repeat_ngay || '30',
    hdbt_canh_bao_thang: cauHinh.hdbt_canh_bao_thang || '2',
    nguong_ton_thap: cauHinh.nguong_ton_thap || '0',
    phieu_cung_canh_bao_ngay: cauHinh.phieu_cung_canh_bao_ngay || '3',
    phien_van_phong_ngay: cauHinh.phien_van_phong_ngay || '7',
    phien_ktv_ngay: cauHinh.phien_ktv_ngay || '30',
    mac_dinh_hom_nay: (cauHinh.mac_dinh_hom_nay ?? '1') !== '0',
    auto_bao_tri: (cauHinh.auto_bao_tri ?? '1') !== '0',
    geocode_import: (cauHinh.geocode_import ?? '1') !== '0',
  })
  const [tabVis, setTabVis] = useState<Record<string, Record<string, boolean>>>(() => {
    let parsed: any = {}; try { parsed = JSON.parse(cauHinh.tab_visibility || '{}') } catch {}
    const merged: Record<string, Record<string, boolean>> = {}
    for (const [role] of TAB_ROLES) merged[role] = { ...DEFAULT_TAB_VIS[role], ...(parsed[role] || {}) }
    return merged
  })
  const [saving, setSaving] = useState(false)
  const toggleTab = (role: string, tab: string) => setTabVis(p => ({ ...p, [role]: { ...p[role], [tab]: !p[role][tab] } }))

  const save = async () => {
    setSaving(true)
    const items = {
      app_ten: cfg.app_ten, vp_lat: cfg.vp_lat, vp_lng: cfg.vp_lng,
      repeat_ngay: String(parseInt(cfg.repeat_ngay) || 30),
      hdbt_canh_bao_thang: String(parseInt(cfg.hdbt_canh_bao_thang) || 2),
      nguong_ton_thap: String(parseInt(cfg.nguong_ton_thap) || 0),
      phieu_cung_canh_bao_ngay: String(parseInt(cfg.phieu_cung_canh_bao_ngay) || 3),
      phien_van_phong_ngay: String(parseInt(cfg.phien_van_phong_ngay) || 7),
      phien_ktv_ngay: String(parseInt(cfg.phien_ktv_ngay) || 30),
      mac_dinh_hom_nay: cfg.mac_dinh_hom_nay ? '1' : '0',
      auto_bao_tri: cfg.auto_bao_tri ? '1' : '0',
      geocode_import: cfg.geocode_import ? '1' : '0',
      tab_visibility: JSON.stringify(tabVis),
    }
    try {
      const res = await fetch('/api/admin/cau-hinh', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) })
      if (res.ok) { showNotification('success', 'Đã lưu cài đặt hệ thống.'); onUpdateSuccess() }
      else { const e = await res.json(); showNotification('error', e.error) }
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setSaving(false) }
  }

  const numField = (label: string, key: 'repeat_ngay' | 'hdbt_canh_bao_thang' | 'nguong_ton_thap' | 'vp_lat' | 'vp_lng' | 'phien_van_phong_ngay' | 'phien_ktv_ngay' | 'phieu_cung_canh_bao_ngay', hint?: string, step?: string) => (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      <Input value={(cfg as any)[key]} onChange={(e) => setCfg({ ...cfg, [key]: e.target.value })} className="bg-white" inputMode="decimal" {...(step ? { step } : {})} />
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* CHUNG */}
      <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-4">
        <h3 className="text-lg font-semibold text-slate-700">Chung</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1 md:col-span-1">
            <label className="text-xs font-semibold text-slate-600">Tên ứng dụng (tiêu đề)</label>
            <Input value={cfg.app_ten} onChange={(e) => setCfg({ ...cfg, app_ten: e.target.value })} placeholder="VD: HAST Dashboard" className="bg-white" />
          </div>
          {numField('Vĩ độ VP (lat)', 'vp_lat', 'Dùng để tính KM tới khách', 'any')}
          {numField('Kinh độ VP (lng)', 'vp_lng', 'VD: 105.809180', 'any')}
        </div>
      </div>

      {/* NGHIỆP VỤ */}
      <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-4">
        <h3 className="text-lg font-semibold text-slate-700">Nghiệp vụ</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {numField('Cửa sổ "đã sửa gần đây" (ngày)', 'repeat_ngay', 'Đánh dấu máy vừa sửa trong N ngày')}
          {numField('Cảnh báo HĐBT trước (tháng)', 'hdbt_canh_bao_thang')}
          {numField('Ngưỡng tồn thấp (đỏ khi ≤)', 'nguong_ton_thap')}
          {numField('Cảnh báo trễ nộp phiếu (ngày)', 'phieu_cung_canh_bao_ngay')}
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={cfg.mac_dinh_hom_nay} onChange={(e) => setCfg({ ...cfg, mac_dinh_hom_nay: e.target.checked })} className="w-4 h-4 accent-blue-600" />
            Sổ công tác mặc định lọc việc hôm nay
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={cfg.auto_bao_tri} onChange={(e) => setCfg({ ...cfg, auto_bao_tri: e.target.checked })} className="w-4 h-4 accent-blue-600" />
            Tự đánh dấu bảo trì khi việc &quot;Bảo trì&quot; hoàn thành
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={cfg.geocode_import} onChange={(e) => setCfg({ ...cfg, geocode_import: e.target.checked })} className="w-4 h-4 accent-blue-600" />
            Tự tính tọa độ &amp; KM khi import CSV khách hàng (dòng thiếu Km)
          </label>
        </div>
      </div>

      {/* PHIÊN ĐĂNG NHẬP */}
      <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-4">
        <h3 className="text-lg font-semibold text-slate-700">Phiên đăng nhập</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {numField('Văn phòng — giữ đăng nhập (ngày)', 'phien_van_phong_ngay', 'Admin / Tech Admin / Staff. Áp dụng cho lần đăng nhập kế tiếp')}
          {numField('KTV (mật khẩu) — giữ đăng nhập (ngày)', 'phien_ktv_ngay', 'KTV đăng nhập bằng QR trên điện thoại vẫn giữ dài hạn riêng')}
        </div>
      </div>

      {/* PHÂN QUYỀN TAB */}
      <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-3">
        <h3 className="text-lg font-semibold text-slate-700">Phân quyền hiển thị tab</h3>
        <p className="text-sm text-slate-500">Bật/tắt tab lớn <b>và tab con</b> cho từng role. <b>Admin luôn thấy tất cả</b>; <b>Sổ công tác</b> luôn hiện; <b>Hệ thống</b> chỉ admin; <b>KTV</b> chỉ dùng app mobile. Tắt tab lớn sẽ ẩn toàn bộ tab con. Lưu ý: đây là ẩn/hiện giao diện — API vẫn kiểm quyền riêng.</p>
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden inline-block">
          <table className="text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Tab</th>
                {TAB_ROLES.map(([role, label]) => <th key={role} className="px-6 py-2 text-center font-semibold">{label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {TAB_TREE.flatMap(t => [
                <tr key={t.key}>
                  <td className="px-4 py-2 font-semibold text-slate-800">{t.label}</td>
                  {TAB_ROLES.map(([role]) => (
                    <td key={role} className="px-6 py-2 text-center">
                      <input type="checkbox" checked={!!tabVis[role]?.[t.key]} onChange={() => toggleTab(role, t.key)} className="w-4 h-4 accent-blue-600" />
                    </td>
                  ))}
                </tr>,
                ...t.subs.map(([sub, subLabel]) => (
                  <tr key={`${t.key}.${sub}`} className="bg-slate-50/40">
                    <td className="pl-10 pr-4 py-2 text-slate-600">↳ {subLabel}</td>
                    {TAB_ROLES.map(([role]) => {
                      const parentOn = !!tabVis[role]?.[t.key]
                      return (
                        <td key={role} className="px-6 py-2 text-center">
                          <input type="checkbox" disabled={!parentOn} checked={parentOn && (tabVis[role]?.[`${t.key}.${sub}`] ?? true)} onChange={() => toggleTab(role, `${t.key}.${sub}`)} className="w-4 h-4 accent-blue-600 disabled:opacity-40 disabled:cursor-not-allowed" />
                        </td>
                      )
                    })}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="h-10">{saving ? 'Đang lưu...' : 'Lưu cài đặt'}</Button>
      </div>
    </div>
  )
}

const BC_CAT_LABELS: [string, string][] = [
  ['LAP_MAY', 'Lắp máy'], ['SUA_MAY', 'Sửa máy'], ['GIAO_MUC', 'Giao mực'], ['THAY_VAT_TU', 'Thay vật tư'],
  ['BAO_TRI', 'Bảo trì'], ['CSKH', 'CSKH (đến tận nơi)'], ['HO_TRO_THAU', 'Hỗ trợ thầu'],
  ['HO_TRO_DAI_LY', 'Hỗ trợ đại lý'], ['KHAC', 'Khác'],
]
const BC_M2_ROWS: [string, string][] = [
  ['HDBT_SUM', 'Số máy có HĐBT'], ['ALL_RP_SUM', 'Máy phát sinh DV trong tháng'],
  ['LAP_MAY_SUM', 'Máy lắp trong tháng'], ['MAY_THUE_CPC_SUM', 'Máy thuê / CPC'], ['TONG_MAY', 'Tổng số máy dịch vụ'],
]

function BaoCaoThangTool({ showNotification }: { showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const now = new Date()
  const [thang, setThang] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [preview, setPreview] = useState<Record<string, any> | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [manual, setManual] = useState({
    DSO_MUC_VAT_TU: '', DSO_MAY_THUE_CPC: '0',
    TN6_1: '', TN6_2: '', TN6_3: '', TN7_1: '', TN7_2: '', TN7_3: '', TN7_4: '', KIEN_NGHI: '',
  })
  const setM = (k: string, v: string) => setManual(m => ({ ...m, [k]: v }))

  const loadPreview = async (t: string) => {
    setLoading(true); setPreview(null)
    try {
      const res = await fetch(`/api/admin/bao-cao?thang=${t}`)
      const json = await res.json()
      if (res.ok) setPreview(json.data)
      else showNotification('error', json.error)
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setLoading(false) }
  }
  useEffect(() => { loadPreview(thang) }, [thang]) // eslint-disable-line react-hooks/exhaustive-deps

  // ===== Doanh số theo tháng (nhập từ kế toán) — lưu DB =====
  const nam = thang.split('-')[0]
  const [dsoList, setDsoList] = useState<any[]>([])
  const [dsoForm, setDsoForm] = useState({ thang, thuc_te: '', ke_hoach: '' })
  const [dsoSaving, setDsoSaving] = useState(false)
  const fetchDso = async (y: string) => {
    try { const res = await fetch(`/api/admin/doanh-so?nam=${y}`); const j = await res.json(); if (res.ok) setDsoList(j.data || []) } catch { /* bỏ qua */ }
  }
  useEffect(() => { fetchDso(nam) }, [nam])
  const saveDso = async () => {
    if (!/^\d{4}-\d{2}$/.test(dsoForm.thang)) return showNotification('error', 'Chọn tháng hợp lệ')
    setDsoSaving(true)
    try {
      const res = await fetch('/api/admin/doanh-so', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thang_nam: dsoForm.thang, thuc_te: parseFloat(dsoForm.thuc_te) || 0, ke_hoach: parseFloat(dsoForm.ke_hoach) || 0 }),
      })
      if (res.ok) { showNotification('success', 'Đã lưu doanh số tháng.'); setDsoForm({ thang: dsoForm.thang, thuc_te: '', ke_hoach: '' }); fetchDso(nam); loadPreview(thang) }
      else { const j = await res.json(); showNotification('error', j.error) }
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setDsoSaving(false) }
  }
  const editDso = (r: any) => setDsoForm({ thang: r.thang_nam, thuc_te: String(Math.round(Number(r.thuc_te) || 0)), ke_hoach: String(Math.round(Number(r.ke_hoach) || 0)) })
  const fmtVnd = (s: string) => s ? Number(s).toLocaleString('vi-VN') : ''
  const onlyDigits = (s: string) => s.replace(/[^\d]/g, '')
  const delDso = async (tn: string) => {
    const res = await fetch(`/api/admin/doanh-so?thang_nam=${tn}`, { method: 'DELETE' })
    if (res.ok) { fetchDso(nam); loadPreview(thang) } else showNotification('error', 'Xóa không thành công')
  }

  const exportDocx = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/admin/bao-cao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thang, manual }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); showNotification('error', j.error || 'Xuất thất bại'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob); const a = document.createElement('a')
      const [y, m] = thang.split('-'); a.href = url; a.download = `Bao-cao-thang-${m}-${y}.docx`; a.click(); URL.revokeObjectURL(url)
      showNotification('success', 'Đã xuất báo cáo .docx — mở file để in & nộp.')
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setExporting(false) }
  }

  const manualInput = (k: keyof typeof manual, label: string, hint?: string) => (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      <Input value={manual[k]} onChange={(e) => setM(k, e.target.value)} className="bg-white" placeholder={hint} />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Chọn tháng + xuất */}
      <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Tháng báo cáo</label>
          <input type="month" value={thang} onChange={(e) => setThang(e.target.value)} className="h-10 px-3 rounded-md border border-slate-200 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 block" />
          <p className="text-xs text-slate-400 max-w-md">Số liệu Mục 1–5 tự tính theo tháng. Mục 3 (máy thuê/CPC, tỉ lệ, lũy kế) và Mục 6–8 nhập tay bên dưới. Báo cáo chỉ để in & nộp, không lưu.</p>
        </div>
        <Button onClick={exportDocx} disabled={exporting || loading || !preview} className="gap-2 h-10 shrink-0">
          <Download className="w-4 h-4" /> {exporting ? 'Đang xuất...' : 'Xuất báo cáo (.docx)'}
        </Button>
      </div>

      {loading && <p className="text-sm text-slate-400 text-center py-6">Đang tính số liệu tháng...</p>}

      {preview && (
        <>
          {/* MỤC 1 */}
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200"><h4 className="text-sm font-bold text-slate-700">1. Dịch vụ kỹ thuật</h4></div>
            <table className="w-full text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200">
                <tr><th className="px-4 py-2 text-left">Công việc</th><th className="px-4 py-2 text-center">Số vụ việc</th><th className="px-4 py-2 text-center">Số lượng</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {BC_CAT_LABELS.map(([k, l]) => (
                  <tr key={k}><td className="px-4 py-2">{l}</td><td className="px-4 py-2 text-center">{preview[`${k}_CNT`] ?? 0}</td><td className="px-4 py-2 text-center">{preview[`${k}_SUM`] ?? 0}</td></tr>
                ))}
                <tr className="font-bold bg-slate-50"><td className="px-4 py-2">TỔNG CỘNG</td><td className="px-4 py-2 text-center">{preview.VU_VIEC_SUM}</td><td className="px-4 py-2 text-center">{preview.SO_LUONG_SUM}</td></tr>
              </tbody>
            </table>
          </div>

          {/* MỤC 2 */}
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200"><h4 className="text-sm font-bold text-slate-700">2. Dịch vụ (theo hãng)</h4></div>
            <table className="w-full text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200">
                <tr><th className="px-4 py-2 text-left">Danh mục</th><th className="px-4 py-2 text-center">Konica</th><th className="px-4 py-2 text-center">Fuji</th><th className="px-4 py-2 text-center">Khác</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {BC_M2_ROWS.map(([k, l]) => (
                  <tr key={k} className={k === 'TONG_MAY' ? 'font-bold bg-slate-50' : ''}>
                    <td className="px-4 py-2">{l}</td>
                    <td className="px-4 py-2 text-center">{preview[`KONICA_${k}`] ?? 0}</td>
                    <td className="px-4 py-2 text-center">{preview[`FUJI_${k}`] ?? 0}</td>
                    <td className="px-4 py-2 text-center">{preview[`KHAC_${k}`] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* MỤC 3 */}
          <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-4">
            <h4 className="text-sm font-bold text-slate-700">3. Doanh số</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Doanh số Mực, Vật tư (số thực)</label>
                <Input value={manual.DSO_MUC_VAT_TU} onChange={(e) => setM('DSO_MUC_VAT_TU', e.target.value)} className="bg-white" placeholder={`tự tính: ${preview.dso_muc_vat_tu_goi_y} đ`} />
                <p className="text-xs text-slate-400">Tự tính từ vật tư: {preview.dso_muc_vat_tu_goi_y} đ. Để trống → dùng số tự tính.</p>
              </div>
              {manualInput('DSO_MAY_THUE_CPC', 'Doanh số máy thuê / CPC', '0')}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600 pt-1 border-t border-slate-200">
              <span className="pt-2">Lũy kế (T1 → tháng này): <b className="text-slate-800">{preview.DSO_LUY_KE} đ</b></span>
              <span className="pt-2">% hoàn thành: <b className="text-slate-800">{preview.TY_LE}%</b></span>
              <span className="pt-2 text-slate-400">(tự tính từ bảng doanh số bên dưới)</span>
            </div>
          </div>

          {/* BẢNG DOANH SỐ THEO THÁNG (KẾ TOÁN) */}
          <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-4">
            <h4 className="text-sm font-bold text-slate-700">Doanh số theo tháng (nhập từ kế toán) — năm {nam}</h4>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Tháng</label>
                <input type="month" value={dsoForm.thang} onChange={(e) => setDsoForm({ ...dsoForm, thang: e.target.value })} className="h-9 px-2 rounded-md border border-slate-200 text-sm bg-white block" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Thực tế</label>
                <Input className="bg-white w-44 text-right" inputMode="numeric" value={fmtVnd(dsoForm.thuc_te)} onChange={(e) => setDsoForm({ ...dsoForm, thuc_te: onlyDigits(e.target.value) })} placeholder="VD: 150.000.000" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Kế hoạch</label>
                <Input className="bg-white w-44 text-right" inputMode="numeric" value={fmtVnd(dsoForm.ke_hoach)} onChange={(e) => setDsoForm({ ...dsoForm, ke_hoach: onlyDigits(e.target.value) })} placeholder="VD: 200.000.000" />
              </div>
              <Button onClick={saveDso} disabled={dsoSaving} className="h-9">{dsoSaving ? 'Đang lưu...' : 'Lưu tháng'}</Button>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200">
                  <tr><th className="px-4 py-2 text-left">Tháng</th><th className="px-4 py-2 text-right">Thực tế</th><th className="px-4 py-2 text-right">Kế hoạch</th><th className="px-4 py-2 text-center">% HT</th><th className="px-4 py-2 text-right">Lũy kế</th><th className="px-4 py-2"></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dsoList.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Chưa nhập doanh số năm {nam}.</td></tr>
                  ) : [...dsoList].sort((a, b) => a.thang_nam < b.thang_nam ? -1 : 1).map((r, _i, arr) => {
                    const lk = arr.filter(x => x.thang_nam <= r.thang_nam).reduce((s, x) => s + (Number(x.thuc_te) || 0), 0)
                    const pct = Number(r.ke_hoach) > 0 ? Math.round(Number(r.thuc_te) / Number(r.ke_hoach) * 100) : 0
                    const [yy, mm] = r.thang_nam.split('-')
                    return (
                      <tr key={r.thang_nam} className="hover:bg-slate-50">
                        <td className="px-4 py-2 whitespace-nowrap">{mm}/{yy}</td>
                        <td className="px-4 py-2 text-right">{Number(r.thuc_te).toLocaleString('vi-VN')}</td>
                        <td className="px-4 py-2 text-right">{Number(r.ke_hoach).toLocaleString('vi-VN')}</td>
                        <td className="px-4 py-2 text-center">{pct}%</td>
                        <td className="px-4 py-2 text-right font-semibold text-slate-800">{lk.toLocaleString('vi-VN')}</td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          <button onClick={() => editDso(r)} className="text-blue-500 hover:text-blue-700 p-1"><PenSquare className="w-4 h-4" /></button>
                          <button onClick={() => delDso(r.thang_nam)} className="text-red-500 hover:text-red-700 p-1 ml-1"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* MỤC 4 & 5 (xem trước danh sách) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {([['4. Khiếu nại', 'khieu_nai'], ['5. Bảo hành vật tư', 'bao_hanh']] as const).map(([title, key]) => (
              <div key={key} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200"><h4 className="text-sm font-bold text-slate-700">{title}</h4></div>
                {(preview[key] || []).length === 0 ? (
                  <p className="text-xs text-slate-400 px-4 py-3">Không phát sinh trong tháng.</p>
                ) : (
                  <table className="w-full text-xs text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide border-b border-slate-200"><tr><th className="px-3 py-2 text-left">Khách hàng</th><th className="px-3 py-2 text-left">Nội dung</th><th className="px-3 py-2 text-left">Kết quả</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {(preview[key] || []).map((r: any, i: number) => (
                        <tr key={i}><td className="px-3 py-1.5">{r.khach}</td><td className="px-3 py-1.5">{r.noi_dung}</td><td className="px-3 py-1.5">{r.ket_qua}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>

          {/* MỤC 6 & 7 & 8 (nhập tay) */}
          <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-4">
            <h4 className="text-sm font-bold text-slate-700">6. Tòa nhà 5 Nguyễn Ngọc Vũ <span className="font-normal text-slate-400">(để trống = &quot;Hoạt động ổn định&quot;)</span></h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {manualInput('TN6_1', 'Thang máy', 'Hoạt động ổn định')}
              {manualInput('TN6_2', 'Điều hòa', 'Hoạt động ổn định')}
              {manualInput('TN6_3', 'Hạng mục khác', 'Hoạt động ổn định')}
            </div>
            <h4 className="text-sm font-bold text-slate-700 pt-2">7. Công việc khác</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {manualInput('TN7_1', 'Hệ thống mạng nội bộ, internet', 'Hoạt động ổn định')}
              {manualInput('TN7_2', 'Email Server và Web Server', 'Hoạt động ổn định')}
              {manualInput('TN7_3', 'Tổng đài nội bộ', 'Hoạt động ổn định')}
              {manualInput('TN7_4', 'PM Kế toán FAST và DVKT', 'Hoạt động ổn định')}
            </div>
            <h4 className="text-sm font-bold text-slate-700 pt-2">8. Kiến nghị / Đóng góp</h4>
            <textarea value={manual.KIEN_NGHI} onChange={(e) => setM('KIEN_NGHI', e.target.value)} rows={3} className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="Nhập kiến nghị (để trống nếu không có)..." />
          </div>
        </>
      )}
    </div>
  )
}

function CongNoTool({ showNotification }: { showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selIds, setSelIds] = useState<string[]>([])
  const [gop, setGop] = useState(true)
  const [rows, setRows] = useState<{ ten: string, dvt: string, sl: number, gia: number, vat: number, gc: string }[]>([])
  const [markups, setMarkups] = useState({ a: '3', b: '5', c: '6' })
  const [nam, setNam] = useState(String(new Date().getFullYear()))
  const [khTen, setKhTen] = useState('')
  const [khDiaChi, setKhDiaChi] = useState('')
  const [khSearch, setKhSearch] = useState('')
  const [exporting, setExporting] = useState(false)
  const [working, setWorking] = useState(false)

  const fetchList = async () => {
    setLoading(true)
    try { const res = await fetch('/api/admin/cong-no'); const j = await res.json(); if (res.ok) setList(j.data || []); else showNotification('error', j.error) }
    catch { showNotification('error', 'Lỗi kết nối!') } finally { setLoading(false) }
  }
  useEffect(() => { fetchList() }, [])

  // Gom phiếu theo điểm máy (mỗi khách = 1 máy)
  const custs = Array.from(list.reduce((m: Map<string, any>, t: any) => {
    const k = t.id_khach_hang
    if (!m.has(k)) m.set(k, { id: k, ten: t.soct_khach_hang?.ten_khach_hang || '—', dia_chi: t.soct_khach_hang?.dia_chi || '', tickets: [] })
    m.get(k).tickets.push(t)
    return m
  }, new Map<string, any>()).values())
  const selCusts = custs.filter(c => selIds.includes(c.id))
  const selTickets = selCusts.flatMap(c => c.tickets)

  const buildRows = (tickets: any[], gopMa: boolean) => {
    const lines = tickets.flatMap((t: any) => (t.soct_chi_tiet_vat_tu || []).map((v: any) => ({
      ten: v.soct_kho_hang?.ten_hang || v.ma_hang || '', sl: Number(v.so_luong) || 0, gia: Number(v.don_gia) || 0, vat: Number(v.vat) || 0,
    })))
    if (!gopMa) return lines.map((l: any) => ({ ...l, dvt: 'Cái', gc: '' }))
    const m = new Map<string, any>()
    for (const l of lines) { const k = `${l.ten}|${l.gia}|${l.vat}`; if (!m.has(k)) m.set(k, { ...l, dvt: 'Cái', gc: '' }); else m.get(k).sl += l.sl }
    return [...m.values()]
  }
  useEffect(() => { setRows(buildRows(selTickets, gop)) }, [selIds, gop]) // eslint-disable-line react-hooks/exhaustive-deps
  // Gợi ý "Kính gửi" theo điểm máy đầu tiên khi bắt đầu chọn
  const toggleSel = (c: any) => {
    setSelIds(prev => {
      const has = prev.includes(c.id)
      const next = has ? prev.filter(x => x !== c.id) : [...prev, c.id]
      if (!has && prev.length === 0) { setKhTen(c.ten); setKhDiaChi(c.dia_chi) }
      if (next.length === 0) { setKhTen(''); setKhDiaChi('') }
      return next
    })
  }

  const fmtN = (x: any) => (Number(x) || 0).toLocaleString('vi-VN')
  const digits = (s: string) => s.replace(/[^\d]/g, '')
  const upd = (i: number, f: string, v: any) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, [f]: v } : r))
  const addRow = () => setRows(rs => [...rs, { ten: '', dvt: 'Cái', sl: 1, gia: 0, vat: 8, gc: '' }])
  const delRow = (i: number) => setRows(rs => rs.filter((_, idx) => idx !== i))

  const baseCong = rows.reduce((s, r) => s + (Number(r.sl) || 0) * (Number(r.gia) || 0), 0)
  const baseThue = Math.round(rows.reduce((s, r) => s + (Number(r.sl) || 0) * (Number(r.gia) || 0) * (Number(r.vat) || 0) / 100, 0))

  const asciiFile = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'khach'

  const exportQuote = async () => {
    if (selCusts.length === 0 || rows.length === 0) return showNotification('error', 'Chưa có dữ liệu báo giá.')
    setExporting(true)
    try {
      const res = await fetch('/api/admin/cong-no', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ khach_hang: khTen, dia_chi: khDiaChi, nam, rows, markups: [parseFloat(markups.a) || 0, parseFloat(markups.b) || 0, parseFloat(markups.c) || 0] }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); showNotification('error', j.error || 'Xuất thất bại'); return }
      const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a')
      a.href = url; a.download = `Bao-gia-${asciiFile(khTen)}.docx`; a.click(); URL.revokeObjectURL(url)
      showNotification('success', 'Đã xuất báo giá .docx.')
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setExporting(false) }
  }

  const setStatus = async (trang_thai_hd: string) => {
    const ids = selTickets.map((t: any) => t.id)
    if (ids.length === 0) return
    setWorking(true)
    try {
      const res = await fetch('/api/admin/cong-no', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, trang_thai_hd }) })
      if (res.ok) { showNotification('success', `Đã cập nhật ${ids.length} phiếu → ${trang_thai_hd}.`); setSelIds([]); setKhTen(''); setKhDiaChi(''); fetchList() }
      else { const j = await res.json(); showNotification('error', j.error) }
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setWorking(false) }
  }

  const tongTien = list.reduce((s: number, t: any) => s + (t.soct_chi_tiet_vat_tu || []).reduce((a: number, v: any) => a + (Number(v.don_gia) || 0) * (Number(v.so_luong) || 0), 0), 0)

  return (
    <div className="space-y-6">
      <StatCards items={[
        { label: 'Khách có công nợ', value: custs.length.toLocaleString('vi-VN'), sub: 'chưa lên hóa đơn', icon: Users, tint: 'text-blue-600 bg-blue-50 ring-blue-100' },
        { label: 'Phiếu chưa HĐ', value: list.length.toLocaleString('vi-VN'), sub: 'có số phiếu', icon: ClipboardList, tint: 'text-amber-600 bg-amber-50 ring-amber-100' },
        { label: 'Tổng tiền (chưa VAT)', value: `${fmtN(tongTien)} đ`, sub: 'giá gốc vật tư', icon: Wallet, tint: 'text-indigo-600 bg-indigo-50 ring-indigo-100' },
      ]} />

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-semibold text-slate-600">Chọn điểm máy (có thể chọn nhiều để gộp 1 đơn vị)</label>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">{selIds.length} chọn · {selTickets.length} phiếu</span>
          <div className="relative w-full sm:w-64 ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Tìm tên khách..." className="pl-9 bg-white h-9" value={khSearch} onChange={e => setKhSearch(e.target.value)} />
          </div>
        </div>
        <div className="border border-slate-200 rounded-lg max-h-52 overflow-y-auto divide-y divide-slate-100">
          {custs.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Không có công nợ.</p>
          ) : custs.filter(c => !khSearch || c.ten.toLowerCase().includes(khSearch.trim().toLowerCase())).map(c => (
            <label key={c.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
              <input type="checkbox" checked={selIds.includes(c.id)} onChange={() => toggleSel(c)} className="w-4 h-4 accent-blue-600" />
              <span className="flex-1 text-slate-700">{c.ten}</span>
              <span className="text-xs text-slate-400 whitespace-nowrap">{c.tickets.length} phiếu · {c.tickets.map((t: any) => t.report).join(', ')}</span>
            </label>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 text-center py-6">Đang tải công nợ...</p>
      ) : selCusts.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">Chọn một hoặc nhiều điểm máy để lập báo giá.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Kính gửi (tên đơn vị)</label>
                <Input value={khTen} onChange={e => setKhTen(e.target.value)} className="bg-white" placeholder="Tên hiển thị trên báo giá" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Địa chỉ</label>
                <Input value={khDiaChi} onChange={e => setKhDiaChi(e.target.value)} className="bg-white" />
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none h-9">
                <input type="checkbox" checked={gop} onChange={e => setGop(e.target.checked)} className="w-4 h-4 accent-blue-600" /> Gộp theo mặt hàng
              </label>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Năm báo giá</label>
                <Input value={nam} onChange={e => setNam(digits(e.target.value))} className="bg-white w-24" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">% cạnh tranh (3 báo giá)</label>
                <div className="flex gap-1">
                  <Input value={markups.a} onChange={e => setMarkups({ ...markups, a: e.target.value })} className="bg-white w-16 text-center" />
                  <Input value={markups.b} onChange={e => setMarkups({ ...markups, b: e.target.value })} className="bg-white w-16 text-center" />
                  <Input value={markups.c} onChange={e => setMarkups({ ...markups, c: e.target.value })} className="bg-white w-16 text-center" />
                </div>
              </div>
              <Button variant="outline" onClick={addRow} className="gap-1 h-9"><Plus className="w-4 h-4" /> Thêm dòng</Button>
              <div className="ml-auto">
                <Button onClick={exportQuote} disabled={exporting} className="gap-2 h-9"><Download className="w-4 h-4" /> {exporting ? 'Đang xuất...' : 'Xuất báo giá (.docx)'}</Button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 w-8">TT</th>
                  <th className="px-3 py-2">Tên hàng hóa</th>
                  <th className="px-3 py-2 w-20">ĐVT</th>
                  <th className="px-3 py-2 w-16 text-center">SL</th>
                  <th className="px-3 py-2 w-32 text-right">Đơn giá</th>
                  <th className="px-3 py-2 w-16 text-center">VAT%</th>
                  <th className="px-3 py-2 w-32 text-right">Thành tiền</th>
                  <th className="px-3 py-2">Ghi chú</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-slate-400">Khách này chưa có vật tư trong các phiếu. Thêm dòng thủ công nếu cần.</td></tr>
                ) : rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-1.5"><Input value={r.ten} onChange={e => upd(i, 'ten', e.target.value)} className="h-8 bg-white" /></td>
                    <td className="px-3 py-1.5"><Input value={r.dvt} onChange={e => upd(i, 'dvt', e.target.value)} className="h-8 bg-white" /></td>
                    <td className="px-3 py-1.5"><Input value={String(r.sl)} onChange={e => upd(i, 'sl', parseInt(digits(e.target.value)) || 0)} className="h-8 bg-white text-center" /></td>
                    <td className="px-3 py-1.5"><Input value={fmtN(r.gia)} onChange={e => upd(i, 'gia', parseInt(digits(e.target.value)) || 0)} className="h-8 bg-white text-right" /></td>
                    <td className="px-3 py-1.5"><Input value={String(r.vat)} onChange={e => upd(i, 'vat', parseFloat(e.target.value.replace(',', '.')) || 0)} className="h-8 bg-white text-center" /></td>
                    <td className="px-3 py-1.5 text-right font-medium text-slate-700 whitespace-nowrap">{fmtN((Number(r.sl) || 0) * (Number(r.gia) || 0))}</td>
                    <td className="px-3 py-1.5"><Input value={r.gc} onChange={e => upd(i, 'gc', e.target.value)} className="h-8 bg-white" /></td>
                    <td className="px-3 py-1.5 text-center"><button onClick={() => delRow(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
              <span>Cộng: <b className="text-slate-800">{fmtN(baseCong)} đ</b></span>
              <span>Thuế GTGT: <b className="text-slate-800">{fmtN(baseThue)} đ</b></span>
              <span>Tổng cộng: <b className="text-slate-800">{fmtN(baseCong + baseThue)} đ</b></span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStatus('Đã báo giá')} disabled={working} className="h-9">Đánh dấu đã báo giá</Button>
              <Button onClick={() => setStatus('Đã lên hóa đơn')} disabled={working} className="h-9 bg-emerald-600 hover:bg-emerald-700">Đã lên hóa đơn</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const PHIEU_CUNG_COLS: ColDef[] = [
  { key: 'ngay', label: 'Ngày', locked: true },
  { key: 'report', label: 'Số phiếu', locked: true },
  { key: 'khach', label: 'Khách hàng' },
  { key: 'loai', label: 'Loại việc' },
  { key: 'ktv', label: 'KTV' },
  { key: 'ton', label: 'Tồn (ngày)' },
  { key: 'nop', label: 'Đã nộp', locked: true },
]

function PhieuCungTool({ nguongNgay, currentUserRole, showNotification }: { nguongNgay: number, currentUserRole: string, showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [reminding, setReminding] = useState(false)
  const [submittingAll, setSubmittingAll] = useState(false)
  const [fKtv, setFKtv] = useState('')
  const [fChuaNop, setFChuaNop] = useState(true)
  const [search, setSearch] = useState('')
  const col = useColView('phieu_cung', PHIEU_CUNG_COLS)

  const fetchList = async () => {
    setLoading(true)
    try { const res = await fetch('/api/admin/phieu-cung'); const j = await res.json(); if (res.ok) setList(j.data || []); else showNotification('error', j.error) }
    catch { showNotification('error', 'Lỗi kết nối!') } finally { setLoading(false) }
  }
  useEffect(() => { fetchList() }, [])

  const fmt = (s: string) => { if (!s) return ''; const d = new Date(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` }
  const daysOf = (s: string) => Math.floor((Date.now() - new Date(s).getTime()) / 86400000)

  const toggle = async (r: any) => {
    const res = await fetch('/api/admin/phieu-cung', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, da_nop_phieu: !r.da_nop_phieu }) })
    if (res.ok) fetchList(); else showNotification('error', 'Cập nhật không thành công')
  }

  const remind = async () => {
    setReminding(true)
    try {
      const res = await fetch('/api/admin/phieu-cung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const j = await res.json()
      if (res.ok) showNotification('success', j.message || `Đã nhắc ${j.sent} KTV qua Telegram${j.skipped ? `, bỏ qua ${j.skipped} (chưa liên kết)` : ''}.`)
      else showNotification('error', j.error)
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setReminding(false) }
  }

  const submitAll = async () => {
    setSubmittingAll(true)
    try {
      const res = await fetch('/api/admin/phieu-cung', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true, da_nop_phieu: true }) })
      const j = await res.json()
      if (res.ok) { showNotification('success', `Đã đánh dấu nộp ${j.count} phiếu.`); fetchList() }
      else showNotification('error', j.error)
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setSubmittingAll(false) }
  }

  const ktvs = Array.from(new Map(list.filter(r => r.ktv_id).map(r => [r.ktv_id, r.soct_users?.full_name || '—'])).entries())
  const filtered = list.filter(r => {
    if (fChuaNop && r.da_nop_phieu) return false
    if (fKtv === 'none' && r.ktv_id) return false
    if (fKtv && fKtv !== 'none' && r.ktv_id !== fKtv) return false
    if (search && !(r.report || '').toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })
  const chuaNop = list.filter(r => !r.da_nop_phieu)
  const quaHan = chuaNop.filter(r => daysOf(r.ngay) >= nguongNgay)
  const ktvNo = new Set(chuaNop.filter(r => r.ktv_id).map(r => r.ktv_id)).size
  const paged = usePaged(filtered)

  return (
    <div className="space-y-6">
      <StatCards items={[
        { label: 'Chưa nộp', value: chuaNop.length.toLocaleString('vi-VN'), sub: 'phiếu cần thu', icon: ClipboardList, tint: 'text-blue-600 bg-blue-50 ring-blue-100' },
        { label: 'Quá hạn', value: quaHan.length.toLocaleString('vi-VN'), sub: `tồn ≥ ${nguongNgay} ngày`, icon: AlertTriangle, tint: 'text-red-600 bg-red-50 ring-red-100' },
        { label: 'KTV còn nợ', value: ktvNo.toLocaleString('vi-VN'), sub: 'kỹ thuật viên', icon: Users, tint: 'text-amber-600 bg-amber-50 ring-amber-100' },
      ]} />

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Tìm số phiếu..." className="pl-9 bg-white" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select value={fKtv} onChange={e => setFKtv(e.target.value)} className="h-9 px-2 rounded-md border border-slate-200 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">KTV: Tất cả</option>
            <option value="none">Chưa giao</option>
            {ktvs.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={fChuaNop} onChange={e => setFChuaNop(e.target.checked)} className="w-4 h-4 accent-blue-600" /> Chỉ chưa nộp
          </label>
          <span className="text-xs text-slate-500 ml-auto whitespace-nowrap">{filtered.length} phiếu</span>
          <ColumnMenu view={col} />
          {currentUserRole === 'admin' && (
            <Button onClick={submitAll} disabled={submittingAll || chuaNop.length === 0} variant="outline" className="gap-2 h-9 border-emerald-200 text-emerald-700 hover:bg-emerald-50">{submittingAll ? 'Đang nộp...' : 'Nộp toàn bộ'}</Button>
          )}
          <Button onClick={remind} disabled={reminding || chuaNop.length === 0} variant="outline" className="gap-2 h-9">{reminding ? 'Đang nhắc...' : 'Nhắc KTV qua Telegram'}</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200">
              <tr>
                {col.show('ngay') && <th className="px-4 py-3">Ngày</th>}
                {col.show('report') && <th className="px-4 py-3">Số phiếu</th>}
                {col.show('khach') && <th className="px-4 py-3">Khách hàng</th>}
                {col.show('loai') && <th className="px-4 py-3">Loại việc</th>}
                {col.show('ktv') && <th className="px-4 py-3">KTV</th>}
                {col.show('ton') && <th className="px-4 py-3 text-center whitespace-nowrap">Tồn (ngày)</th>}
                {col.show('nop') && <th className="px-4 py-3 text-center">Đã nộp</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400">Đang tải...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400">Không có phiếu.</td></tr>
              ) : paged.pageItems.map(r => {
                const d = daysOf(r.ngay); const tre = !r.da_nop_phieu && d >= nguongNgay
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    {col.show('ngay') && <td className="px-4 py-3 whitespace-nowrap">{fmt(r.ngay)}</td>}
                    {col.show('report') && <td className="px-4 py-3 font-medium text-slate-800">{r.report}</td>}
                    {col.show('khach') && <td className="px-4 py-3">{r.soct_khach_hang?.ten_khach_hang || '—'}</td>}
                    {col.show('loai') && <td className="px-4 py-3">{r.loai_cong_viec}</td>}
                    {col.show('ktv') && <td className="px-4 py-3">{r.soct_users?.full_name || <span className="text-amber-600 italic">Chưa giao</span>}</td>}
                    {col.show('ton') && <td className={`px-4 py-3 text-center font-semibold ${tre ? 'text-red-600' : 'text-slate-500'}`}>{r.da_nop_phieu ? '—' : `${d}${tre ? ' ⚠️' : ''}`}</td>}
                    {col.show('nop') && <td className="px-4 py-3 text-center">
                      {r.da_nop_phieu ? (
                        <button onClick={() => toggle(r)} className="inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200" title={r.ngay_nop_phieu ? `Nộp ${fmt(r.ngay_nop_phieu)}` : ''}>Đã nộp</button>
                      ) : (
                        <button onClick={() => toggle(r)} className="inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-semibold border bg-slate-100 text-slate-500 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200">Đánh dấu nộp</button>
                      )}
                    </td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-2">
          <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} perPage={paged.perPage} onPage={paged.setPage} />
        </div>
      </div>
    </div>
  )
}

const IMPORT_JOB_COLS = ['Ngày', 'Mã máy', 'Loại việc', 'KTV', 'Số phiếu', 'Số lượng', 'KM', 'Ghi chú', 'Trạng thái', 'Mã hàng', 'SL vật tư', 'Đơn giá', 'VAT', 'HĐ']

function ImportJobsTool({ customers, technicians, inventory, onSuccess, showNotification }: {
  customers: any[]; technicians: any[]; inventory: any[]; onSuccess: () => void; showNotification: (type: 'success' | 'error', msg: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [parsed, setParsed] = useState<{ jobs: any[]; errors: string[]; matCount: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const cellToStr = (v: any): string => {
    if (v == null) return ''
    if (v instanceof Date) return `${String(v.getDate()).padStart(2, '0')}/${String(v.getMonth() + 1).padStart(2, '0')}/${v.getFullYear()}`
    if (typeof v === 'object') { if ('text' in v) return String((v as any).text); if ('result' in v) return String((v as any).result); if ('richText' in v) return (v as any).richText.map((t: any) => t.text).join(''); return '' }
    return String(v)
  }
  const digits = (s: any) => String(s).replace(/[^\d]/g, '')
  const truthy = (s: any) => ['x', '1', 'có', 'co', 'yes', 'true', '✓'].includes(String(s).trim().toLowerCase())

  const downloadTemplate = async () => {
    try {
      const mod: any = await import('exceljs'); const ExcelJS = mod.default ?? mod
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Phieu')
      ws.addRow(IMPORT_JOB_COLS).font = { bold: true }
      ws.addRow(['01/01/2026', '35953', 'Thay vật tư', 'Trần Kiên', 'RP-001', '1', '6', '', 'Hoàn thành', 'DR017', '1', '788000', '8', 'x'])
      ws.addRow(['01/01/2026', '35953', 'Thay vật tư', 'Trần Kiên', 'RP-001', '1', '6', '', 'Hoàn thành', 'TN326', '2', '500000', '8', 'x'])
      ws.addRow(['02/01/2026', '36151', 'Kiểm tra', '', '', '1', '5', 'Khách báo lỗi', 'Hoàn thành', '', '', '', '', ''])
      IMPORT_JOB_COLS.forEach((c, i) => { ws.getColumn(i + 1).width = Math.max(10, c.length + 3) })
      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'mau-phieu-giao-viec.xlsx'; a.click(); URL.revokeObjectURL(url)
    } catch { showNotification('error', 'Không tạo được file mẫu.') }
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setBusy(true)
    try {
      const mod: any = await import('exceljs'); const ExcelJS = mod.default ?? mod
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer())
      const ws = wb.worksheets[0]
      if (!ws) { showNotification('error', 'File Excel không có dữ liệu.'); return }
      const grid: string[][] = []
      ws.eachRow({ includeEmpty: false }, (row: any) => { const vals = row.values as any[]; grid.push(IMPORT_JOB_COLS.map((_, i) => cellToStr(vals[i + 1]))) })
      if (grid.length < 2) { showNotification('error', 'File trống hoặc chỉ có tiêu đề.'); return }
      const headers = grid[0].map(h => h.trim().toLowerCase())
      const cidx = IMPORT_JOB_COLS.map(c => headers.indexOf(c.toLowerCase()))
      const get = (line: string[], ci: number) => ((cidx[ci] >= 0 ? line[cidx[ci]] : line[ci]) ?? '').trim()

      // Gộp theo Số phiếu (col 4); phiếu không số -> mỗi dòng 1 phiếu
      const groups = new Map<string, string[][]>()
      for (let i = 1; i < grid.length; i++) {
        const line = grid[i]
        if (!line.some(c => c.trim() !== '')) continue
        const report = get(line, 4)
        const key = report || `__row_${i}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(line)
      }

      const custByMa = new Map(customers.filter(c => c.ma_may).map(c => [String(c.ma_may).toLowerCase(), c]))
      const ktvByName = new Map(technicians.filter(t => t.role === 'ktv').map(t => [String(t.full_name).trim().toLowerCase(), t]))
      const invSet = new Set(inventory.map(i => String(i.ma_hang).toLowerCase()))
      const jobs: any[] = []; const errors: string[] = []; let matCount = 0

      for (const [key, rows] of groups) {
        const first = rows[0]
        const maMay = get(first, 1)
        const cust = maMay ? custByMa.get(maMay.toLowerCase()) : undefined
        const loai = get(first, 2)
        if (!maMay || !cust) { errors.push(`Phiếu "${key}": mã máy "${maMay}" không có trong Khách hàng — bỏ qua`); continue }
        if (!loai) { errors.push(`Phiếu "${key}": thiếu Loại việc — bỏ qua`); continue }
        const ktvName = get(first, 3)
        const ktv = ktvName ? ktvByName.get(ktvName.toLowerCase()) : undefined
        if (ktvName && !ktv) errors.push(`Phiếu "${key}": KTV "${ktvName}" không khớp — để trống KTV`)
        const vat_tu: any[] = []
        for (const r of rows) {
          const mh = get(r, 9)
          if (!mh) continue
          if (!invSet.has(mh.toLowerCase())) { errors.push(`Phiếu "${key}": mã hàng "${mh}" không có trong Kho — bỏ dòng vật tư`); continue }
          vat_tu.push({ ma_hang: mh, so_luong: parseInt(digits(get(r, 10))) || 1, don_gia: parseInt(digits(get(r, 11))) || 0, vat: parseFloat(String(get(r, 12)).replace(',', '.')) || 0, hoa_don: truthy(get(r, 13)) })
        }
        matCount += vat_tu.length
        const hasHD = vat_tu.some(v => v.hoa_don)
        jobs.push({
          ngay: parseDDMMYYYY(get(first, 0)) || new Date().toISOString().split('T')[0],
          ma_may: maMay, id_khach_hang: cust.id, loai_cong_viec: loai,
          km: parseFloat(String(get(first, 6)).replace(',', '.')) || 0,
          so_luong: parseInt(digits(get(first, 5))) || 1,
          ktv_id: ktv?.id || null,
          report: get(first, 4) || null,
          ghi_chu: get(first, 7) || null,
          ket_qua: get(first, 8),
          trang_thai_hd: hasHD ? 'Đã lên hóa đơn' : 'Chưa hóa đơn',
          vat_tu,
        })
      }
      setParsed({ jobs, errors, matCount })
      if (jobs.length === 0) showNotification('error', 'Không có phiếu hợp lệ — xem danh sách lỗi.')
    } catch { showNotification('error', 'Không đọc được file Excel.') }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const doImport = async () => {
    if (!parsed || parsed.jobs.length === 0) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/cong-viec/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobs: parsed.jobs }) })
      const j = await res.json()
      if (res.ok) { showNotification('success', `Đã import ${j.count} phiếu, ${j.vatTu} dòng vật tư.`); setParsed(null); setOpen(false); onSuccess() }
      else showNotification('error', j.error)
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setBusy(false) }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2"><Upload className="w-4 h-4" /> Nhập Excel</Button>
      {open && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-slate-800">Nhập phiếu giao việc từ Excel</h2>
              <button onClick={() => { setOpen(false); setParsed(null) }} className="text-slate-400 hover:text-slate-600"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="text-sm text-slate-500 space-y-1">
                <p><b>Quan trọng:</b> import <b>Khách hàng</b> + <b>Kho hàng</b> trước (phiếu tham chiếu Mã máy & Mã hàng).</p>
                <p><b>Cột:</b> {IMPORT_JOB_COLS.join(' | ')}. Nhiều dòng <b>cùng Số phiếu</b> = 1 phiếu nhiều vật tư (thông tin phiếu lấy ở dòng đầu). Phiếu không có vật tư → để trống Mã hàng.</p>
                <p>Cột <b>HĐ</b>: ghi <code>x</code> nếu vật tư đã có hóa đơn. Trạng thái: Chờ nhận/Đang làm/Hoàn thành/Lắp tiếp (trống = Hoàn thành).</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={downloadTemplate} className="gap-2"><Download className="w-4 h-4" /> Tải file mẫu</Button>
                <input ref={fileRef} type="file" accept=".xlsx" onChange={onFile} className="hidden" />
                <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy} className="gap-2"><Upload className="w-4 h-4" /> Chọn file Excel</Button>
              </div>
              {parsed && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className="text-emerald-700 font-semibold">✓ {parsed.jobs.length} phiếu hợp lệ</span>
                    <span className="text-slate-600">{parsed.matCount} dòng vật tư</span>
                    {parsed.errors.length > 0 && <span className="text-amber-700 font-semibold">⚠ {parsed.errors.length} cảnh báo</span>}
                  </div>
                  {parsed.errors.length > 0 && (
                    <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 max-h-40 overflow-y-auto text-xs text-amber-800 space-y-0.5">
                      {parsed.errors.slice(0, 100).map((e, i) => <div key={i}>• {e}</div>)}
                      {parsed.errors.length > 100 && <div>… và {parsed.errors.length - 100} cảnh báo khác</div>}
                    </div>
                  )}
                  {parsed.jobs.length > 0 && (
                    <Button onClick={doImport} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 gap-2">{busy ? 'Đang nhập...' : `Xác nhận nhập ${parsed.jobs.length} phiếu`}</Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function DoiMatKhauTool({ showNotification }: { showNotification: (type: 'success' | 'error', msg: string) => void }) {
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
        setTimeout(() => { window.location.href = '/admin' }, 1600) // phiên đã bị xóa -> về màn đăng nhập
      }
      else showNotification('error', j.error)
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setSaving(false) }
  }
  return (
    <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 max-w-md space-y-4">
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
        <Input type="password" value={np2} onChange={e => setNp2(e.target.value)} className="bg-white" onKeyDown={e => { if (e.key === 'Enter') save() }} />
      </div>
      <Button onClick={save} disabled={saving} className="h-10">{saving ? 'Đang lưu...' : 'Lưu'}</Button>
    </div>
  )
}

const AUDIT_COLS: ColDef[] = [
  { key: 'thoi_gian', label: 'Thời gian', locked: true },
  { key: 'nguoi_dung', label: 'Người dùng' },
  { key: 'hanh_dong', label: 'Hành động', locked: true },
  { key: 'chi_tiet', label: 'Chi tiết' },
]

function AuditLogsTool({ showNotification }: { showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [limit, setLimit] = useState('50')
  const col = useColView('audit', AUDIT_COLS)
  const paged = usePaged(logs)

  const fetchLogs = async (lim: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/audit-logs?limit=${lim === 'all' ? '0' : lim}`)
      const j = await res.json()
      if (res.ok) setLogs(j.data || []); else showNotification('error', j.error)
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setLoading(false) }
  }
  useEffect(() => { fetchLogs(limit) }, [limit])

  const fmtTs = (s: string) => { const d = new Date(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}` }

  const exportTxt = () => {
    const lines = logs.map(l => `${fmtTs(l.created_at)}\t${l.user_name || ''} (${l.user_role || ''})\t${l.action}\t${l.detail || ''}`)
    const txt = ['Thời gian\tNgười dùng\tHành động\tChi tiết', ...lines].join('\r\n')
    const blob = new Blob(['﻿' + txt], { type: 'text/plain;charset=utf-8;' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.txt`; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold text-slate-700">Audit Logs</h3>
        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">{logs.length}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500">Hiển thị</span>
          <select value={limit} onChange={e => setLimit(e.target.value)} className="h-9 px-2 rounded-md border border-slate-200 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
            <option value="10">10</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="all">Toàn bộ</option>
          </select>
          <ColumnMenu view={col} />
          <Button variant="outline" onClick={exportTxt} className="gap-2 h-9"><Download className="w-4 h-4" /> Xuất .txt</Button>
        </div>
      </div>
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200">
            <tr>
              {col.show('thoi_gian') && <th className="px-4 py-2 whitespace-nowrap">Thời gian</th>}
              {col.show('nguoi_dung') && <th className="px-4 py-2">Người dùng</th>}
              {col.show('hanh_dong') && <th className="px-4 py-2">Hành động</th>}
              {col.show('chi_tiet') && <th className="px-4 py-2">Chi tiết</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Đang tải...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Chưa có log nào.</td></tr>
            ) : paged.pageItems.map(l => (
              <tr key={l.id} className="hover:bg-slate-50">
                {col.show('thoi_gian') && <td className="px-4 py-2 whitespace-nowrap text-xs">{fmtTs(l.created_at)}</td>}
                {col.show('nguoi_dung') && <td className="px-4 py-2 whitespace-nowrap">{l.user_name || '—'} <span className="text-xs text-slate-400 uppercase">{l.user_role}</span></td>}
                {col.show('hanh_dong') && <td className="px-4 py-2 font-medium text-slate-700 whitespace-nowrap">{l.action}</td>}
                {col.show('chi_tiet') && <td className="px-4 py-2 text-xs text-slate-500">{l.detail}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div className="px-4 pb-2">
          <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} perPage={paged.perPage} onPage={paged.setPage} />
        </div>
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
  { key: 'hang', label: 'Hãng máy' },
]

function DanhMucTool({ danhMuc, onUpdateSuccess, showNotification }: { danhMuc: any[], onUpdateSuccess: () => void, showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [nhom, setNhom] = useState('loai_cong_viec')
  const [newVal, setNewVal] = useState("")
  const [editId, setEditId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState("")

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
  return (
    <div className="space-y-6">
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
            <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide sticky top-0 border-b border-slate-200">
              <tr><th className="px-4 py-2 font-semibold">Giá trị</th><th className="px-4 py-2 font-semibold text-center w-28 whitespace-nowrap">Trạng thái</th><th className="px-4 py-2 font-semibold text-right w-28 whitespace-nowrap">Thao tác</th></tr>
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
                    <button onClick={() => call('PUT', { id: it.id, active: !it.active })} className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-semibold border ${it.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
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

const BAOTRI_COLS: ColDef[] = [
  { key: 'ma_may', label: 'Mã máy', locked: true },
  { key: 'khach', label: 'Khách hàng' },
  { key: 'ngay', label: 'Ngày' },
  { key: 'xoa', label: 'Xóa', locked: true },
]

function BaoTriTool({ customers, showNotification }: { customers: any[], showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const col = useColView('bao_tri', BAOTRI_COLS)
  const [thangNam, setThangNam] = useState(new Date().toISOString().slice(0, 7))
  const [text, setText] = useState("")
  const [preview, setPreview] = useState<{ ma_may: string, cust: any, excluded: boolean }[] | null>(null)
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  // Tra cứu lịch sử bảo trì theo 1 mã máy trong 1 năm
  const [traMa, setTraMa] = useState('')
  const [traNam, setTraNam] = useState(String(new Date().getFullYear()))
  const [traRes, setTraRes] = useState<{ ma_may: string, months: Set<number> } | null>(null)
  const [traLoading, setTraLoading] = useState(false)
  const tracuu = async () => {
    const ma = traMa.trim()
    if (!ma) return showNotification('error', 'Nhập mã máy để tra cứu')
    setTraLoading(true)
    try {
      const res = await fetch(`/api/admin/bao-tri?ma_may=${encodeURIComponent(ma)}&nam=${traNam}`)
      const j = await res.json()
      if (res.ok) setTraRes({ ma_may: ma, months: new Set((j.data || []).map((r: any) => parseInt(String(r.thang_nam).split('-')[1]))) })
      else showNotification('error', j.error)
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setTraLoading(false) }
  }

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
  const paged = usePaged(records)

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
      {/* Tra cứu lịch sử bảo trì theo mã máy (12 tháng của 1 năm) */}
      <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-4">
        <h3 className="text-sm font-bold text-slate-700">Tra cứu lịch sử bảo trì theo mã máy</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Mã máy</label>
            <Input value={traMa} onChange={e => setTraMa(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') tracuu() }} placeholder="VD: 35816" className="bg-white w-40" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Năm</label>
            <Input value={traNam} onChange={e => setTraNam(e.target.value.replace(/[^\d]/g, '').slice(0, 4))} className="bg-white w-24" />
          </div>
          <Button onClick={tracuu} disabled={traLoading} className="h-10 gap-2"><Search className="w-4 h-4" /> {traLoading ? 'Đang tra...' : 'Tra cứu'}</Button>
        </div>
        {traRes && (() => {
          const cust = customerByMaMay.get(traRes.ma_may.toLowerCase())
          return (
            <div className="space-y-2">
              <div className="text-sm text-slate-600">Máy <b className="font-mono">{traRes.ma_may}</b>{cust ? ` — ${cust.ten_khach_hang}` : ' — (không có trong Khách hàng)'} · năm {traNam} · <b className="text-emerald-700">{traRes.months.size}/12 tháng</b></div>
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                  const ok = traRes.months.has(m)
                  return (
                    <div key={m} className={`rounded-md border text-center py-2 ${ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                      <div className="text-[10px] font-semibold">T{m}</div>
                      <div className="text-sm font-bold">{ok ? '✓' : '✗'}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}
      </div>

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
          <div className="ml-auto flex items-center gap-2">
            <ColumnMenu view={col} />
            <ClearAllButton count={records.length} label={`bảo trì tháng ${thangNam.split('-').reverse().join('/')}`} onConfirm={async () => {
              const res = await fetch(`/api/admin/bao-tri?all=1&thang_nam=${thangNam}`, { method: 'DELETE' })
              if (res.ok) { showNotification('success', 'Đã xóa toàn bộ bảo trì tháng này.'); fetchRecords(thangNam) } else showNotification('error', 'Xóa không thành công')
            }} />
          </div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200 shadow-sm">
              <tr>
                {col.show('ma_may') && <th className="px-4 py-3 font-semibold">Mã máy</th>}
                {col.show('khach') && <th className="px-4 py-3 font-semibold">Khách hàng</th>}
                {col.show('ngay') && <th className="px-4 py-3 font-semibold">Ngày</th>}
                {col.show('xoa') && <th className="px-4 py-3 font-semibold text-center w-16">Xóa</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Đang tải...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Chưa có máy nào được đánh dấu bảo trì tháng này.</td></tr>
              ) : paged.pageItems.map((r) => {
                const kh = customerByMaMay.get(String(r.ma_may).toLowerCase())
                return (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    {col.show('ma_may') && <td className="px-4 py-3 font-mono font-medium text-slate-700">{r.ma_may}</td>}
                    {col.show('khach') && <td className="px-4 py-3">{kh ? kh.ten_khach_hang : <span className="text-slate-400 italic">Không khớp khách hàng</span>}</td>}
                    {col.show('ngay') && <td className="px-4 py-3 whitespace-nowrap">{formatDate(r.ngay)}</td>}
                    {col.show('xoa') && <td className="px-4 py-3 text-center">
                      <button onClick={() => handleDelete(r.id)} className="text-red-500 hover:text-red-700 p-1.5 bg-red-50 hover:bg-red-100 rounded-md transition"><Trash2 className="w-4 h-4" /></button>
                    </td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
          <div className="px-4 pb-2">
            <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} perPage={paged.perPage} onPage={paged.setPage} />
          </div>
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

const CUSTOMER_COLS: ColDef[] = [
  { key: 'ma_may', label: 'Mã máy', locked: true },
  { key: 'ten', label: 'Tên khách hàng', locked: true },
  { key: 'model', label: 'Model' },
  { key: 'hang', label: 'Hãng' },
  { key: 'km', label: 'KM' },
  { key: 'loai_hd', label: 'Loại HĐ' },
  { key: 'het_han', label: 'Hết hạn HĐBT' },
  { key: 'sua', label: 'Sửa', locked: true },
]

function CustomerListTool({ customers, loaiHdOptions, hangOptions, hdbtCanhBaoThang, onUpdateSuccess, showNotification }: { customers: any[], loaiHdOptions: string[], hangOptions: string[], hdbtCanhBaoThang: number, onUpdateSuccess: () => void, showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const col = useColView('customers', CUSTOMER_COLS)
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
          hang: editing.hang,
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

  const custStats = (() => {
    let hasHd = 0, expiring = 0, expired = 0
    for (const c of filtered) {
      if (c.loai_hd === 'HĐBT' || c.loai_hd === 'MF') hasHd++
      const exp = c.ngay_het_han_hdbt ? new Date(c.ngay_het_han_hdbt) : null
      if (exp) { if (exp < today) expired++; else if (exp <= limit) expiring++ }
    }
    return { total: filtered.length, hasHd, expiring, expired }
  })()

  const paged = usePaged(filtered)

  return (
    <div className="space-y-3">
      <StatCards items={[
        { label: 'Khách hàng', value: custStats.total.toLocaleString('vi-VN'), sub: `trên ${customers.length.toLocaleString('vi-VN')} tất cả`, icon: Users, tint: 'text-blue-600 bg-blue-50 ring-blue-100' },
        { label: 'Có hợp đồng', value: custStats.hasHd.toLocaleString('vi-VN'), sub: 'HĐBT / MF', icon: ClipboardCheck, tint: 'text-emerald-600 bg-emerald-50 ring-emerald-100' },
        { label: 'Sắp hết hạn', value: custStats.expiring.toLocaleString('vi-VN'), sub: `trong ${hdbtCanhBaoThang} tháng`, icon: Clock, tint: 'text-amber-600 bg-amber-50 ring-amber-100' },
        { label: 'Đã hết hạn', value: custStats.expired.toLocaleString('vi-VN'), sub: 'cần ký tiếp', icon: AlertTriangle, tint: 'text-red-600 bg-red-50 ring-red-100' },
      ]} />
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
          <ColumnMenu view={col} />
          <ClearAllButton count={customers.length} label="khách hàng" onConfirm={async () => {
            const res = await fetch('/api/admin/khach-hang?all=1', { method: 'DELETE' })
            if (res.ok) { showNotification('success', 'Đã xóa toàn bộ khách hàng.'); onUpdateSuccess() } else showNotification('error', 'Xóa không thành công')
          }} />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200 shadow-sm">
            <tr>
              {col.show('ma_may') && <th className="px-4 py-3 font-semibold">Mã máy</th>}
              {col.show('ten') && <th className="px-4 py-3 font-semibold">Tên khách hàng</th>}
              {col.show('model') && <th className="px-4 py-3 font-semibold">Model</th>}
              {col.show('hang') && <th className="px-4 py-3 font-semibold">Hãng</th>}
              {col.show('km') && <th className="px-4 py-3 font-semibold text-center">KM</th>}
              {col.show('loai_hd') && <th className="px-4 py-3 font-semibold text-center">Loại HĐ</th>}
              {col.show('het_han') && <th className="px-4 py-3 font-semibold text-center">Hết hạn HĐBT</th>}
              {col.show('sua') && <th className="px-4 py-3 font-semibold text-center w-16">Sửa</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {customers.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Chưa có khách hàng nào. Nhập dữ liệu ở mục bên dưới.</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Không tìm thấy khách hàng khớp từ khóa.</td></tr>
            ) : paged.pageItems.map((c) => {
              const hd = hdbtStatus(c.ngay_het_han_hdbt)
              return (
                <tr key={c.id} id={'kh-' + c.id} className={`transition-colors ${highlightCust === c.id ? 'bg-amber-100' : 'hover:bg-slate-50'}`}>
                  {col.show('ma_may') && <td className="px-4 py-3 font-mono font-medium text-slate-700">{c.ma_may || <span className="text-slate-400 italic">—</span>}</td>}
                  {col.show('ten') && <td className="px-4 py-3 font-medium text-slate-800">{c.ten_khach_hang}<div className="text-xs text-slate-400 font-normal truncate max-w-xs" title={c.dia_chi}>{c.dia_chi}</div></td>}
                  {col.show('model') && <td className="px-4 py-3">{c.model || <span className="text-slate-400 italic">—</span>}</td>}
                  {col.show('hang') && <td className="px-4 py-3">{c.hang || <span className="text-slate-400 italic">—</span>}</td>}
                  {col.show('km') && <td className="px-4 py-3 text-center whitespace-nowrap">{c.km_mac_dinh != null ? `${Number(c.km_mac_dinh).toLocaleString('vi-VN')}` : '—'}</td>}
                  {col.show('loai_hd') && <td className="px-4 py-3 text-center">{c.loai_hd || <span className="text-slate-300">—</span>}</td>}
                  {col.show('het_han') && <td className="px-4 py-3 text-center whitespace-nowrap">
                    {hd ? <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${hd.cls}`} title={hd.note}>{hd.label}</span> : <span className="text-slate-300">—</span>}
                  </td>}
                  {col.show('sua') && <td className="px-4 py-3 text-center">
                    <button onClick={() => setEditing({ ...c, ngay_het_han_hdbt: c.ngay_het_han_hdbt || "" })} className="text-blue-500 hover:text-blue-700 p-1.5 bg-blue-50 hover:bg-blue-100 rounded-md transition"><PenSquare className="w-4 h-4" /></button>
                  </td>}
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
        <div className="px-4 pb-2">
          <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} perPage={paged.perPage} onPage={paged.setPage} />
        </div>
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
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Hãng máy</label>
                <select className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white" value={editing.hang || ""} onChange={(e) => setEditing({ ...editing, hang: e.target.value })}>
                  <option value="">— Không —</option>
                  {hangOptions.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
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
