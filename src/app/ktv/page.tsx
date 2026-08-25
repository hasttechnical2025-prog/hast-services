"use client"

import { useState, useEffect, useCallback } from "react"
import { MapPin, Clipboard, CheckCircle, Play, AlertTriangle, RefreshCw, Inbox, Hand, Send, ChevronLeft, ChevronRight, Plus, Trash2, Calendar, CalendarClock, FileText, Settings, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import AccountSettings from "@/components/AccountSettings"
import NghiPhepDangKy from "@/components/NghiPhepDangKy"
import DateField from "@/components/DateField"
import { initClockOffset, startQueueSync, enqueueStatus, nowISO, onPendingChange } from "@/lib/status-queue"
import { phutGiua, lamTronPhut, fmtThoiLuong } from "@/lib/thoi-gian"
import { useRealtimeRefetch } from "@/lib/useRealtime"

// Kênh realtime: đồng bộ với lib/realtime.ts (server phát broadcast sau mỗi thay đổi việc)
const JOBS_TOPIC = "soct_jobs"
const JOBS_EVENT = "changed"

// Bot Telegram để KTV nhận thông báo việc gán riêng (liên kết 1 chạm)
const TELEGRAM_BOT_USERNAME = "HAST_Report_bot"

type Job = {
  id: string
  ngay: string
  ma_may: string
  loai_cong_viec: string
  km: number
  ket_qua: string
  ghi_chu: string
  report?: string
  da_nop_phieu?: boolean
  bat_dau_luc?: string | null
  hoan_thanh_luc?: string | null
  so_phut_xu_ly?: number | null
  ngay_hen?: string | null
  ktv_id: string | null
  ktv2_id: string | null
  moi_ktv_id?: string | null
  moi_boi?: string | null
  moi_ktv?: { full_name: string } | null
  moi_boi_user?: { full_name: string } | null
  soct_khach_hang: { ten_khach_hang: string; dia_chi: string; km_mac_dinh: number; vi_tri_dat_may?: string | null; model?: string | null }
  ktv2: { full_name: string } | null
  soct_chi_tiet_vat_tu: Array<{
    id: string
    ma_hang: string
    so_luong: number
    soct_kho_hang: { ten_hang: string }
  }>
}

type User = {
  id: string
  full_name: string
  role: string
  telegram_id: string | null
}

// Lần gần nhất của mã máy: lần trước làm gì / thay vật tư gì / ghi chú - tình trạng
type LastCall = {
  ngay: string
  loai_cong_viec: string | null
  ghi_chu_ktv: string | null
  ghi_chu: string | null
  vat_tu: string
}

export default function KtvMobileWeb() {
  const [currentKtv, setCurrentKtv] = useState<User | null>(null)

  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(false)
  const [activeJob, setActiveJob] = useState<Job | null>(null)
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  // Modal hủy nhận việc (kèm lý do tùy chọn)
  const [releaseTarget, setReleaseTarget] = useState<Job | null>(null)
  // Hộp thoại xác nhận thời lượng khi bấm Hoàn thành + số thao tác còn chờ đồng bộ
  const [finishTarget, setFinishTarget] = useState<{ jobId: string, phut: string } | null>(null)
  // Hộp thoại "Chưa hoàn thành": chọn NGÀY HẸN làm tiếp + giờ buổi này.
  const [chuaHtTarget, setChuaHtTarget] = useState<{ jobId: string, phut: string, ngay_hen: string } | null>(null)
  const [pendingSync, setPendingSync] = useState(0)
  const [claimConfirm, setClaimConfirm] = useState<Job | null>(null)
  // Chuyển việc KTV→KTV (lời mời): picker chọn người nhận + danh sách đồng nghiệp
  const [transferTarget, setTransferTarget] = useState<Job | null>(null)
  const [colleagues, setColleagues] = useState<{ id: string; full_name: string; nghi?: boolean; buoi?: string }[]>([])
  const [transferring, setTransferring] = useState(false)
  const [releaseReason, setReleaseReason] = useState("")
  const [releasing, setReleasing] = useState(false)

  // State phục vụ nghiệp vụ Báo cáo & Nhật ký KTV
  const [ktvTab, setKtvTab] = useState<"jobs" | "report" | "nghi">("jobs")
  const [selectedReportDate, setSelectedReportDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [reportData, setReportData] = useState<{ da_nop: boolean, thoi_gian_nop: string | null, jobs: any[], extraJobs: any[], ngayNghi: string[], tinhTrangOptions?: string[], choPhepNgay?: number } | null>(null)
  const [extraInput, setExtraInput] = useState("")
  const [submittingReport, setSubmittingReport] = useState(false)
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false)
  const [reportStatusByDate, setReportStatusByDate] = useState<Record<string, boolean>>({}) // lưu da_nop theo ngày để vẽ màu lịch nhanh
  const [loadingReport, setLoadingReport] = useState(false) // State loading khi chuyển ngày nộp báo cáo

  // State lưu trữ dữ liệu điền báo cáo tạm thời trong RAM (counter & ghi_chu_ktv)
  const [draftReports, setDraftReports] = useState<Record<string, { counter: string, ghi_chu_ktv: string, so_phut: string }>>({})

  // Lịch sử "lần gần nhất" (last call) của mã máy đang mở — hiển thị 1 dòng trong chi tiết ca
  const [lastCall, setLastCall] = useState<LastCall | null>(null)
  const [lastCallLoading, setLastCallLoading] = useState(false)
  // Bấm "Đang làm" -> bật ngay lịch sử máy (phần thưởng cho thao tác đúng, không phải nút chấm công)
  const [startedInfo, setStartedInfo] = useState<{ maMay: string, info: LastCall } | null>(null)

  // Ngày báo cáo (theo giờ VN): chỉ HÔM NAY / HÔM QUA mới sửa được; T7/CN/lễ = ngày nghỉ (không báo cáo)
  const vnTodayStr = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
  const vnYesterdayStr = new Date(Date.now() + 7 * 3600 * 1000 - 86400000).toISOString().slice(0, 10)
  const reportDow = new Date(selectedReportDate + 'T00:00:00Z').getUTCDay()
  const isRestDay = reportDow === 0 || reportDow === 6 || (reportData?.ngayNghi || []).includes(selectedReportDate)
  const reportDaysAgo = Math.round((Date.parse(vnTodayStr + 'T00:00:00Z') - Date.parse(selectedReportDate + 'T00:00:00Z')) / 86400000)
  // Số ngày lùi cho phép nộp/sửa (admin cấu hình; mặc định 7 khi chưa có dữ liệu)
  const choPhepNgay = reportData?.choPhepNgay ?? 7
  const reportEditable = reportDaysAgo >= 0 && reportDaysAgo <= choPhepNgay && !isRestDay
  const restDayLabel = reportDow === 0 ? 'Chủ Nhật' : reportDow === 6 ? 'Thứ 7' : 'Ngày lễ'

  // Tải thông tin báo cáo cho ngày cụ thể
  const fetchReportData = useCallback(async (ngay: string) => {
    setLoadingReport(true)
    try {
      const res = await fetch(`/api/ktv/bao-cao?ngay=${ngay}`)
      if (res.ok) {
        const json = await res.json()
        setReportData(json.data)
        if (json.data.statuses) {
          setReportStatusByDate(json.data.statuses)
        }
        // Nạp dữ liệu các ca máy hiện có vào draftReports để sửa
        const initialDrafts: Record<string, { counter: string, ghi_chu_ktv: string, so_phut: string }> = {}
        if (json.data.jobs) {
          json.data.jobs.forEach((j: any) => {
            initialDrafts[j.id] = {
              counter: j.counter != null ? String(j.counter) : "1", // mặc định Số vụ việc = 1
              ghi_chu_ktv: j.ghi_chu_ktv || "",
              so_phut: j.so_phut_xu_ly != null && j.so_phut_xu_ly > 0 ? String(j.so_phut_xu_ly) : ""
            }
          })
        }
        setDraftReports(initialDrafts)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingReport(false)
    }
  }, [])

  // Cập nhật nháp cục bộ trong RAM trước khi chốt nộp
  const handleUpdateDraftReport = (jobId: string, field: 'counter' | 'ghi_chu_ktv' | 'so_phut', value: string) => {
    setDraftReports(prev => ({
      ...prev,
      [jobId]: {
        ...prev[jobId] || { counter: "", ghi_chu_ktv: "", so_phut: "" },
        [field]: value
      }
    }))
  }

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 4000)
  }

  const [loginForm, setLoginForm] = useState({ username: "", password: "" })

  // Tải danh sách công việc (server đã tự lọc: việc của mình + việc pool chưa gán)
  // silent=true: refetch NGẦM (realtime/poll) — không bật spinner, không báo lỗi toast, tránh nhấp nháy.
  const fetchKtvJobs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetch('/api/admin/cong-viec')
      if (res.status === 401) {
        setCurrentKtv(null)
        setJobs([])
        showNotification('error', 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.')
        return
      }
      const json = await res.json()
      if (json.data) setJobs(json.data)
    } catch (err) {
      console.error(err)
      if (!silent) showNotification('error', "Không tải được danh sách công việc")
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  // Khôi phục phiên đăng nhập từ cookie httpOnly (qua API /api/auth/me)
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const { data: user } = await res.json()
          if (user.role === 'ktv') {
            setCurrentKtv(user)
            fetchKtvJobs()
            fetchReportData(selectedReportDate)
          }
        }
      } catch (err) {
        console.error('Không khôi phục được phiên đăng nhập:', err)
      }
    }
    restoreSession()
  }, [fetchKtvJobs, fetchReportData, selectedReportDate])

  // Hàng đợi offline: hiệu chỉnh đồng hồ + tự gửi lại thao tác khi có sóng.
  // Khi hàng đợi vừa rỗng (đồng bộ xong) -> tải lại để khớp trạng thái server.
  useEffect(() => {
    initClockOffset()
    const stopSync = startQueueSync()
    let prev = 0
    const unsub = onPendingChange((n) => {
      setPendingSync(n)
      if (n === 0 && prev > 0) fetchKtvJobs()
      prev = n
    })
    return () => { stopSync(); unsub() }
  }, [fetchKtvJobs])

  // Tải báo cáo khi đổi ngày hoặc đổi tab sang Báo cáo
  useEffect(() => {
    if (currentKtv && ktvTab === 'report') {
      fetchReportData(selectedReportDate)
    }
  }, [currentKtv, ktvTab, selectedReportDate, fetchReportData])

  // Tải "lần gần nhất" của mã máy khi mở chi tiết một ca
  useEffect(() => {
    if (!activeJob || !activeJob.ma_may) { setLastCall(null); return }
    let cancelled = false
    setLastCall(null)
    setLastCallLoading(true)
    fetch(`/api/ktv/lich-su?ma_may=${encodeURIComponent(activeJob.ma_may)}&exclude=${activeJob.id}`)
      .then(res => res.ok ? res.json() : { data: null })
      .then(json => { if (!cancelled) setLastCall(json.data) })
      .catch(() => { if (!cancelled) setLastCall(null) })
      .finally(() => { if (!cancelled) setLastCallLoading(false) })
    return () => { cancelled = true }
  }, [activeJob])

  // Thêm việc ngoài luồng (Optimistic UI: hiện ngay trên list rồi mới lưu)
  const handleAddExtraJob = async () => {
    if (!extraInput.trim()) return
    const tempId = 'temp_' + Date.now()
    const textToSave = extraInput.trim()

    // Cập nhật giao diện ngay lập tức
    setExtraInput("")
    if (reportData) {
      setReportData({
        ...reportData,
        extraJobs: [...reportData.extraJobs, { id: tempId, noi_dung: textToSave }]
      })
    }

    try {
      const res = await fetch('/api/ktv/bao-cao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_extra', ngay: selectedReportDate, noi_dung: textToSave })
      })
      if (res.ok) {
        // Tải lại để lấy ID thực tế từ database
        fetchReportData(selectedReportDate)
      } else {
        const err = await res.json()
        showNotification('error', err.error)
        fetchReportData(selectedReportDate) // Rollback nếu lỗi
      }
    } catch {
      showNotification('error', "Lỗi kết nối!")
      fetchReportData(selectedReportDate) // Rollback nếu lỗi
    }
  }

  // Xóa việc ngoài luồng
  const handleDeleteExtraJob = async (id: string) => {
    try {
      const res = await fetch('/api/ktv/bao-cao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_extra', ngay: selectedReportDate, id_extra: id })
      })
      if (res.ok) {
        fetchReportData(selectedReportDate)
        showNotification('success', "Đã xóa công việc.")
      } else {
        const err = await res.json()
        showNotification('error', err.error)
      }
    } catch {
      showNotification('error', "Lỗi kết nối!")
    }
  }

  // Chốt báo cáo ngày
  const handleSubmitDailyReport = async () => {
    setSubmittingReport(true)
    try {
      const jobsToSend = Object.entries(draftReports).map(([id, val]) => ({
        id,
        counter: val.counter,
        ghi_chu_ktv: val.ghi_chu_ktv,
        so_phut: val.so_phut
      }))

      const res = await fetch('/api/ktv/bao-cao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit_daily',
          ngay: selectedReportDate,
          jobs: jobsToSend
        })
      })
      if (res.ok) {
        showNotification('success', "Đã nộp báo cáo ngày thành công!")
        fetchReportData(selectedReportDate)
        setConfirmSubmitOpen(false)
      } else {
        const err = await res.json()
        showNotification('error', err.error)
      }
    } catch {
      showNotification('error', "Lỗi kết nối!")
    } finally {
      setSubmittingReport(false)
    }
  }

  // Mở lại báo cáo ngày (chuyển da_nop về false để sửa đổi)
  const handleOpenDailyReport = async () => {
    if (!confirm("Bạn có chắc chắn muốn mở lại báo cáo ngày này để bổ sung/chỉnh sửa tiếp?")) return
    try {
      const res = await fetch('/api/ktv/bao-cao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open_daily', ngay: selectedReportDate })
      })
      if (res.ok) {
        showNotification('success', "Đã mở lại báo cáo ngày.")
        fetchReportData(selectedReportDate)
      } else {
        const err = await res.json()
        showNotification('error', err.error)
      }
    } catch {
      showNotification('error', "Lỗi kết nối!")
    }
  }

  // Realtime "tự lành" cho pool việc: broadcast (tức thì) + mồi focus/mạng/nối-lại + poll 30s
  // dự phòng khi tab hiển thị (lỡ mất broadcast do WS chết ngầm vẫn tự khớp lại, khỏi phải F5).
  useRealtimeRefetch(JOBS_TOPIC, JOBS_EVENT, () => fetchKtvJobs(true), !!currentKtv, 30000)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/ktv/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      })

      if (res.ok) {
        const { data: user } = await res.json()
        setCurrentKtv(user)
        fetchKtvJobs()
        showNotification('success', `Chào mừng ${user.full_name} vào ca!`)
      } else {
        const err = await res.json()
        showNotification('error', err.error)
      }
    } catch (err) {
      showNotification('error', "Lỗi kết nối khi đăng nhập")
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (err) {
      console.error('Lỗi khi đăng xuất:', err)
    }
    // Về màn hình chọn vai trò (nơi có đăng nhập sinh trắc học)
    window.location.href = '/'
  }

  // Nhận việc: nếu việc chưa tới ngày (ngay > hôm nay) -> hỏi xác nhận để KTV khỏi lỡ tay
  const requestClaim = (job: Job) => {
    if (isFutureJob(job)) setClaimConfirm(job)
    else handleClaim(job.id)
  }

  // KTV nhận việc từ pool (atomic phía server; nếu người khác nhận trước sẽ báo lỗi)
  const handleClaim = async (jobId: string) => {
    try {
      const res = await fetch('/api/admin/cong-viec', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: jobId, claim: true })
      })
      if (res.ok) {
        showNotification('success', "Đã nhận việc! Việc đã chuyển vào 'Việc của tôi'.")
        setActiveJob(null)
        fetchKtvJobs()
      } else {
        const err = await res.json()
        showNotification('error', err.error || "Không nhận được việc")
        fetchKtvJobs()
      }
    } catch (error) {
      console.error(error)
      showNotification('error', "Lỗi kết nối mạng")
    }
  }

  // ===== CHUYỂN VIỆC KTV→KTV (lời mời) =====
  // Mở picker: tải danh sách đồng nghiệp (KTV active, trừ mình) rồi hiện modal chọn người nhận.
  const openTransfer = async (job: Job) => {
    setTransferTarget(job)
    if (colleagues.length === 0) {
      try {
        const res = await fetch('/api/ktv/dong-nghiep')
        const j = await res.json()
        if (res.ok && j.data) setColleagues(j.data)
      } catch { /* để rỗng, người dùng thấy "không có đồng nghiệp" */ }
    }
  }

  const putInvite = async (jobId: string, payload: any) => {
    const res = await fetch('/api/admin/cong-viec', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: jobId, ...payload })
    })
    return { ok: res.ok, j: await res.json().catch(() => ({})) }
  }

  // Bên MỜI (từ màn chi tiết): gửi / thu hồi lời mời -> cập nhật local ngay để badge phản ánh.
  const sendInvite = async (job: Job, ktvId: string, ktvName: string) => {
    setTransferring(true)
    try {
      const { ok, j } = await putInvite(job.id, { invite: true, moi_ktv_id: ktvId })
      if (ok) {
        const patch = { moi_ktv_id: ktvId, moi_ktv: { full_name: ktvName } }
        setJobs(prev => prev.map(x => x.id === job.id ? { ...x, ...patch } : x))
        setActiveJob(prev => (prev && prev.id === job.id) ? { ...prev, ...patch } : prev)
        setTransferTarget(null)
        showNotification('success', `Đã gửi lời mời cho ${ktvName}. Chờ đồng nghiệp bấm Nhận.`)
      } else showNotification('error', j.error || 'Không gửi được lời mời')
    } catch { showNotification('error', 'Lỗi kết nối mạng') }
    finally { setTransferring(false) }
  }
  const cancelInvite = async (job: Job) => {
    setTransferring(true)
    try {
      const { ok, j } = await putInvite(job.id, { cancelInvite: true })
      if (ok) {
        const patch = { moi_ktv_id: null, moi_ktv: null }
        setJobs(prev => prev.map(x => x.id === job.id ? { ...x, ...patch } : x))
        setActiveJob(prev => (prev && prev.id === job.id) ? { ...prev, ...patch } : prev)
        showNotification('success', 'Đã thu hồi lời mời.')
      } else showNotification('error', j.error || 'Không thu hồi được')
    } catch { showNotification('error', 'Lỗi kết nối mạng') }
    finally { setTransferring(false) }
  }

  // Bên ĐƯỢC MỜI (từ hộp thư lời mời): nhận / từ chối -> đổi quyền sở hữu, refetch cho chuẩn.
  const acceptInvite = async (jobId: string) => {
    setTransferring(true)
    try {
      const { ok, j } = await putInvite(jobId, { acceptInvite: true })
      if (ok) { showNotification('success', 'Đã nhận việc chuyển. Việc đã vào "Việc của tôi".'); setActiveJob(null); fetchKtvJobs() }
      else showNotification('error', j.error || 'Không nhận được việc')
    } catch { showNotification('error', 'Lỗi kết nối mạng') }
    finally { setTransferring(false) }
  }
  const declineInvite = async (jobId: string) => {
    setTransferring(true)
    try {
      const { ok, j } = await putInvite(jobId, { declineInvite: true })
      if (ok) { showNotification('success', 'Đã từ chối lời mời.'); setActiveJob(null); fetchKtvJobs() }
      else showNotification('error', j.error || 'Không từ chối được')
    } catch { showNotification('error', 'Lỗi kết nối mạng') }
    finally { setTransferring(false) }
  }

  // Đổi trạng thái qua HÀNG ĐỢI: cập nhật giao diện ngay (lạc quan) rồi tự gửi server
  // (kể cả sau khi có sóng trở lại) — không mất thao tác dưới hầm. so_phut chỉ dùng cho Hoàn thành.
  const applyStatus = (jobId: string, nextStatus: 'Đang làm' | 'Hoàn thành' | 'Chưa hoàn thành', so_phut?: number, ngay_hen?: string) => {
    const tapped = nowISO()
    setJobs(prev => prev.map(j => {
      if (j.id !== jobId) return j
      const patch: Partial<Job> = { ket_qua: nextStatus }
      if (nextStatus === 'Đang làm' && !j.bat_dau_luc) patch.bat_dau_luc = tapped
      // 'Chưa hoàn thành' cũng ghi giờ buổi (kết thúc buổi làm dở) + ngày hẹn.
      if (nextStatus === 'Hoàn thành' || nextStatus === 'Chưa hoàn thành') { patch.hoan_thanh_luc = tapped; if (so_phut != null) patch.so_phut_xu_ly = so_phut }
      if (nextStatus === 'Chưa hoàn thành' && ngay_hen) patch.ngay_hen = ngay_hen
      return { ...j, ...patch }
    }))
    enqueueStatus({ jobId, ket_qua: nextStatus, tapped_at: tapped, so_phut, ngay_hen })
    const online = typeof navigator === 'undefined' || navigator.onLine !== false
    showNotification('success', online ? `Đã chuyển trạng thái sang: ${nextStatus}` : 'Đã lưu — sẽ tự gửi khi có mạng.')
    if (nextStatus === 'Hoàn thành' || nextStatus === 'Chưa hoàn thành') setActiveJob(null)
    else if (activeJob && activeJob.id === jobId) setActiveJob(prev => prev ? { ...prev, ket_qua: nextStatus, ...(nextStatus === 'Đang làm' && !prev.bat_dau_luc ? { bat_dau_luc: tapped } : {}) } : null)
  }

  // Đang làm / Chưa hoàn thành: áp thẳng. Hoàn thành: mở hộp thoại xác nhận thời lượng.
  const handleUpdateStatus = (jobId: string, nextStatus: 'Đang làm' | 'Hoàn thành' | 'Chưa hoàn thành') => {
    if (nextStatus === 'Hoàn thành') {
      const job = jobs.find(j => j.id === jobId)
      const goiY = phutGiua(job?.bat_dau_luc, nowISO()) // mặc định = từ lúc bấm Đang làm tới giờ
      setFinishTarget({ jobId, phut: goiY == null ? '' : String(lamTronPhut(goiY, 5)) })
      return
    }
    if (nextStatus === 'Chưa hoàn thành') {
      const job = jobs.find(j => j.id === jobId)
      const goiY = phutGiua(job?.bat_dau_luc, nowISO())
      const todayVN = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
      setChuaHtTarget({ jobId, phut: goiY == null ? '' : String(lamTronPhut(goiY, 5)), ngay_hen: todayVN })
      return
    }
    applyStatus(jobId, nextStatus)

    // Bấm "Đang làm" -> thưởng ngay thông tin hữu ích: lần trước máy này làm gì.
    // Chỉ bật khi THỰC SỰ có lịch sử (không có thì im lặng, tránh làm phiền).
    if (nextStatus === 'Đang làm') {
      const job = jobs.find(j => j.id === jobId)
      const ma = job?.ma_may
      if (ma) {
        fetch(`/api/ktv/lich-su?ma_may=${encodeURIComponent(ma)}&exclude=${jobId}`)
          .then(r => r.ok ? r.json() : { data: null })
          .then(j => { if (j?.data) setStartedInfo({ maMay: ma, info: j.data }) })
          .catch(() => { })
      }
    }
  }

  // Hủy nhận việc (chỉ khi 'Đã nhận'): trả việc về pool + báo group cho người khác nhận
  const handleRelease = async () => {
    if (!releaseTarget) return
    setReleasing(true)
    try {
      const res = await fetch('/api/admin/cong-viec', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: releaseTarget.id, release: true, reason: releaseReason.trim() })
      })
      if (res.ok) {
        showNotification('success', "Đã hủy nhận việc — việc quay lại danh sách chờ nhận.")
        setReleaseTarget(null); setReleaseReason(""); setActiveJob(null); fetchKtvJobs()
      } else {
        const err = await res.json()
        showNotification('error', "Lỗi: " + (err.error || 'Không hủy được'))
      }
    } catch (error) {
      console.error(error)
      showNotification('error', "Lỗi kết nối mạng")
    } finally {
      setReleasing(false)
    }
  }

  // Format ngày
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  // Việc CHƯA TỚI NGÀY thực hiện (ngay > hôm nay) — nhãn + cảnh báo khi nhận
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const todayStr = ymd(new Date())
  const tomorrowStr = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return ymd(d) })()
  const jobDateStr = (job: Job) => String(job.ngay || '').slice(0, 10)
  const isFutureJob = (job: Job) => jobDateStr(job) > todayStr
  const isTomorrowJob = (job: Job) => jobDateStr(job) === tomorrowStr
  const futureLabel = (job: Job) => `${isTomorrowJob(job) ? 'Ngày mai' : 'Sắp tới'} · ${formatDate(job.ngay)}`

  // Phân loại: việc của tôi (đang hoạt động) và pool chờ nhận; ẩn việc đã Hoàn thành
  const myJobs = currentKtv
    ? jobs.filter(j => (j.ktv_id === currentKtv.id || j.ktv2_id === currentKtv.id) && j.ket_qua !== 'Hoàn thành')
    : []
  const poolJobs = jobs.filter(j => !j.ktv_id && j.ket_qua !== 'Hoàn thành')
  // Lời mời nhận việc gửi tới mình (người khác chuyển): việc vẫn của họ tới khi mình bấm Nhận.
  const invites = currentKtv
    ? jobs.filter(j => j.moi_ktv_id === currentKtv.id && j.ket_qua === 'Đã nhận')
    : []
  // Phiếu cứng đã hoàn thành nhưng chưa nộp bản giấy về VP
  const unreturned = currentKtv
    ? jobs.filter(j => j.ktv_id === currentKtv.id && j.ket_qua === 'Hoàn thành' && j.report && !j.da_nop_phieu)
    : []

  const statusBadge = (status: string) =>
    `${status === 'Hoàn thành' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
      status === 'Đang làm' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
      status === 'Chưa hoàn thành' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
      status === 'Đã nhận' ? 'bg-violet-50 text-violet-700 border border-violet-100' :
      'bg-slate-100 text-slate-600'}`

  const JobCard = ({ job, inPool }: { job: Job; inPool: boolean }) => (
    <div
      onClick={() => setActiveJob(job)}
      className={`bg-white p-4 rounded-xl shadow-sm border transition cursor-pointer space-y-3 ${inPool ? 'border-amber-200 hover:border-amber-300' : 'border-slate-200 hover:border-emerald-300'}`}
    >
      <div className="flex justify-between items-start">
        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusBadge(job.ket_qua)}`}>
          {inPool ? 'Chờ nhận' : job.ket_qua}
        </span>
        {isFutureJob(job)
          ? <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1"><CalendarClock className="w-3 h-3" />{futureLabel(job)}</span>
          : <span className="text-xs text-slate-400 font-mono">{formatDate(job.ngay)}</span>}
      </div>

      <div className="space-y-1">
        <h4 className="font-bold text-slate-800 text-base">{job.soct_khach_hang?.ten_khach_hang}</h4>
        <div className="text-xs text-slate-500 flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          <span className="truncate">{job.soct_khach_hang?.vi_tri_dat_may || job.soct_khach_hang?.dia_chi}</span>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-2 flex justify-between items-center text-xs text-slate-500">
        <div>Loại việc: <span className="font-semibold text-slate-700">{job.loai_cong_viec}</span></div>
        <div className="text-slate-400">Model: {job.soct_khach_hang?.model || job.ma_may || 'N/A'}</div>
      </div>

      {inPool && (
        <Button
          onClick={(e) => { e.stopPropagation(); requestClaim(job) }}
          className="w-full bg-amber-500 hover:bg-amber-600 text-white gap-2 h-10 text-sm rounded-lg"
        >
          <Hand className="w-4 h-4" /> Nhận việc này
        </Button>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      <header className="bg-emerald-600 text-white p-4 sticky top-0 shadow-md flex justify-between items-center z-20">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Clipboard className="w-5 h-5" /> Sổ công tác KTV
        </h1>
        {currentKtv && (
          <button onClick={handleLogout} className="text-xs bg-emerald-700 px-2 py-1 rounded text-emerald-100 hover:bg-emerald-800 transition">
            Đăng xuất
          </button>
        )}
      </header>

      {/* Thông báo dạng Banner trượt trên di động */}
      {notification && (
        <div className={`fixed top-4 left-4 right-4 z-50 p-3 rounded-lg shadow-lg text-white text-sm font-medium flex items-center justify-between border ${notification.type === 'success' ? 'bg-emerald-600 border-emerald-500' : 'bg-red-600 border-red-500'} transition-all`}>
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="font-bold opacity-75 hover:opacity-100">✕</button>
        </div>
      )}

      <main className="flex-1 p-4 max-w-md mx-auto w-full space-y-4">
        {/* MÀN HÌNH ĐĂNG NHẬP BAO MẬT */}
        {!currentKtv ? (
          <form onSubmit={handleLogin} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
            <button type="button" onClick={() => { window.location.href = '/' }} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600" title="Về màn hình chọn vai trò">
              <Home className="w-4 h-4" /> Trang chủ
            </button>
            <div className="text-center space-y-1">
              <h2 className="text-lg font-bold text-slate-800">KTV Đăng nhập nhận việc</h2>
              <p className="text-xs text-slate-400">Nhập tài khoản kỹ thuật viên của bạn</p>
            </div>

            <div className="space-y-4 pt-2">
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

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition"
              >
                {loading ? "Đang xác thực..." : "Đăng nhập"}
              </Button>
              <p className="text-[11px] text-slate-400 text-center">Đăng nhập vân tay / Face ID ở màn hình chọn vai trò (trang chủ).</p>
            </div>
          </form>
        ) : (
          /* MÀN HÌNH KTV ĐÃ VÀO CA */
          <div className="space-y-4">
            {/* Header thông tin KTV */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
              <div>
                <p className="text-xs text-slate-400">Nhân viên kỹ thuật</p>
                <h3 className="font-bold text-slate-800 text-base">{currentKtv.full_name}</h3>
              </div>
              <div className="flex items-center">
                <button onClick={() => fetchKtvJobs()} className="p-2 text-slate-400 hover:text-emerald-600 transition" title="Làm mới"><RefreshCw className="w-4 h-4" /></button>
                <button onClick={() => setShowSettings(true)} className="p-2 text-slate-400 hover:text-blue-600 transition" title="Cài đặt (vân tay, đổi mật khẩu)"><Settings className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Liên kết Telegram 1 chạm: chỉ hiện khi KTV chưa liên kết */}
            {!currentKtv.telegram_id ? (
              <a
                href={`https://t.me/${TELEGRAM_BOT_USERNAME}?start=${currentKtv.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold text-sm h-11 rounded-xl shadow-sm transition"
              >
                <Send className="w-4 h-4" /> Kết nối Telegram để nhận thông báo việc
              </a>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 px-1">
                <CheckCircle className="w-3.5 h-3.5" /> Đã kết nối Telegram nhận thông báo
              </div>
            )}

            {pendingSync > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Đang đồng bộ {pendingSync} thao tác — chờ có mạng, không cần bấm lại.
              </div>
            )}

            {!activeJob ? (
              <>
                {/* THANH TAB KTV */}
                <div className="flex gap-1 bg-slate-200 p-1 rounded-lg">
                  <button
                    onClick={() => setKtvTab("jobs")}
                    className={`flex-1 py-2 rounded-md font-semibold text-xs transition flex items-center justify-center gap-1.5 ${ktvTab === 'jobs' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    💼 Nhận việc
                  </button>
                  <button
                    onClick={() => setKtvTab("report")}
                    className={`flex-1 py-2 rounded-md font-semibold text-xs transition flex items-center justify-center gap-1.5 ${ktvTab === 'report' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    📝 Báo cáo ngày
                  </button>
                  <button
                    onClick={() => setKtvTab("nghi")}
                    className={`flex-1 py-2 rounded-md font-semibold text-xs transition flex items-center justify-center gap-1.5 ${ktvTab === 'nghi' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    🌴 Nghỉ phép
                  </button>
                </div>

                {ktvTab === "nghi" ? (
                  <NghiPhepDangKy notify={showNotification} />
                ) : ktvTab === "jobs" ? (
                  <>
                    {/* NHẮC: PHIẾU CỨNG CHƯA NỘP */}
                    {unreturned.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                          <h4 className="font-bold text-amber-800 text-sm">Còn {unreturned.length} phiếu chưa nộp bản cứng</h4>
                        </div>
                        <p className="text-xs text-amber-700 mb-2">Vui lòng hoàn trả phiếu giấy về văn phòng cho người phụ trách.</p>
                        <div className="flex flex-wrap gap-1.5">
                          {unreturned.map(j => (
                            <span key={j.id} className="text-xs font-mono bg-white text-amber-800 border border-amber-200 px-2 py-0.5 rounded">{j.report}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* MỤC 0: LỜI MỜI NHẬN VIỆC (người khác chuyển cho mình) */}
                    {invites.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 px-1">
                          <Send className="w-4 h-4 text-violet-600" />
                          <h4 className="font-bold text-violet-700 text-sm">Lời mời nhận việc</h4>
                          <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-semibold">{invites.length}</span>
                        </div>
                        {invites.map((job) => (
                          <div key={job.id} className="bg-white p-4 rounded-xl shadow-sm border border-violet-200 space-y-3">
                            <div className="flex justify-between items-start">
                              <span className="text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded">
                                {job.moi_boi_user?.full_name || 'KTV'} mời bạn
                              </span>
                              <span className="text-xs text-slate-400 font-mono">{formatDate(job.ngay)}</span>
                            </div>
                            <div className="space-y-1">
                              <h4 className="font-bold text-slate-800 text-base">{job.soct_khach_hang?.ten_khach_hang}</h4>
                              <div className="text-xs text-slate-500 flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                                <span className="truncate">{job.soct_khach_hang?.vi_tri_dat_may || job.soct_khach_hang?.dia_chi}</span>
                              </div>
                            </div>
                            <div className="border-t border-slate-100 pt-2 flex justify-between items-center text-xs text-slate-500">
                              <div>Loại việc: <span className="font-semibold text-slate-700">{job.loai_cong_viec}</span></div>
                              <div className="text-slate-400">Model: {job.soct_khach_hang?.model || job.ma_may || 'N/A'}</div>
                            </div>
                            <div className="flex gap-2">
                              <Button onClick={() => acceptInvite(job.id)} disabled={transferring}
                                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white gap-2 h-10 text-sm rounded-lg">
                                <CheckCircle className="w-4 h-4" /> Nhận việc
                              </Button>
                              <Button variant="outline" onClick={() => declineInvite(job.id)} disabled={transferring}
                                className="border-red-200 text-red-600 hover:bg-red-50 h-10 text-sm rounded-lg px-3 shrink-0">
                                Từ chối
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* MỤC 1: VIỆC CỦA TÔI */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 px-1">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        <h4 className="font-bold text-slate-700 text-sm">Việc của tôi</h4>
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">{myJobs.length}</span>
                      </div>

                      {loading && jobs.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-6">Đang đồng bộ công việc...</p>
                      ) : myJobs.length === 0 ? (
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 text-center text-slate-400 text-sm">
                          Bạn chưa nhận việc nào. Xem mục &quot;Chờ nhận&quot; bên dưới.
                        </div>
                      ) : (
                        myJobs.map((job) => <JobCard key={job.id} job={job} inPool={false} />)
                      )}
                    </div>

                    {/* MỤC 2: CHỜ NHẬN (POOL CHUNG) */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center gap-2 px-1">
                        <Inbox className="w-4 h-4 text-amber-600" />
                        <h4 className="font-bold text-slate-700 text-sm">Chờ nhận</h4>
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">{poolJobs.length}</span>
                      </div>

                      {poolJobs.length === 0 ? (
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 text-center text-slate-400 text-sm">
                          Không có việc nào đang chờ nhận.
                        </div>
                      ) : (
                        poolJobs.map((job) => <JobCard key={job.id} job={job} inPool={true} />)
                      )}
                    </div>
                  </>
                ) : (
                  /* TAB 2: BÁO CÁO NHẬT KÝ NGÀY */
                  <div className="space-y-4">
                    {/* CHỌN NGÀY: hôm nay + lịch chọn ngày */}
                    <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Báo cáo ngày</div>
                          <div className="font-bold text-slate-800 text-sm">
                            {formatDate(selectedReportDate)}
                            {reportDaysAgo === 0 && <span className="ml-1 text-emerald-600">· Hôm nay</span>}
                            {reportDaysAgo === 1 && <span className="ml-1 text-slate-500">· Hôm qua</span>}
                          </div>
                        </div>
                        <div className="relative shrink-0">
                          <button type="button" className="h-9 px-3 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium flex items-center gap-1.5 hover:bg-slate-50">
                            <Calendar className="w-4 h-4" /> Chọn ngày
                          </button>
                          <input
                            type="date"
                            max={vnTodayStr}
                            value={selectedReportDate}
                            onChange={(e) => { if (e.target.value) setSelectedReportDate(e.target.value) }}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            aria-label="Chọn ngày báo cáo"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setSelectedReportDate(vnTodayStr)} className={`flex-1 h-8 rounded-lg text-xs font-semibold border transition ${selectedReportDate === vnTodayStr ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>Hôm nay</button>
                        <button type="button" onClick={() => setSelectedReportDate(vnYesterdayStr)} className={`flex-1 h-8 rounded-lg text-xs font-semibold border transition ${selectedReportDate === vnYesterdayStr ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>Hôm qua</button>
                      </div>
                    </div>

                    {isRestDay ? (
                      <div className="bg-white p-6 rounded-xl border border-slate-200 text-center space-y-1">
                        <div className="text-3xl">🌴</div>
                        <div className="font-bold text-slate-700">{formatDate(selectedReportDate)} — {restDayLabel}</div>
                        <div className="text-sm text-slate-500">Không phải làm báo cáo.</div>
                      </div>
                    ) : reportData ? (
                      <div className={`space-y-4 transition-opacity duration-200 ${loadingReport ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                        {!reportEditable && !reportData.da_nop && (
                          <div className="bg-slate-100 text-slate-500 px-4 py-2 rounded-xl text-xs text-center">Chỉ xem — quá hạn nộp (chỉ nộp/sửa trong vòng {choPhepNgay} ngày).</div>
                        )}
                        {/* TRẠNG THÁI NỘP BÁO CÁO */}
                        {reportData.da_nop ? (
                          <div className="bg-emerald-50 text-emerald-800 px-4 py-3 rounded-xl border border-emerald-100 text-sm flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                            <div>
                              <div className="font-bold">Đã nộp báo cáo ngày này!</div>
                              {reportData.thoi_gian_nop && (
                                <div className="text-xs text-emerald-600">Thời gian nộp: {new Date(reportData.thoi_gian_nop).toLocaleTimeString('vi-VN')} ngày {formatDate(selectedReportDate)}</div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="bg-amber-50 text-amber-800 px-4 py-3 rounded-xl border border-amber-100 text-sm flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                            <div>
                              <div className="font-bold">Báo cáo ngày chưa được chốt!</div>
                              <div className="text-xs text-amber-600">Vui lòng nhập BÁO CÁO TÌNH TRẠNG MÁY và ghi thêm công việc khác (nếu có).</div>
                            </div>
                          </div>
                        )}

                        {/* PHẦN 1: VIỆC SỔ CÔNG TÁC TRONG NGÀY */}
                        <div className="space-y-3">
                          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">1. Phiếu sửa chữa ({reportData.jobs.length})</div>
                          {reportData.jobs.length === 0 ? (
                            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center text-xs text-slate-400 italic">
                              Không có phiếu công việc nào trong ngày này.
                            </div>
                          ) : (
                            reportData.jobs.map(j => (
                              <JobReportCard
                                key={j.id}
                                job={j}
                                readOnly={reportData.da_nop || !reportEditable}
                                draftVal={draftReports[j.id] || { counter: "1", ghi_chu_ktv: "" }}
                                onValueChange={(field, val) => handleUpdateDraftReport(j.id, field, val)}
                                options={reportData.tinhTrangOptions || []}
                              />
                            ))
                          )}
                        </div>

                        {/* PHẦN 2: VIỆC NGOÀI LUỒNG (VIỆC VẶT KHÁC) */}
                        <div className="space-y-3">
                          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">2. Công việc khác (Ngoài sổ)</div>

                          {/* Form thêm việc khác */}
                          {!reportData.da_nop && reportEditable && (
                            <div className="flex gap-2">
                              <Input
                                placeholder="VD: Giao giấy tờ giúp TGĐ, trực VP..."
                                className="text-xs h-9 bg-white flex-1"
                                value={extraInput}
                                onChange={(e) => setExtraInput(e.target.value)}
                              />
                              <Button
                                onClick={handleAddExtraJob}
                                className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 text-xs px-3"
                              >
                                <Plus className="w-4 h-4 mr-0.5" /> Thêm
                              </Button>
                            </div>
                          )}

                          {/* Danh sách việc khác đã thêm */}
                          {reportData.extraJobs.length === 0 ? (
                            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center text-xs text-slate-400 italic">
                              Chưa khai báo việc ngoài sổ.
                            </div>
                          ) : (
                            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                              {reportData.extraJobs.map((ej, index) => (
                                <div key={ej.id} className="p-3 flex justify-between items-center text-xs hover:bg-slate-50/50">
                                  <div className="flex gap-2 items-start text-slate-700 pr-2">
                                    <span className="text-slate-400 font-bold">{index + 1}.</span>
                                    <span className="leading-relaxed">{ej.noi_dung}</span>
                                  </div>
                                  {!reportData.da_nop && reportEditable && (
                                    <button
                                      onClick={() => handleDeleteExtraJob(ej.id)}
                                      className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 shrink-0"
                                      title="Xóa dòng này"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* CHỐT LẠI THỜI GIAN — phiếu bấm bù (2 nút cách nhau <2 phút) hoặc chưa khai.
                            Chốt ở đây thay vì ép chính xác ngoài hiện trường: lúc này KTV đang rảnh trí. */}
                        {!reportData.da_nop && reportEditable && (() => {
                          const canhBao = reportData.jobs.filter(j => {
                            if (j.ket_qua !== 'Hoàn thành') return false
                            const cach = phutGiua(j.bat_dau_luc, j.hoan_thanh_luc)
                            const chuaKhai = j.so_phut_xu_ly == null || j.so_phut_xu_ly <= 0
                            return chuaKhai || (cach != null && cach < 2)
                          })
                          if (canhBao.length === 0) return null
                          return (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                              <div className="text-xs font-bold text-amber-800">⏱ Cần xác nhận lại thời gian ({canhBao.length} ca)</div>
                              <p className="text-[11px] text-amber-700 leading-relaxed">
                                Các ca này bấm <b>Đang làm</b> và <b>Hoàn thành</b> gần như cùng lúc (hoặc chưa khai thời gian).
                                Nhập thời gian làm <b>thực tế</b> giúp nhé.
                              </p>
                              {canhBao.map(j => {
                                const val = draftReports[j.id]?.so_phut || ''
                                const num = parseInt(val || '0', 10) || 0
                                const set = (v: number) => handleUpdateDraftReport(j.id, 'so_phut', String(Math.max(0, v)))
                                return (
                                  <div key={j.id} className="bg-white rounded-lg border border-amber-100 p-2.5 space-y-2">
                                    <div className="text-xs text-slate-700">
                                      <b>{j.soct_khach_hang?.ten_khach_hang || '—'}</b>
                                      {j.ma_may && <span className="text-slate-400"> · máy {j.ma_may}</span>}
                                      {j.loai_cong_viec && <span className="text-slate-400"> · {j.loai_cong_viec}</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button type="button" onClick={() => set(num - 5)} className="w-8 h-8 rounded-lg border border-slate-200 text-slate-600">−</button>
                                      <div className="text-center min-w-[76px]">
                                        <div className={`text-base font-bold ${num > 0 ? 'text-slate-800' : 'text-red-500'}`}>{num > 0 ? fmtThoiLuong(num) : 'chưa khai'}</div>
                                        <div className="text-[10px] text-slate-400">{num} phút</div>
                                      </div>
                                      <button type="button" onClick={() => set(num + 5)} className="w-8 h-8 rounded-lg border border-slate-200 text-slate-600">+</button>
                                      <div className="flex flex-wrap gap-1 ml-auto">
                                        {[15, 30, 60, 90].map(m => (
                                          <button key={m} type="button" onClick={() => set(m)}
                                            className={`px-2 h-7 rounded-lg text-[11px] font-semibold border ${num === m ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                                            {fmtThoiLuong(m)}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })()}

                        {/* NÚT CHỐT NỘP BÁO CÁO NGÀY */}
                        {!reportData.da_nop && reportEditable && (() => {
                          // KTV bắt buộc phải chọn tình trạng máy (có dữ liệu ghi_chu_ktv trong draftReports) cho MỌI ca máy
                          const thieuTinhTrang = !reportData.jobs.every(j => {
                            const val = draftReports[j.id]
                            return !!(val && val.ghi_chu_ktv && val.ghi_chu_ktv.trim())
                          })
                          // ...và phải khai thời gian cho các ca bấm bù / chưa khai
                          const thieuThoiGian = reportData.jobs.some(j => {
                            if (j.ket_qua !== 'Hoàn thành') return false
                            const cach = phutGiua(j.bat_dau_luc, j.hoan_thanh_luc)
                            const chuaKhai = j.so_phut_xu_ly == null || j.so_phut_xu_ly <= 0
                            if (!(chuaKhai || (cach != null && cach < 2))) return false
                            return !((parseInt(draftReports[j.id]?.so_phut || '0', 10) || 0) > 0)
                          })
                          const canSubmit = !thieuTinhTrang && !thieuThoiGian
                          return (
                            <div className="pt-2">
                              <Button
                                onClick={() => setConfirmSubmitOpen(true)}
                                disabled={!canSubmit}
                                className={`w-full h-11 font-bold text-sm shadow-sm transition rounded-lg text-white ${canSubmit ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-300 cursor-not-allowed'}`}
                              >
                                🚀 Chốt và Gửi báo cáo ngày
                              </Button>
                              {thieuTinhTrang && (
                                <p className="text-[10px] text-center text-red-500 mt-1 font-medium">Bạn chưa chọn tình trạng máy cho một số ca phía trên.</p>
                              )}
                              {!thieuTinhTrang && thieuThoiGian && (
                                <p className="text-[10px] text-center text-red-500 mt-1 font-medium">Bạn chưa xác nhận thời gian cho các ca ở khung vàng phía trên.</p>
                              )}
                            </div>
                          )
                        })()}

                        {/* NÚT MỞ LẠI BÁO CÁO (CHỈ CHO PHÉP HÔM NAY VÀ HÔM QUA) */}
                        {reportData.da_nop && (() => {
                          const today = new Date(); today.setHours(0,0,0,0)
                          const reportD = new Date(selectedReportDate); reportD.setHours(0,0,0,0)
                          const diff = Math.round((today.getTime() - reportD.getTime()) / 86400000)
                          if (diff >= 0 && diff <= 1) { // chỉ cho phép hôm nay (0) và hôm qua (1)
                            return (
                              <div className="pt-2">
                                <Button
                                  onClick={handleOpenDailyReport}
                                  className="w-full h-11 border-blue-200 text-blue-700 hover:bg-blue-50 bg-white border font-semibold text-sm shadow-sm transition rounded-lg"
                                >
                                  🔓 Mở lại báo cáo ngày để bổ sung
                                </Button>
                              </div>
                            )
                          }
                          return null
                        })()}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 text-center py-8">Đang đồng bộ báo cáo...</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* MÀN HÌNH CHI TIẾT CÔNG VIỆC */
              <div className="space-y-4">
                <button
                  onClick={() => setActiveJob(null)}
                  className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-800"
                >
                  ← Trở lại danh sách
                </button>

                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-4">
                  {/* Status Banner */}
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <span className="text-xs font-mono text-slate-400">CHI TIẾT CA MÁY</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border
                      ${activeJob.ket_qua === 'Hoàn thành' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        activeJob.ket_qua === 'Đang làm' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        activeJob.ket_qua === 'Chưa hoàn thành' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        (activeJob.ktv_id && activeJob.ket_qua === 'Đã nhận') ? 'bg-violet-50 text-violet-700 border-violet-200' :
                        'bg-slate-100 text-slate-700 border-slate-200'}`}
                    >
                      {!activeJob.ktv_id ? 'Chờ nhận' : activeJob.ket_qua}
                    </span>
                  </div>

                  {/* Customer Info */}
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-slate-800 leading-tight">{activeJob.soct_khach_hang?.ten_khach_hang}</h3>

                    <div className="text-sm text-slate-600 flex items-start gap-1.5">
                      <MapPin className="w-4 h-4 shrink-0 text-slate-400 mt-0.5" />
                      <span>{activeJob.soct_khach_hang?.vi_tri_dat_may || activeJob.soct_khach_hang?.dia_chi}</span>
                    </div>
                  </div>

                  {activeJob.ktv2 && (
                    <div className="bg-violet-50 text-violet-700 px-3 py-2 rounded-lg border border-violet-100 text-xs flex items-center gap-2">
                      <div className="w-6 h-6 bg-violet-200 rounded-full flex items-center justify-center shrink-0">👥</div>
                      <div><b>Phân công:</b> Bạn đi làm cùng <b>{activeJob.ktv2.full_name}</b> (KTV kèm)</div>
                    </div>
                  )}

                  {/* Job Specs */}
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs text-slate-600">
                    <div>Model: <span className="font-bold text-slate-700">{activeJob.soct_khach_hang?.model || activeJob.ma_may || '-'}</span></div>
                    <div>Khoảng cách: <span className="font-bold text-slate-700">{activeJob.km} km</span></div>
                    <div>Loại việc: <span className="font-bold text-slate-700">{activeJob.loai_cong_viec}</span></div>
                    <div>Số phiếu (RP): <span className="font-bold text-slate-700 font-mono">{activeJob.report || 'N/A'}</span></div>
                  </div>

                  {/* Lần gần nhất (last call) của mã máy — lịch sử nhanh cho KTV */}
                  {activeJob.ma_may && (
                    <div className="text-xs bg-indigo-50/60 border border-indigo-100 rounded-lg px-3 py-2 text-slate-600 leading-relaxed">
                      {lastCallLoading ? (
                        <span className="text-slate-400 italic">Đang tra lịch sử máy…</span>
                      ) : lastCall ? (
                        <div className="space-y-0.5">
                          <div>
                            🕘 <b>Lần gần nhất:</b> {formatDate(lastCall.ngay)}
                            {lastCall.loai_cong_viec && <> · {lastCall.loai_cong_viec}</>}
                            {lastCall.ghi_chu_ktv && <> — <span className="italic">{lastCall.ghi_chu_ktv}</span></>}
                          </div>
                          {lastCall.vat_tu && <div>🔧 <b>Vật tư đã thay:</b> {lastCall.vat_tu}</div>}
                          {lastCall.ghi_chu && <div className="text-slate-500">📝 {lastCall.ghi_chu}</div>}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">🕘 Chưa có lịch sử cho mã máy này.</span>
                      )}
                    </div>
                  )}

                  {/* Vật tư dự kiến đi kèm */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-500 uppercase">Vật tư mang đi</h4>
                    {activeJob.soct_chi_tiet_vat_tu?.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Không có vật tư đi kèm ca này.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {activeJob.soct_chi_tiet_vat_tu?.map(vt => (
                          <div key={vt.id} className="flex justify-between items-center text-xs bg-slate-50 px-3 py-2 rounded border border-slate-100">
                            <div className="font-medium text-slate-700">{vt.soct_kho_hang?.ten_hang}</div>
                            <div className="font-mono text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-100">Mã: {vt.ma_hang} | <span className="font-bold text-slate-700">SL: {vt.so_luong}</span></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Ghi chú từ văn phòng */}
                  {activeJob.ghi_chu && (
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-slate-500 uppercase">Ghi chú từ văn phòng</h4>
                      <p className="text-xs text-slate-600 bg-amber-50 p-2.5 rounded-lg border border-amber-100 italic leading-relaxed">{activeJob.ghi_chu}</p>
                    </div>
                  )}

                  {/* NÚT THAO TÁC CỦA KTV */}
                  <div className="pt-2 border-t border-slate-100 flex gap-2">
                    {/* Việc trong pool: nút nhận việc */}
                    {(!activeJob.ktv_id && !activeJob.ktv2_id) && (
                      <Button
                        onClick={() => requestClaim(activeJob)}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-white gap-2 h-11 text-sm rounded-lg"
                      >
                        <Hand className="w-4 h-4" /> Nhận việc này
                      </Button>
                    )}

                    {/* Việc của mình, đã nhận nhưng chưa bắt đầu (gồm cả dữ liệu cũ còn 'Chờ nhận') */}
                    {(activeJob.ktv_id === currentKtv?.id || activeJob.ktv2_id === currentKtv?.id) && (activeJob.ket_qua === 'Đã nhận' || activeJob.ket_qua === 'Chờ nhận') && (
                      <>
                        <Button
                          onClick={() => handleUpdateStatus(activeJob.id, 'Đang làm')}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-2 h-11 text-sm rounded-lg"
                        >
                          <Play className="w-4 h-4" /> Bắt đầu làm việc
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => { setReleaseTarget(activeJob); setReleaseReason("") }}
                          className="border-red-200 text-red-600 hover:bg-red-50 gap-1.5 h-11 text-sm rounded-lg px-3 shrink-0"
                        >
                          <RefreshCw className="w-4 h-4" /> Hủy nhận
                        </Button>
                      </>
                    )}

                    {(activeJob.ktv_id === currentKtv?.id || activeJob.ktv2_id === currentKtv?.id) && activeJob.ket_qua === 'Đang làm' && (
                      <>
                        <Button
                          onClick={() => handleUpdateStatus(activeJob.id, 'Chưa hoàn thành')}
                          variant="outline"
                          className="w-1/2 border-amber-200 text-amber-700 hover:bg-amber-50 gap-2 h-11 text-sm rounded-lg"
                        >
                          <AlertTriangle className="w-4 h-4" /> Chưa hoàn thành
                        </Button>
                        <Button
                          onClick={() => handleUpdateStatus(activeJob.id, 'Hoàn thành')}
                          className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-11 text-sm rounded-lg"
                        >
                          <CheckCircle className="w-4 h-4" /> Hoàn thành
                        </Button>
                      </>
                    )}

                    {activeJob.ket_qua === 'Chưa hoàn thành' && (
                      <div className="w-full bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                        Đã kết thúc buổi làm dở{activeJob.ngay_hen ? <> — hẹn làm tiếp <b>{formatDate(activeJob.ngay_hen)}</b></> : ''}. Văn phòng sẽ tạo phiếu làm tiếp vào ngày hẹn.
                      </div>
                    )}
                  </div>

                  {/* Chuyển việc cho KTV khác (chỉ KTV chính, khi 'Đã nhận' — chưa bắt đầu) */}
                  {activeJob.ktv_id === currentKtv?.id && activeJob.ket_qua === 'Đã nhận' && (
                    <div className="pt-2">
                      {activeJob.moi_ktv_id ? (
                        <div className="flex items-center justify-between gap-2 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                          <span className="text-xs text-violet-700">⏳ Đang mời <b>{activeJob.moi_ktv?.full_name || 'KTV'}</b> nhận việc…</span>
                          <button onClick={() => cancelInvite(activeJob)} disabled={transferring} className="text-xs font-semibold text-red-600 hover:underline shrink-0">Thu hồi</button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => openTransfer(activeJob)}
                          className="w-full border-violet-200 text-violet-700 hover:bg-violet-50 gap-2 h-10 text-sm rounded-lg"
                        >
                          <Send className="w-4 h-4" /> Chuyển việc cho KTV khác
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {showSettings && <AccountSettings notify={(m, ok) => showNotification(ok ? 'success' : 'error', m)} onClose={() => setShowSettings(false)} />}

      {/* Modal chọn KTV để chuyển việc (gửi lời mời) */}
      {transferTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><Send className="w-5 h-5 text-violet-600" /> Chuyển việc cho</h3>
              <button onClick={() => setTransferTarget(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">✕</button>
            </div>
            <p className="px-4 pt-3 text-xs text-slate-500">Gửi <b>lời mời</b> — đồng nghiệp phải bấm "Nhận" thì việc mới chuyển. Bạn vẫn giữ việc cho tới lúc đó.</p>
            <div className="p-3 overflow-y-auto flex-1 min-h-0 space-y-1.5">
              {colleagues.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Không có KTV nào khác đang hoạt động.</p>
              ) : [...colleagues].sort((a, b) => Number(a.nghi) - Number(b.nghi)).map(c => (
                <button
                  key={c.id}
                  disabled={transferring}
                  onClick={() => sendInvite(transferTarget, c.id, c.full_name)}
                  className={`w-full text-left px-3 py-3 rounded-lg border text-sm font-medium disabled:opacity-50 flex items-center justify-between ${c.nghi ? 'border-slate-100 bg-slate-50 text-slate-400 hover:border-amber-200' : 'border-slate-200 text-slate-700 hover:border-violet-300 hover:bg-violet-50'}`}
                >
                  <span className="flex items-center gap-2">{c.full_name}{c.nghi && <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">nghỉ hôm nay</span>}</span>
                  <Send className={`w-4 h-4 ${c.nghi ? 'text-slate-300' : 'text-violet-400'}`} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal xác nhận hủy nhận việc (lý do tùy chọn) */}
      {releaseTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-5 space-y-3">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-red-500" /> Hủy nhận việc
              </h3>
              <p className="text-sm text-slate-600">
                Việc sẽ quay lại danh sách <b>chờ nhận</b> để KTV khác nhận hoặc văn phòng phân công lại. Nhập lý do (không bắt buộc) để văn phòng nắm được.
              </p>
              <textarea
                rows={3}
                className="w-full p-3 rounded-md border border-slate-200 text-sm focus:ring-2 focus:ring-red-400 outline-none"
                placeholder="VD: bận việc khác, ở xa, hết ca..."
                value={releaseReason}
                onChange={(e) => setReleaseReason(e.target.value)}
              />
            </div>
            <div className="bg-slate-50 p-4 flex justify-end gap-2 border-t border-slate-100">
              <Button variant="outline" onClick={() => { setReleaseTarget(null); setReleaseReason("") }} disabled={releasing}>Đóng</Button>
              <Button onClick={handleRelease} disabled={releasing} className="bg-red-600 hover:bg-red-700 text-white">
                {releasing ? 'Đang hủy...' : 'Xác nhận hủy nhận'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Xác nhận thời lượng khi HOÀN THÀNH — KTV chỉnh lại để bù đi bộ/mất sóng */}
      {/* Vừa bấm "Đang làm" -> hiện ngay lịch sử máy (lý do để KTV bấm đúng lúc) */}
      {startedInfo && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-5 space-y-3">
              <h3 className="text-base font-bold text-blue-700 flex items-center gap-2">
                <CalendarClock className="w-5 h-5" /> Máy {startedInfo.maMay} — lần trước
              </h3>
              <div className="text-sm text-slate-700 space-y-1.5 bg-slate-50 rounded-lg p-3">
                <div>🕘 <b>Ngày:</b> {formatDate(startedInfo.info.ngay)}{startedInfo.info.loai_cong_viec && <> · {startedInfo.info.loai_cong_viec}</>}</div>
                {startedInfo.info.vat_tu
                  ? <div>🔧 <b>Đã thay:</b> {startedInfo.info.vat_tu}</div>
                  : <div className="text-slate-400 italic">🔧 Lần trước không thay vật tư</div>}
                {startedInfo.info.ghi_chu_ktv && <div>📌 <b>Tình trạng:</b> <span className="italic">{startedInfo.info.ghi_chu_ktv}</span></div>}
                {startedInfo.info.ghi_chu && <div className="text-slate-500">📝 {startedInfo.info.ghi_chu}</div>}
              </div>
            </div>
            <div className="bg-slate-50 p-4 flex justify-end border-t border-slate-100">
              <Button onClick={() => setStartedInfo(null)} className="bg-blue-600 hover:bg-blue-700 text-white">Bắt đầu làm</Button>
            </div>
          </div>
        </div>
      )}

      {finishTarget && (() => {
        const phutNum = parseInt(finishTarget.phut || '0', 10) || 0
        const setPhut = (v: number) => setFinishTarget(f => f ? { ...f, phut: String(Math.max(0, v)) } : f)
        const QUICK = [15, 30, 45, 60, 90, 120]
        return (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
              <div className="p-5 space-y-3">
                <h3 className="text-base font-bold text-emerald-700 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" /> Hoàn thành phiếu
                </h3>
                <p className="text-sm text-slate-600">Thời gian xử lý phiếu này khoảng bao lâu? (làm tròn, chỉnh lại nếu cần)</p>
                <div className="flex items-center justify-center gap-3 py-1">
                  <button type="button" onClick={() => setPhut(phutNum - 5)} className="w-9 h-9 rounded-lg border border-slate-200 text-lg text-slate-600">−</button>
                  <div className="text-center min-w-[92px]">
                    <div className="text-xl font-bold text-slate-800">{fmtThoiLuong(phutNum) === '—' ? '0p' : fmtThoiLuong(phutNum)}</div>
                    <div className="text-[11px] text-slate-400">{phutNum} phút</div>
                  </div>
                  <button type="button" onClick={() => setPhut(phutNum + 5)} className="w-9 h-9 rounded-lg border border-slate-200 text-lg text-slate-600">+</button>
                </div>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {QUICK.map(m => (
                    <button key={m} type="button" onClick={() => setPhut(m)}
                      className={`px-2.5 h-8 rounded-lg text-xs font-semibold border ${phutNum === m ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                      {fmtThoiLuong(m)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-slate-50 p-4 flex justify-end gap-2 border-t border-slate-100">
                <Button variant="outline" onClick={() => setFinishTarget(null)}>Hủy</Button>
                <Button onClick={() => { const jid = finishTarget.jobId; setFinishTarget(null); applyStatus(jid, 'Hoàn thành', phutNum) }} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  Xác nhận hoàn thành
                </Button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* HỘP THOẠI "CHƯA HOÀN THÀNH": chọn ngày hẹn làm tiếp + giờ buổi này */}
      {chuaHtTarget && (() => {
        const phutNum = parseInt(chuaHtTarget.phut || '0', 10) || 0
        const setPhut = (v: number) => setChuaHtTarget(f => f ? { ...f, phut: String(Math.max(0, v)) } : f)
        const QUICK = [15, 30, 45, 60, 90, 120]
        return (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
              <div className="p-5 space-y-3">
                <h3 className="text-base font-bold text-amber-700 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" /> Chưa hoàn thành
                </h3>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Hẹn ngày làm tiếp <span className="text-red-500">*</span></label>
                  <DateField value={chuaHtTarget.ngay_hen} onChange={(v) => setChuaHtTarget(f => f ? { ...f, ngay_hen: v } : f)} heightClass="h-11" />
                  <p className="text-[11px] text-slate-400">Có thể chọn hôm nay hoặc ngày khác theo lịch hẹn khách. Đến ngày này, văn phòng sẽ được nhắc tạo phiếu làm tiếp.</p>
                </div>
                <div className="pt-1">
                  <p className="text-sm text-slate-600">Thời gian đã làm buổi này? (làm tròn, chỉnh nếu cần)</p>
                  <div className="flex items-center justify-center gap-3 py-1">
                    <button type="button" onClick={() => setPhut(phutNum - 5)} className="w-9 h-9 rounded-lg border border-slate-200 text-lg text-slate-600">−</button>
                    <div className="text-center min-w-[92px]">
                      <div className="text-xl font-bold text-slate-800">{fmtThoiLuong(phutNum) === '—' ? '0p' : fmtThoiLuong(phutNum)}</div>
                      <div className="text-[11px] text-slate-400">{phutNum} phút</div>
                    </div>
                    <button type="button" onClick={() => setPhut(phutNum + 5)} className="w-9 h-9 rounded-lg border border-slate-200 text-lg text-slate-600">+</button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {QUICK.map(m => (
                      <button key={m} type="button" onClick={() => setPhut(m)}
                        className={`px-2.5 h-8 rounded-lg text-xs font-semibold border ${phutNum === m ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                        {fmtThoiLuong(m)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="bg-slate-50 p-4 flex justify-end gap-2 border-t border-slate-100">
                <Button variant="outline" onClick={() => setChuaHtTarget(null)}>Hủy</Button>
                <Button
                  onClick={() => { if (!chuaHtTarget.ngay_hen) { showNotification('error', 'Chọn ngày hẹn làm tiếp.'); return } const t = chuaHtTarget; setChuaHtTarget(null); applyStatus(t.jobId, 'Chưa hoàn thành', phutNum, t.ngay_hen) }}
                  className="bg-amber-600 hover:bg-amber-700 text-white">
                  Xác nhận
                </Button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal cảnh báo nhận việc CHƯA TỚI NGÀY */}
      {claimConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-5 space-y-3">
              <h3 className="text-base font-bold text-amber-600 flex items-center gap-2">
                <CalendarClock className="w-5 h-5" /> Việc chưa tới ngày
              </h3>
              <p className="text-sm text-slate-600">
                Việc này dự kiến thực hiện vào <b>{formatDate(claimConfirm.ngay)}</b>{isTomorrowJob(claimConfirm) ? ' (ngày mai)' : ''} — <b>chưa tới ngày thực hiện</b>. Bạn vẫn muốn nhận việc bây giờ?
              </p>
              <div className="text-xs text-slate-500 bg-slate-50 rounded-md p-2 space-y-0.5">
                <div className="font-semibold text-slate-700">{claimConfirm.soct_khach_hang?.ten_khach_hang}</div>
                <div>Loại việc: {claimConfirm.loai_cong_viec} · Model: {claimConfirm.soct_khach_hang?.model || claimConfirm.ma_may || 'N/A'}</div>
              </div>
            </div>
            <div className="bg-slate-50 p-4 flex justify-end gap-2 border-t border-slate-100">
              <Button variant="outline" onClick={() => setClaimConfirm(null)}>Để sau</Button>
              <Button onClick={() => { const id = claimConfirm.id; setClaimConfirm(null); handleClaim(id) }} className="bg-amber-500 hover:bg-amber-600 text-white">
                Vẫn nhận việc
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal xác nhận chốt nộp báo cáo ngày */}
      {confirmSubmitOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-5 space-y-3">
              <h3 className="text-base font-bold text-amber-600 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Xác nhận chốt báo cáo
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Bạn có chắc chắn muốn chốt nộp báo cáo cho ngày này? <br/><br/>
                <b>Lưu ý:</b> Sau khi chốt, toàn bộ thông tin báo cáo ngày đó sẽ <b>KHÔNG</b> thể chỉnh sửa hoặc thêm bớt được nữa.
              </p>
            </div>
            <div className="bg-slate-50 p-4 flex justify-end gap-2 border-t border-slate-100">
              <Button variant="outline" onClick={() => setConfirmSubmitOpen(false)} disabled={submittingReport}>Quay lại</Button>
              <Button onClick={handleSubmitDailyReport} disabled={submittingReport} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                {submittingReport ? 'Đang xử lý...' : '🚀 Xác nhận nộp'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function JobReportCard({ job, readOnly, draftVal, onValueChange, options }: { job: any, readOnly: boolean, draftVal: { counter: string, ghi_chu_ktv: string }, onValueChange: (field: 'counter' | 'ghi_chu_ktv', value: string) => void, options: string[] }) {
  const tinhTrangOpts = options.length ? options : ['HĐBT', 'Làm giám định', 'Theo dõi thêm', 'Khác'] // fallback nếu admin chưa cấu hình
  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
      <div className="flex justify-between items-start">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
          {job.loai_cong_viec}
        </span>
        {job.report && <span className="text-[10px] text-slate-400 font-mono">Phiếu: {job.report}</span>}
      </div>

      <div className="space-y-1">
        <h4 className="font-bold text-slate-800 text-sm leading-snug">{job.soct_khach_hang?.ten_khach_hang}</h4>
        <div className="text-[11px] text-slate-400">Model: {job.soct_khach_hang?.model || job.ma_may || '—'}</div>
      </div>

      <div className="grid grid-cols-3 gap-2 items-end pt-1">
        <div className="col-span-1 space-y-1">
          <label className="text-[10px] font-semibold text-slate-500 uppercase block">Số vụ việc</label>
          <Input
            type="text"
            inputMode="numeric"
            disabled={readOnly}
            placeholder="1"
            className="h-8 text-xs text-center bg-slate-50 border-slate-200"
            value={draftVal.counter}
            onChange={(e) => onValueChange('counter', e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-[10px] font-semibold text-slate-500 uppercase block">Báo cáo tình trạng máy *</label>
          <select
            disabled={readOnly}
            className="w-full h-8 px-2 rounded-md border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 text-slate-700 font-medium"
            value={draftVal.ghi_chu_ktv}
            onChange={(e) => onValueChange('ghi_chu_ktv', e.target.value)}
          >
            <option value="">-- Chọn tình trạng máy --</option>
            {tinhTrangOpts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}
