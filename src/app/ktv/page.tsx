"use client"

import { useState, useEffect, useCallback } from "react"
import { MapPin, Clipboard, CheckCircle, Play, AlertTriangle, RefreshCw, Inbox, Hand, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"

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
  so_tien: number
  loai_thanh_toan: string
  ktv_id: string | null
  soct_khach_hang: { ten_khach_hang: string; dia_chi: string; km_mac_dinh: number }
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

export default function KtvMobileWeb() {
  const [currentKtv, setCurrentKtv] = useState<User | null>(null)

  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(false)
  const [activeJob, setActiveJob] = useState<Job | null>(null)
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 4000)
  }

  const [loginForm, setLoginForm] = useState({ username: "", password: "" })

  // Tải danh sách công việc (server đã tự lọc: việc của mình + việc pool chưa gán)
  const fetchKtvJobs = useCallback(async () => {
    setLoading(true)
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
      showNotification('error', "Không tải được danh sách công việc")
    } finally {
      setLoading(false)
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
          }
        }
      } catch (err) {
        console.error('Không khôi phục được phiên đăng nhập:', err)
      }
    }
    restoreSession()
  }, [fetchKtvJobs])

  // Realtime: lắng nghe tín hiệu thay đổi việc rồi refetch (pool tự cập nhật khi người khác nhận)
  useEffect(() => {
    if (!currentKtv) return
    const channel = supabase
      .channel(JOBS_TOPIC)
      .on('broadcast', { event: JOBS_EVENT }, () => { fetchKtvJobs() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentKtv, fetchKtvJobs])

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
    setCurrentKtv(null)
    setJobs([])
    setActiveJob(null)
    setLoginForm({ username: "", password: "" })
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

  const handleUpdateStatus = async (jobId: string, nextStatus: 'Đang làm' | 'Hoàn thành' | 'Lắp tiếp') => {
    try {
      const res = await fetch('/api/admin/cong-viec', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: jobId, ket_qua: nextStatus })
      })

      if (res.ok) {
        showNotification('success', `Đã chuyển trạng thái sang: ${nextStatus}`)
        fetchKtvJobs()
        // Việc hoàn thành sẽ bị ẩn khỏi danh sách -> đóng chi tiết
        if (nextStatus === 'Hoàn thành') {
          setActiveJob(null)
        } else if (activeJob && activeJob.id === jobId) {
          setActiveJob(prev => prev ? { ...prev, ket_qua: nextStatus } : null)
        }
      } else {
        const err = await res.json()
        showNotification('error', "Lỗi: " + err.error)
      }
    } catch (error) {
      console.error(error)
      showNotification('error', "Lỗi kết nối mạng")
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

  // Phân loại: việc của tôi (đang hoạt động) và pool chờ nhận; ẩn việc đã Hoàn thành
  const myJobs = currentKtv
    ? jobs.filter(j => j.ktv_id === currentKtv.id && j.ket_qua !== 'Hoàn thành')
    : []
  const poolJobs = jobs.filter(j => !j.ktv_id && j.ket_qua !== 'Hoàn thành')

  const statusBadge = (status: string) =>
    `${status === 'Hoàn thành' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
      status === 'Đang làm' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
      status === 'Lắp tiếp' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
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
        <span className="text-xs text-slate-400 font-mono">{formatDate(job.ngay)}</span>
      </div>

      <div className="space-y-1">
        <h4 className="font-bold text-slate-800 text-base">{job.soct_khach_hang?.ten_khach_hang}</h4>
        <div className="text-xs text-slate-500 flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          <span className="truncate">{job.soct_khach_hang?.dia_chi}</span>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-2 flex justify-between items-center text-xs text-slate-500">
        <div>Loại việc: <span className="font-semibold text-slate-700">{job.loai_cong_viec}</span></div>
        <div className="font-mono text-slate-400">Mã máy: {job.ma_may || 'N/A'}</div>
      </div>

      {inPool && (
        <Button
          onClick={(e) => { e.stopPropagation(); handleClaim(job.id) }}
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
                {loading ? "Đang xác thực..." : "Đăng nhập vào ca"}
              </Button>
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
              <button onClick={() => fetchKtvJobs()} className="p-2 text-slate-400 hover:text-emerald-600 transition" title="Làm mới">
                <RefreshCw className="w-4 h-4" />
              </button>
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

            {!activeJob ? (
              <>
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
                        activeJob.ket_qua === 'Lắp tiếp' ? 'bg-amber-50 text-amber-700 border-amber-200' :
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
                      <span>{activeJob.soct_khach_hang?.dia_chi}</span>
                    </div>
                  </div>

                  {/* Job Specs */}
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs text-slate-600">
                    <div>Mã máy: <span className="font-bold text-slate-700 font-mono">{activeJob.ma_may || '-'}</span></div>
                    <div>Khoảng cách: <span className="font-bold text-slate-700">{activeJob.km} km</span></div>
                    <div>Loại việc: <span className="font-bold text-slate-700">{activeJob.loai_cong_viec}</span></div>
                    <div>Số phiếu (RP): <span className="font-bold text-slate-700 font-mono">{activeJob.report || 'N/A'}</span></div>
                  </div>

                  {/* Báo cáo tài chính thu hộ (Nếu có) */}
                  {activeJob.so_tien > 0 && (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 flex justify-between items-center text-xs">
                      <span className="font-medium text-slate-600">Số tiền thu hộ ({activeJob.loai_thanh_toan}):</span>
                      <span className="font-bold text-blue-700 text-sm">{activeJob.so_tien.toLocaleString('vi-VN')} đ</span>
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
                    {!activeJob.ktv_id && (
                      <Button
                        onClick={() => handleClaim(activeJob.id)}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-white gap-2 h-11 text-sm rounded-lg"
                      >
                        <Hand className="w-4 h-4" /> Nhận việc này
                      </Button>
                    )}

                    {/* Việc của mình, chưa bắt đầu */}
                    {activeJob.ktv_id && activeJob.ket_qua === 'Chờ nhận' && (
                      <Button
                        onClick={() => handleUpdateStatus(activeJob.id, 'Đang làm')}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 h-11 text-sm rounded-lg"
                      >
                        <Play className="w-4 h-4" /> Bắt đầu làm việc
                      </Button>
                    )}

                    {activeJob.ktv_id && activeJob.ket_qua === 'Đang làm' && (
                      <>
                        <Button
                          onClick={() => handleUpdateStatus(activeJob.id, 'Lắp tiếp')}
                          variant="outline"
                          className="w-1/2 border-amber-200 text-amber-700 hover:bg-amber-50 gap-2 h-11 text-sm rounded-lg"
                        >
                          <AlertTriangle className="w-4 h-4" /> Lắp tiếp
                        </Button>
                        <Button
                          onClick={() => handleUpdateStatus(activeJob.id, 'Hoàn thành')}
                          className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-11 text-sm rounded-lg"
                        >
                          <CheckCircle className="w-4 h-4" /> Hoàn thành
                        </Button>
                      </>
                    )}

                    {activeJob.ktv_id && activeJob.ket_qua === 'Lắp tiếp' && (
                      <Button
                        onClick={() => handleUpdateStatus(activeJob.id, 'Hoàn thành')}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-11 text-sm rounded-lg"
                      >
                        <CheckCircle className="w-4 h-4" /> Hoàn thành
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
