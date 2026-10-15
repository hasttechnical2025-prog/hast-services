'use client'
import { useState, useEffect } from 'react'
import { Download, PenSquare, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import MonthField from '@/components/MonthField'

// Port NGUYÊN BaoCaoThangTool từ admin (y hệt). Gọi lại /api/admin/bao-cao, /api/admin/doanh-so.
const BC_CAT_LABELS: [string, string][] = [
  ['LAP_MAY', 'Lắp máy'], ['SUA_MAY', 'Sửa máy'], ['GIAO_MUC', 'Giao mực'], ['THAY_VAT_TU', 'Thay vật tư'],
  ['BAO_TRI', 'Bảo trì'], ['CSKH', 'CSKH (đến tận nơi)'], ['HO_TRO_THAU', 'Hỗ trợ thầu'],
  ['HO_TRO_DAI_LY', 'Hỗ trợ đại lý'], ['KHAC', 'Khác'],
]
const BC_M2_ROWS: [string, string][] = [
  ['HDBT_SUM', 'Số máy có HĐBT'], ['ALL_RP_SUM', 'Máy phát sinh DV trong tháng'],
  ['LAP_MAY_SUM', 'Máy lắp trong tháng'], ['MAY_THUE_CPC_SUM', 'Máy thuê / CPC'], ['TONG_MAY', 'Tổng số máy dịch vụ'],
]

export function BaoCaoThangTool({ showNotification }: { showNotification: (type: 'success' | 'error', msg: string) => void }) {
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
      const res = await fetch('/api/admin/bao-cao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thang, manual }) })
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
      {loading && <p className="text-sm text-slate-400 text-center py-6">Đang tính số liệu tháng...</p>}

      {preview && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col justify-center shadow-sm">
              <div className="t3 font-bold text-blue-600 uppercase mb-1 tracking-wider">Hóa đơn đã xuất</div>
              <div className="text-2xl font-black text-blue-900">{preview.ketoan_so_luong_hd} <span className="text-sm font-medium text-blue-700">tờ</span></div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col justify-center shadow-sm">
              <div className="t3 font-bold text-emerald-600 uppercase mb-1 tracking-wider">Doanh số trước thuế</div>
              <div className="text-xl font-black text-emerald-900">{preview.ketoan_truoc_vat} <span className="text-sm font-medium text-emerald-700">đ</span></div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col justify-center shadow-sm">
              <div className="t3 font-bold text-amber-600 uppercase mb-1 tracking-wider">Tiền thuế VAT</div>
              <div className="text-xl font-black text-amber-900">{preview.ketoan_vat} <span className="text-sm font-medium text-amber-700">đ</span></div>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex flex-col justify-center shadow-sm">
              <div className="t3 font-bold text-indigo-600 uppercase mb-1 tracking-wider">Tổng cộng (sau thuế)</div>
              <div className="text-xl font-black text-indigo-900">{preview.ketoan_sau_vat} <span className="text-sm font-medium text-indigo-700">đ</span></div>
            </div>
          </div>
      )}

      <div className="border border-slate-200 rounded-lg p-4 bg-white flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Tháng báo cáo</label>
          <MonthField value={thang} onChange={setThang} className="h-9 px-3 text-xs w-44" />
        </div>
        <Button onClick={exportDocx} disabled={exporting || loading || !preview} className="gap-2 h-9 text-sm font-semibold shrink-0">
          <Download className="w-4 h-4" /> {exporting ? 'Đang xuất...' : 'Xuất báo cáo (.docx)'}
        </Button>
      </div>

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
          <div className="border border-slate-200 rounded-lg p-6 bg-white space-y-4">
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

          {/* BẢNG DOANH SỐ THEO THÁNG */}
          <div className="border border-slate-200 rounded-lg p-6 bg-white space-y-4">
            <h4 className="text-sm font-bold text-slate-700">Doanh số theo tháng (nhập từ kế toán) — năm {nam}</h4>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Tháng</label>
                <MonthField value={dsoForm.thang} onChange={(v) => setDsoForm({ ...dsoForm, thang: v })} className="h-9 px-2 text-xs w-40" />
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

          {/* MỤC 4 & 5 */}
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

          {/* MỤC 6 & 7 & 8 */}
          <div className="border border-slate-200 rounded-lg p-6 bg-white space-y-4">
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
