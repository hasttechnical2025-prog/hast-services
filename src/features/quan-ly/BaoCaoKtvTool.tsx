'use client'
import { useState, useEffect } from 'react'
import { RefreshCw, Download, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import DateField from '@/components/DateField'
import { fmtThoiLuong } from '@/lib/thoi-gian'
import { BoxLoading } from '@/ui'

// Port NGUYÊN BaoCaoKtvTool từ admin (y hệt). Gọi lại /api/admin/bao-cao-ktv.
export function BaoCaoKtvTool({ technicians, showNotification }: { technicians: any[], showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [ktvId, setKtvId] = useState('')
  const [tuNgay, setTuNgay] = useState(() => {
    const d = new Date()
    let count = 0
    while (count < 2) { d.setDate(d.getDate() - 1); if (d.getDay() !== 0 && d.getDay() !== 6) count++ }
    return d.toISOString().split('T')[0]
  })
  const [denNgay, setDenNgay] = useState(() => {
    const d = new Date()
    let count = 0
    while (count < 1) { d.setDate(d.getDate() - 1); if (d.getDay() !== 0 && d.getDay() !== 6) count++ }
    return d.toISOString().split('T')[0]
  })

  const [data, setData] = useState<{ trang_thai: any[], jobs: any[], extras: any[] }>({ trang_thai: [], jobs: [], extras: [] })
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [openKey, setOpenKey] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (ktvId) q.set('ktv_id', ktvId)
      if (tuNgay) q.set('tu_ngay', tuNgay)
      if (denNgay) q.set('den_ngay', denNgay)
      const res = await fetch(`/api/admin/bao-cao-ktv?${q.toString()}`)
      const j = await res.json()
      if (res.ok) setData(j.data)
      else showNotification('error', j.error)
    } catch {
      showNotification('error', 'Lỗi kết nối khi tải báo cáo!')
    } finally {
      setData(prev => prev)
      setLoading(false)
    }
  }

  const exportReportDocx = async () => {
    if (!ktvId) return showNotification('error', 'Vui lòng chọn 1 KTV để xuất báo cáo')
    if (tuNgay !== denNgay) return showNotification('error', 'Báo cáo in ấn ký giấy yêu cầu chọn xuất theo từng ngày cụ thể (Từ ngày và Đến ngày phải trùng nhau)')
    setExporting(true)
    try {
      const res = await fetch('/api/admin/bao-cao-ktv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ktv_id: ktvId, ngay: tuNgay }) })
      if (!res.ok) { const j = await res.json().catch(() => ({})); showNotification('error', j.error || 'Xuất báo cáo thất bại'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ktvObj = technicians.find(t => t.id === ktvId)
      const ktvName = ktvObj ? ktvObj.full_name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '-') : 'ktv'
      a.download = `Bao-cao-nhat-ky-${ktvName}-${tuNgay.split('-').reverse().join('-')}.docx`
      a.click()
      URL.revokeObjectURL(url)
      showNotification('success', 'Đã xuất báo cáo KTV .docx thành công')
    } catch {
      showNotification('error', 'Lỗi kết nối khi xuất báo cáo!')
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => { fetchData() }, [ktvId, tuNgay, denNgay]) // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (s: string) => { if (!s) return ''; const d = new Date(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` }

  const reportDays = Array.from(new Set([
    ...data.trang_thai.map(t => t.ngay_bao_cao),
    ...data.jobs.map(j => j.ngay),
    ...data.extras.map(e => e.ngay)
  ])).sort().reverse()

  const tgList = data.jobs.map((j: any) => Number(j.so_phut_xu_ly)).filter((p: number) => p > 0 && p <= 240)
  const tgTB = tgList.length ? Math.round(tgList.reduce((s: number, p: number) => s + p, 0) / tgList.length) : null

  const tgByType = (() => {
    const m = new Map<string, number[]>()
    for (const j of data.jobs as any[]) {
      const p = Number(j.so_phut_xu_ly)
      if (!(p > 0 && p <= 240)) continue
      const loai = String(j.loai_cong_viec || '').trim() || 'Khác'
      if (!m.has(loai)) m.set(loai, [])
      m.get(loai)!.push(p)
    }
    return [...m.entries()]
      .map(([loai, arr]) => ({ loai, n: arr.length, tb: Math.round(arr.reduce((s, p) => s + p, 0) / arr.length) }))
      .sort((a, b) => b.n - a.n)
  })()

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-3 shadow-sm">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Kỹ thuật viên</label>
          <select value={ktvId} onChange={(e) => setKtvId(e.target.value)} className="h-9 px-3 rounded-md border border-slate-200 text-xs bg-white outline-none focus:ring-2 focus:ring-blue-500 w-44">
            <option value="">Tất cả KTV</option>
            {technicians.filter(t => t.role === 'ktv').map(t => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Từ ngày</label>
          <DateField value={tuNgay} onChange={(v) => { setTuNgay(v); if (v && denNgay && denNgay < v) setDenNgay(v) }} heightClass="h-9" className="w-36" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Đến ngày</label>
          <DateField value={denNgay} onChange={(v) => { setDenNgay(v); if (v && tuNgay && v < tuNgay) setTuNgay(v) }} heightClass="h-9" className="w-36" />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" onClick={fetchData} disabled={loading} title="Tải lại" className="h-9 px-3 gap-1.5 text-xs font-medium">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Tải lại
          </Button>
          <Button onClick={exportReportDocx} disabled={exporting || !ktvId || tuNgay !== denNgay}
            className={`h-9 gap-1.5 text-xs ${!ktvId || tuNgay !== denNgay ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'}`}
            title={!ktvId ? 'Vui lòng chọn 1 KTV' : tuNgay !== denNgay ? 'Ngày từ và đến phải trùng nhau' : 'Xuất bản in Word cho KTV này'}>
            <Download className="w-4 h-4" />
            {exporting ? 'Đang xuất...' : 'Xuất Word (.docx)'}
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-x-6 gap-y-1 shadow-sm">
        <div className="text-sm">
          <span className="text-slate-500">TG xử lý trung bình{ktvId ? '' : ' (mọi KTV)'}:</span>{' '}
          <b className="text-slate-800">{tgTB != null ? fmtThoiLuong(tgTB) : '—'}</b>
        </div>
        <div className="text-xs text-slate-400">Từ <b>{tgList.length}</b> phiếu có đo thời gian (đã bỏ ca quá 4 giờ).</div>
        <div className="text-xs text-slate-400">Lưu ý: gồm cả di chuyển/chờ — là con số tham khảo, không phải năng suất.</div>

        {tgByType.length > 0 && (
          <div className="w-full flex flex-wrap gap-2 pt-2 border-t border-slate-100 mt-1">
            <span className="text-xs text-slate-500 self-center mr-1">Theo loại việc:</span>
            {tgByType.map(t => (
              <span key={t.loai} className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-full px-3 py-1 text-xs">
                <span className="text-slate-600">{t.loai}</span>
                <b className="text-slate-800">{fmtThoiLuong(t.tb)}</b>
                <span className="text-slate-400">({t.n})</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <BoxLoading label="Đang tải nhật ký..." />
      ) : reportDays.length === 0 ? (
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-400 text-sm">
          Không có dữ liệu nhật ký báo cáo trong khoảng thời gian này.
        </div>
      ) : (
        <div className="space-y-4">
          {reportDays.map(day => {
            const ktvIdsOfDay = Array.from(new Set([
              ...data.trang_thai.filter(t => t.ngay_bao_cao === day).map(t => t.ktv_id),
              ...data.jobs.filter(j => j.ngay === day).flatMap(j => [j.ktv_id, j.ktv2_id].filter(Boolean)),
              ...data.extras.filter(e => e.ngay === day).map(e => e.ktv_id)
            ]))

            return (
              <div key={day} className="space-y-3">
                <div className="text-sm font-bold text-slate-800 border-l-4 border-blue-600 pl-2">Ngày {fmt(day)}</div>

                <div className="grid grid-cols-1 gap-2">
                  {ktvIdsOfDay.map(kId => {
                    const ktvInfo = technicians.find(t => t.id === kId)
                    if (!ktvInfo) return null

                    const status = data.trang_thai.find(t => t.ktv_id === kId && t.ngay_bao_cao === day)
                    const jobsOfDay = data.jobs.filter(j => j.ngay === day && (j.ktv_id === kId || j.ktv2_id === kId))
                    const extrasOfDay = data.extras.filter(e => e.ngay === day && e.ktv_id === kId)
                    const cardKey = `${day}-${kId}`
                    const open = openKey === cardKey

                    return (
                      <div key={kId} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <button onClick={() => setOpenKey(open ? null : cardKey)} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left hover:bg-slate-50">
                          <ChevronRight className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-semibold text-slate-800 truncate">{ktvInfo.full_name}</div>
                            <div className="text-[11px] text-slate-400 truncate">Phiếu sửa chữa ({jobsOfDay.length})</div>
                          </div>
                          {status?.da_nop ? (
                            <span className="shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" title={`Nộp lúc: ${new Date(status.thoi_gian_nop).toLocaleString('vi-VN')}`}>✓ Đã chốt nộp</span>
                          ) : (
                            <span className="shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">⚠️ Chưa nộp</span>
                          )}
                        </button>
                        {open && (
                        <div className="px-4 pb-4 pt-3 border-t border-slate-100 space-y-4">
                        <div className="space-y-2">
                          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Phiếu sửa chữa ({jobsOfDay.length})</div>
                          {jobsOfDay.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">Không có ca sửa máy.</p>
                          ) : (
                            <div className="border border-slate-100 rounded-lg overflow-hidden">
                              <table className="w-full text-left text-xs text-slate-600">
                                <thead className="bg-slate-50 text-slate-500">
                                  <tr>
                                    <th className="px-3 py-2">Khách hàng</th>
                                    <th className="px-3 py-2">Mã máy</th>
                                    <th className="px-3 py-2">Loại việc</th>
                                    <th className="px-3 py-2 text-center w-24">Số vụ việc</th>
                                    <th className="px-3 py-2">Báo cáo KTV</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {jobsOfDay.map(j => {
                                    const isKtv2 = j.ktv2_id === kId
                                    return (
                                      <tr key={j.id} className="hover:bg-slate-50/50">
                                        <td className="px-3 py-2.5 font-medium text-slate-800">{j.soct_khach_hang?.ten_khach_hang}</td>
                                        <td className="px-3 py-2.5 font-mono text-slate-500">{j.ma_may || '—'}</td>
                                        <td className="px-3 py-2.5">{j.loai_cong_viec}{isKtv2 && <span className="ml-1 text-[10px] text-slate-400 italic">(kèm)</span>}</td>
                                        <td className="px-3 py-2.5 text-center font-bold text-blue-700 font-mono">{j.counter != null ? j.counter.toLocaleString('vi-VN') : '—'}</td>
                                        <td className="px-3 py-2.5 text-slate-500 italic leading-relaxed">{j.ghi_chu_ktv || '—'}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2 pt-1">
                          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Công việc khác ngoài luồng ({extrasOfDay.length})</div>
                          {extrasOfDay.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">Không có việc khác.</p>
                          ) : (
                            <ul className="list-disc pl-5 text-xs text-slate-600 space-y-1">
                              {extrasOfDay.map(e => (<li key={e.id} className="leading-relaxed">{e.noi_dung}</li>))}
                            </ul>
                          )}
                        </div>
                        </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
