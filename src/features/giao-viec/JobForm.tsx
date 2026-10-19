'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Plus, Trash2, Loader2, MapPin, AlertTriangle } from 'lucide-react'
import DateField from '@/components/DateField'
import { Button } from '@/components/ui/button'
import { loaiHdBadge } from '@/lib/hd-status'
import { LOAI_HD_BAO_TRI, nghiBaoTri, coBaoTriThang, moTaLichBaoTri, fmtThang } from '@/lib/bao-tri'
import { CustomerCombobox } from './CustomerCombobox'
import { MaterialCombobox } from './MaterialCombobox'
import { createCustomer, saveJob, importPdf, fetchMayStatus, addKhoItem, closeGiamDinh } from './api'
import { emptyForm, emptyVatTu, todayVN, LOAI_CV_CAN_VAT_TU, RENTAL_LOAI_HD, type Job, type JobForm as JForm } from './types'

type GdItem = { id: string; ma_hang: string; ten_hang: string; so_luong: number; selected: boolean }

export function JobFormModal({ editingJob, onClose, onSaved, notify, customers, inventory, committed, users, loaiOptions, canEdit, role, refetchInventory }: {
  editingJob: Job | null
  onClose: () => void
  onSaved: (msg: string) => void
  notify: (type: 'success' | 'error', msg: string) => void
  customers: any[]
  inventory: any[]
  committed: Record<string, number>
  users: any[]
  loaiOptions: string[]
  canEdit: boolean
  role: string
  refetchInventory: () => void
}) {
  const editing = !!editingJob
  const [form, setForm] = useState<JForm>(() => {
    if (!editingJob) return emptyForm(todayVN())
    return {
      ngay: editingJob.ngay || todayVN(), ma_may: editingJob.ma_may || '', id_khach_hang: editingJob.id_khach_hang || '',
      loai_cong_viec: editingJob.loai_cong_viec || '', km: editingJob.km || 0, so_luong: editingJob.so_luong || 1,
      ktv_id: editingJob.ktv_id || '', ktv2_id: editingJob.ktv2_id || '', report: editingJob.report || '',
      ghi_chu: editingJob.ghi_chu || '', mien_phi: !!editingJob.mien_phi,
      vat_tu: (editingJob.soct_chi_tiet_vat_tu || []).map(v => ({ ma_hang: v.ma_hang, so_luong: String(v.so_luong), don_gia: String(v.don_gia ?? ''), vat: String(v.vat ?? '8'), hoa_don: !!v.hoa_don })),
      ten_khach_hang_moi: '', dia_chi_moi: '', model_moi: '', vi_tri_dat_may_moi: '',
    }
  })
  const [submitting, setSubmitting] = useState(false)
  // "Đang giữ" của CHÍNH phiếu đang sửa (chỉ phiếu chưa Hoàn thành mới nằm trong committed) → trừ ra
  // khi tính khả dụng để không báo thiếu nhầm chính phần phiếu này đã giữ chỗ.
  const selfGiu = useMemo(() => {
    const m: Record<string, number> = {}
    if (editingJob && editingJob.ket_qua !== 'Hoàn thành') {
      for (const v of (editingJob.soct_chi_tiet_vat_tu || [])) {
        if ((v as any)?.da_tra) continue
        const ma = String(v.ma_hang || ''); if (!ma) continue
        m[ma] = (m[ma] || 0) + (Number(v.so_luong) || 0)
      }
    }
    return m
  }, [editingJob])
  const lock = useRef(false)
  // PDF import
  const pdfRef = useRef<HTMLInputElement>(null)
  const [pdfImporting, setPdfImporting] = useState(false)
  const [pdfWarnings, setPdfWarnings] = useState<string[]>([])
  const [pdfTenByMa, setPdfTenByMa] = useState<Record<string, string>>({})
  // Giám định
  const [mayStatus, setMayStatus] = useState<any | null>(null)
  const [dongGiamDinh, setDongGiamDinh] = useState(false)
  const [gdSelect, setGdSelect] = useState<{ items: GdItem[]; total: number } | null>(null)
  const [confirmGd, setConfirmGd] = useState<{ message: string; onConfirm: () => void; onCancel: () => void } | null>(null)
  // Mã lạ -> thêm kho
  const [khoAdd, setKhoAdd] = useState<{ items: { ma_hang: string; ten_hang: string }[] } | null>(null)
  const [khoAdding, setKhoAdding] = useState(false)

  const techs = useMemo(() => users.filter(u => u.role === 'ktv'), [users])
  const set = <K extends keyof JForm>(k: K, v: JForm[K]) => setForm(prev => ({ ...prev, [k]: v }))

  // Mã máy LÀ CHÍNH.
  const handleMaMayChange = (val: string) => {
    if (val.trim() === '') { setForm(prev => ({ ...prev, ma_may: val })); return }
    const m = customers.find(c => c.ma_may && String(c.ma_may).toLowerCase() === val.trim().toLowerCase())
    if (m) setForm(prev => ({ ...prev, ma_may: val, id_khach_hang: m.id, ten_khach_hang_moi: '', dia_chi_moi: '', model_moi: '', vi_tri_dat_may_moi: '' }))
    else setForm(prev => ({ ...prev, ma_may: val, id_khach_hang: prev.id_khach_hang === 'NEW' ? 'NEW' : '' }))
  }

  // Autofill km khi chọn khách; điền mã máy theo khách nếu đang trống.
  useEffect(() => {
    if (!form.id_khach_hang || form.id_khach_hang === 'NEW') return
    const c = customers.find(x => x.id === form.id_khach_hang)
    if (c) setForm(prev => ({ ...prev, km: c.km_mac_dinh ?? prev.km, ma_may: prev.ma_may || c.ma_may || '' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id_khach_hang])

  // MF-auto theo mã máy (chỉ tạo mới).
  useEffect(() => {
    if (editing) return
    const mm = form.ma_may.trim()
    const m = mm ? customers.find(c => c.ma_may && String(c.ma_may).toLowerCase() === mm.toLowerCase()) : undefined
    const rental = RENTAL_LOAI_HD.includes(String(m?.loai_hd || '').trim())
    setForm(f => (f.mien_phi === rental ? f : { ...f, mien_phi: rental }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.ma_may, editing])

  // Trạng thái máy (bảo trì/giám định) khi mã máy khớp khách.
  useEffect(() => {
    const mm = form.ma_may.trim()
    const m = mm ? customers.find(c => c.ma_may && String(c.ma_may).toLowerCase() === mm.toLowerCase()) : undefined
    if (!m) { setMayStatus(null); setDongGiamDinh(false); return }
    let alive = true
    fetchMayStatus(m.ma_may).then(d => { if (alive && d) setMayStatus(d) })
    return () => { alive = false }
  }, [form.ma_may, customers])

  const lockedCustomer = form.ma_may.trim() ? customers.find(c => c.ma_may && String(c.ma_may).toLowerCase() === form.ma_may.trim().toLowerCase()) : undefined
  const selected = form.id_khach_hang && form.id_khach_hang !== 'NEW' ? customers.find(c => c.id === form.id_khach_hang) : undefined

  // ===== Vật tư =====
  const setVt = (i: number, field: keyof JForm['vat_tu'][number], value: string | boolean) => setForm(prev => ({ ...prev, vat_tu: prev.vat_tu.map((r, idx) => idx === i ? { ...r, [field]: value } : r) }))
  const addVt = () => setForm(prev => ({ ...prev, vat_tu: [...prev.vat_tu, emptyVatTu()] }))
  const rmVt = (i: number) => setForm(prev => ({ ...prev, vat_tu: prev.vat_tu.filter((_, idx) => idx !== i) }))
  const unknownMa = () => {
    const seen = new Set<string>(); const out: string[] = []
    for (const v of form.vat_tu) { const ma = String(v.ma_hang || '').trim(); if (!ma || seen.has(ma)) continue; seen.add(ma); if (!inventory.find(i => i.ma_hang === ma)) out.push(ma) }
    return out
  }

  const handleAddGiamDinhVatTu = () => {
    const lines: GdItem[] = (mayStatus?.giam_dinh || []).flatMap((g: any) => (g.soct_giam_dinh_vat_tu || []).map((v: any) => ({ id: v.id, ma_hang: v.ma_hang, ten_hang: v.soct_kho_hang?.ten_hang || '', so_luong: v.so_luong, selected: true })))
    if (lines.length === 0) { notify('error', 'Biên bản giám định không có vật tư đề xuất.'); return }
    setGdSelect({ items: lines, total: lines.length })
  }

  const handleImportPdf = async (file: File) => {
    setPdfImporting(true); setPdfWarnings([])
    try {
      const p = await importPdf(file)
      const warns: string[] = []
      const ma_may = (p.ma_may || '').trim()
      const matched = ma_may ? customers.find(c => c.ma_may && String(c.ma_may).toLowerCase() === ma_may.toLowerCase()) : undefined
      let loai = form.loai_cong_viec
      if (p.loai_mapped && loaiOptions.includes(p.loai_mapped)) loai = p.loai_mapped
      else if (p.loai_goc) warns.push(`Không nhận diện được loại việc từ "${p.loai_goc}" — hãy chọn tay.`)
      const vat_tu = (p.vat_tu || []).map((v: any) => ({ ma_hang: String(v.ma_hang || ''), so_luong: String(v.so_luong || 1), don_gia: String(v.don_gia ?? ''), vat: '8', hoa_don: false }))
      const tenByMa: Record<string, string> = {}
      for (const v of (p.vat_tu || [])) if (v.ma_hang) tenByMa[String(v.ma_hang)] = v.ten_hang || ''
      setPdfTenByMa(tenByMa)
      setForm(prev => ({ ...prev, ma_may, loai_cong_viec: loai, report: p.so_phieu || prev.report, vat_tu,
        ...(matched ? { id_khach_hang: matched.id, ten_khach_hang_moi: '', dia_chi_moi: '', model_moi: '' } : { id_khach_hang: 'NEW', ten_khach_hang_moi: p.khach_ten || '', dia_chi_moi: p.dia_chi || '', model_moi: p.model || '' }) }))
      if (!ma_may) warns.push('Phiếu không có mã máy — hãy nhập/chọn khách hàng.')
      else if (!matched) warns.push(`Mã máy "${ma_may}" chưa có trong hệ thống — đã điền sẵn khách mới từ phiếu (kiểm tra kỹ), hoặc xóa mã máy để chọn khách có sẵn.`)
      const unknown = (p.vat_tu || []).map((v: any) => String(v.ma_hang)).filter((ma: string, i: number, a: string[]) => ma && a.indexOf(ma) === i && !inventory.find(x => x.ma_hang === ma))
      if (unknown.length) warns.push(role === 'admin' ? `Mã hàng chưa có trong kho: ${unknown.join(', ')}. Khi bấm Lưu sẽ hiện nút "Thêm vào kho".` : `Mã hàng chưa có trong kho: ${unknown.join(', ')}. Cần ADMIN thêm vào kho trước khi lưu được phiếu.`)
      setPdfWarnings(warns)
      notify('success', `Đã đọc phiếu ${p.so_phieu || ''} — ${vat_tu.length} vật tư. Vui lòng rà soát trước khi lưu.`)
    } catch (e: any) { notify('error', e?.message || 'Lỗi đọc phiếu PDF') }
    finally { setPdfImporting(false); if (pdfRef.current) pdfRef.current.value = '' }
  }

  // ===== Lưu =====
  const executeSave = async (closeGd: boolean, custId: string) => {
    try {
      await saveJob(form, custId, editing ? editingJob!.id : null)
      if (closeGd && mayStatus?.giam_dinh?.length > 0) {
        if (!form.report.trim()) notify('error', 'Đã lưu việc, nhưng cần Số phiếu để đóng giám định.')
        else await Promise.all(mayStatus.giam_dinh.map((g: any) => closeGiamDinh(g.id, form.ngay, form.report)))
      }
      onSaved(editing ? 'Đã cập nhật công việc.' : 'Tạo và giao công việc thành công.')
    } catch (e: any) { notify('error', e?.message || 'Lỗi lưu phiếu.') }
    finally { lock.current = false; setSubmitting(false) }
  }

  const save = async () => {
    if (lock.current) return
    const loai = form.loai_cong_viec.trim()
    // Validate khách.
    let custId = form.id_khach_hang
    if (custId === 'NEW') {
      if (!form.ten_khach_hang_moi || !form.dia_chi_moi) return notify('error', 'Nhập Tên khách hàng và Địa chỉ mới.')
      if (!form.ma_may.trim()) return notify('error', 'Nhập Mã máy cho khách hàng mới.')
    } else if (!custId) {
      return notify('error', 'Vui lòng chọn khách hàng (gõ mã máy hoặc chọn từ danh sách).')
    }
    if (!loai) return notify('error', 'Vui lòng chọn Loại công việc.')
    if (loai === 'Khác' && !form.ghi_chu.trim()) return notify('error', 'Loại việc "Khác" bắt buộc nhập Ghi chú.')
    if (LOAI_CV_CAN_VAT_TU.includes(loai)) {
      if (!form.report.trim()) return notify('error', `"${loai}" bắt buộc có Số phiếu.`)
      if (!form.vat_tu.some(v => v.ma_hang.trim())) return notify('error', `"${loai}" bắt buộc có ít nhất 1 vật tư.`)
    }
    // Mã lạ.
    const unknown = unknownMa()
    if (unknown.length > 0) {
      if (role !== 'admin') return notify('error', `Cần ADMIN thêm mã hàng vào kho trước khi lưu: ${unknown.join(', ')}`)
      setKhoAdd({ items: unknown.map(ma => ({ ma_hang: ma, ten_hang: pdfTenByMa[ma] || '' })) })
      return
    }

    lock.current = true; setSubmitting(true)
    try {
      if (custId === 'NEW') custId = await createCustomer(form)
    } catch (e: any) { lock.current = false; setSubmitting(false); return notify('error', e?.message || 'Không tạo được khách hàng') }

    // Giám định chờ thay mà chưa tick đóng -> hỏi.
    if (!dongGiamDinh && mayStatus?.giam_dinh?.length > 0) {
      setConfirmGd({
        message: `Máy này đang có ${mayStatus.giam_dinh.length} biên bản giám định CHƯA THAY vật tư.\nBạn có muốn tự động Đóng (đánh dấu đã thay) các biên bản này luôn không?`,
        onConfirm: () => { if (!form.report.trim()) { notify('error', 'Cần điền Số phiếu để đóng giám định.'); setConfirmGd(null); lock.current = false; setSubmitting(false); return } setConfirmGd(null); executeSave(true, custId) },
        onCancel: () => { setConfirmGd(null); executeSave(false, custId) },
      })
      return
    }
    executeSave(dongGiamDinh, custId)
  }

  const runKhoAdd = async () => {
    if (!khoAdd) return
    if (khoAdd.items.some(it => !it.ten_hang.trim())) { notify('error', 'Vui lòng nhập tên cho tất cả mã hàng.'); return }
    setKhoAdding(true)
    try {
      for (const it of khoAdd.items) await addKhoItem(it.ma_hang, it.ten_hang.trim())
      refetchInventory()
      setKhoAdd(null)
      notify('success', 'Đã thêm mã hàng vào kho. Bấm "Lưu công việc" lại để lưu phiếu.')
    } catch (e: any) { notify('error', e?.message || 'Lỗi thêm mã vào kho') }
    finally { setKhoAdding(false) }
  }

  const lbl = 'text-sm font-medium text-slate-700'
  const inp = 'w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:border-blue-500 outline-none bg-white'
  const ghiChuBatBuoc = form.loai_cong_viec.trim() === 'Khác'

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
          <h2 className="text-xl font-bold text-slate-800">{editing ? 'Sửa công việc' : 'Giao công việc mới'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
        </div>

        {editing && !canEdit && <div className="mx-5 mt-3 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 t2 text-amber-800">KTV đã bắt đầu việc — chỉ admin mới sửa được phiếu này.</div>}

        <div className="p-6 space-y-6">
          {/* Nhập từ PDF (chỉ tạo mới) */}
          {!editing && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm text-slate-700"><b>Nhập từ file PDF</b> <span className="text-slate-500">— đọc phiếu công tác để điền sẵn khách, số phiếu, vật tư. Luôn kiểm tra lại trước khi lưu.</span></div>
                <input ref={pdfRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImportPdf(f) }} />
                <Button type="button" variant="outline" size="sm" disabled={pdfImporting} onClick={() => pdfRef.current?.click()} className="h-9 gap-2 border-blue-300 text-blue-700 hover:bg-blue-100 shrink-0">{pdfImporting ? 'Đang đọc...' : '📄 Chọn file PDF'}</Button>
              </div>
              {pdfWarnings.length > 0 && <ul className="mt-2 space-y-1 text-xs list-disc pl-5">{pdfWarnings.map((w, i) => <li key={i} className={w.includes('đã tồn tại') ? 'text-red-600 font-bold' : 'text-amber-800'}>{w}</li>)}</ul>}
            </div>
          )}

          {/* Ngày · KTV chính · KTV kèm */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5 lg:col-span-1"><label className={lbl}>Ngày</label><DateField value={form.ngay} onChange={v => set('ngay', v)} heightClass="h-10" className="w-full" /></div>
            <div className="space-y-1.5 lg:col-span-2"><label className={lbl}>Kỹ thuật viên (chính)</label>
              <select className={inp} value={form.ktv_id} onChange={e => { const v = e.target.value; setForm(p => ({ ...p, ktv_id: v, ktv2_id: p.ktv2_id === v ? '' : p.ktv2_id })) }}>
                <option value="">-- Chưa giao --</option>{techs.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 lg:col-span-2"><label className={lbl}>Kỹ thuật viên (kèm)</label>
              <select className={inp} value={form.ktv2_id} onChange={e => set('ktv2_id', e.target.value)}>
                <option value="">— Không —</option>{techs.filter(u => u.id !== form.ktv_id).map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
          </div>

          {/* Mã máy · Khách hàng */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5 lg:col-span-1"><label className={lbl}>Mã máy <span className="text-amber-500 font-normal text-xs italic">(Gõ mã để điền KH)</span></label><input className={inp} placeholder="VD: 35953" value={form.ma_may} onChange={e => handleMaMayChange(e.target.value)} /></div>
            <div className="space-y-1.5 lg:col-span-4">
              <label className={lbl}>Khách hàng <span className="text-red-500">*</span>{lockedCustomer && <span className="text-slate-400 font-normal text-xs italic ml-1">(khóa theo mã máy)</span>}</label>
              {lockedCustomer
                ? <div className="w-full h-10 px-3 rounded-md border border-slate-200 bg-slate-100 text-slate-600 text-sm flex items-center cursor-not-allowed" title="Khách hàng được xác định theo mã máy. Sửa/xóa mã máy để chọn khách khác."><span className="truncate">{lockedCustomer.ten_khach_hang}{lockedCustomer.ma_may ? ` — ${lockedCustomer.ma_may}` : ''}</span></div>
                : <CustomerCombobox customers={customers} value={form.id_khach_hang === 'NEW' ? '' : form.id_khach_hang} onPick={id => set('id_khach_hang', id)} onCreateNew={() => set('id_khach_hang', 'NEW')} />}
              {selected && (selected.model || selected.vi_tri_dat_may || selected.dia_chi) && (
                <div className="flex flex-wrap gap-2 text-xs pt-1">
                  {selected.model && <span className="text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-100">Model: <b>{selected.model}</b></span>}
                  {(selected.vi_tri_dat_may || selected.dia_chi) && <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-100 max-w-full"><MapPin className="w-3 h-3 shrink-0" /><b className="truncate">{selected.vi_tri_dat_may || selected.dia_chi}</b></span>}
                </div>
              )}
            </div>
            {form.id_khach_hang === 'NEW' && (
              <div className="lg:col-span-5 grid grid-cols-1 md:grid-cols-3 gap-4 bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                <div className="space-y-1.5"><label className={lbl}>Tên Khách Hàng mới <span className="text-red-500">*</span></label><input className={inp} placeholder="Nhập tên khách hàng" value={form.ten_khach_hang_moi} onChange={e => set('ten_khach_hang_moi', e.target.value)} /></div>
                <div className="space-y-1.5"><label className={lbl}>Địa chỉ mới <span className="text-red-500">*</span></label><input className={inp} placeholder="VD: 2 Hoàng Văn Thụ, Ba Đình, Hà Nội" value={form.dia_chi_moi} onChange={e => set('dia_chi_moi', e.target.value)} /></div>
                <div className="space-y-1.5"><label className={lbl}>Model máy</label><input className={inp} placeholder="VD: bizhub 950i" value={form.model_moi} onChange={e => set('model_moi', e.target.value)} /></div>
                <div className="space-y-1.5 md:col-span-2"><label className={`${lbl} flex items-center gap-1`}><MapPin className="w-3.5 h-3.5 text-blue-500" /> Nơi đặt máy <span className="font-normal text-slate-400 text-xs">(để trống nếu trùng địa chỉ hóa đơn)</span></label><input className={inp} placeholder="VD: Tầng 3, chi nhánh Nội Bài" value={form.vi_tri_dat_may_moi} onChange={e => set('vi_tri_dat_may_moi', e.target.value)} /></div>
              </div>
            )}
          </div>

          {/* Phù hiệu trạng thái máy + panel giám định */}
          {lockedCustomer && (() => {
            const matched = lockedCustomer
            const hd = loaiHdBadge(matched.loai_hd, matched.ngay_het_han_hdbt)
            const gd = mayStatus?.giam_dinh || []
            const gdVatTu = gd.flatMap((g: any) => g.soct_giam_dinh_vat_tu || [])
            const pill = 'px-2.5 py-1 rounded-full text-xs font-semibold border'
            return (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {LOAI_HD_BAO_TRI.includes(String(matched.loai_hd || '').trim()) && mayStatus && (
                    nghiBaoTri(matched, mayStatus.thang_nam)
                      ? <span className={`${pill} bg-slate-100 text-slate-600 border-slate-200`}>Tạm dừng bảo trì (từ {fmtThang(matched.tam_dung_tu_thang || matched.tam_hoan_cum_tu_thang)})</span>
                      : mayStatus.bao_tri_thang
                        ? <span className={`${pill} bg-emerald-50 text-emerald-700 border-emerald-200`}>✓ Đã bảo trì T{mayStatus.thang_nam.split('-')[1]}</span>
                        : coBaoTriThang(matched.thang_bao_tri, parseInt(mayStatus.thang_nam.split('-')[1], 10))
                          ? <span className={`${pill} bg-amber-50 text-amber-700 border-amber-200`}>Chưa bảo trì tháng này</span>
                          : <span className={`${pill} bg-slate-100 text-slate-600 border-slate-200`}>Tháng này không theo lịch bảo trì ({moTaLichBaoTri(matched.thang_bao_tri)})</span>
                  )}
                  <span className={`${pill} ${hd.cls}`}>{hd.text}</span>
                  {gd.length > 0 && <span className={`${pill} bg-red-50 text-red-700 border-red-200`}>Giám định: {gdVatTu.length} vật tư chờ thay</span>}
                </div>
                {gd.length > 0 && (
                  <div className="border border-red-100 bg-red-50/40 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <span className="text-xs font-semibold text-red-700">Vật tư giám định đề xuất thay</span>
                      <Button type="button" variant="outline" size="sm" onClick={handleAddGiamDinhVatTu} className="h-8 text-xs border-red-200 text-red-700 hover:bg-red-50">Đưa vào ca</Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">{gdVatTu.map((v: any) => <span key={v.id} className="text-xs bg-white border border-red-100 rounded px-2 py-1"><span className="font-mono text-slate-700">{v.ma_hang}</span> {v.soct_kho_hang?.ten_hang || ''} <span className="text-slate-400">×{v.so_luong}</span></span>)}</div>
                    <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none"><input type="checkbox" checked={dongGiamDinh} onChange={e => setDongGiamDinh(e.target.checked)} className="w-4 h-4 accent-emerald-600" />Đóng giám định (đã thay) khi lưu việc — dùng Số phiếu bên dưới</label>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Loại · SL · Số phiếu · KM */}
          <div className="grid grid-cols-2 md:grid-cols-12 gap-4">
            <div className="space-y-1.5 col-span-2 md:col-span-4"><label className={lbl}>Loại công việc <span className="text-red-500">*</span></label>
              <select className={inp} value={form.loai_cong_viec} onChange={e => set('loai_cong_viec', e.target.value)}>
                <option value="" disabled>— Chọn loại việc —</option>
                {form.loai_cong_viec && !loaiOptions.includes(form.loai_cong_viec) && <option value={form.loai_cong_viec}>{form.loai_cong_viec} (không còn trong danh mục)</option>}
                {loaiOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 col-span-1 md:col-span-2"><label className={lbl}>Số lượng</label><input type="number" min={1} className={inp} value={form.so_luong} onChange={e => set('so_luong', parseInt(e.target.value) || 1)} /></div>
            <div className="space-y-1.5 col-span-2 md:col-span-4"><label className={lbl}>Số phiếu (Report)</label><input className={inp} placeholder="VD: 958102" value={form.report} onChange={e => set('report', e.target.value)} /></div>
            <div className="space-y-1.5 col-span-1 md:col-span-2"><label className={lbl}>Khoảng cách (KM)</label><input type="number" step="0.1" min={0} className={inp} value={form.km} onChange={e => set('km', parseFloat(e.target.value) || 0)} /></div>
          </div>

          {/* Hình thức xuất */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className={lbl}>Hình thức xuất vật tư:</label>
            <div className="inline-flex rounded-md border border-slate-300 overflow-hidden">
              <button type="button" onClick={() => set('mien_phi', false)} className={`px-3 h-9 text-sm transition ${!form.mien_phi ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>Có phí</button>
              <button type="button" onClick={() => set('mien_phi', true)} className={`px-3 h-9 text-sm transition border-l border-slate-300 ${form.mien_phi ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>Miễn phí (MF)</button>
            </div>
            {form.mien_phi && <span className="text-xs text-emerald-600">Kế toán sẽ thấy badge <b>MF</b> trên Kanban.</span>}
          </div>

          {/* Vật tư */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-slate-700">Vật tư / Linh kiện thay thế</h3>
              <Button type="button" variant="outline" size="sm" onClick={addVt} className="h-8 text-xs gap-1"><Plus className="w-3 h-3" /> Thêm vật tư</Button>
            </div>
            <div className="p-4 space-y-3 bg-white">
              {form.vat_tu.length === 0 ? <p className="text-sm text-slate-400 italic text-center py-2">Chưa có vật tư nào được chọn.</p> : form.vat_tu.map((vt, index) => {
                const selectedItem = inventory.find(i => i.ma_hang === vt.ma_hang)
                const sl = parseInt(vt.so_luong) || 0
                const dg = parseFloat(vt.don_gia) || 0
                const thanhTien = dg * sl
                return (
                  <div key={index} className="bg-slate-50 p-3 rounded-md border border-slate-100 space-y-2">
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 min-w-0"><label className="text-xs font-medium text-slate-500 mb-1 block">Mã hàng hóa (Kho)</label><MaterialCombobox inventory={inventory} value={vt.ma_hang} onChange={v => setVt(index, 'ma_hang', v)} committed={committed} /></div>
                      <div className="w-16 shrink-0"><label className="text-xs font-medium text-slate-500 mb-1 block">SL</label><input type="number" min={1} className="w-full h-9 px-2 text-sm rounded-md border border-slate-200 bg-white outline-none focus:border-blue-500" value={vt.so_luong} onChange={e => setVt(index, 'so_luong', e.target.value)} /></div>
                      <div className="w-28 shrink-0"><label className="text-xs font-medium text-slate-500 mb-1 block">Đơn giá</label><input inputMode="numeric" placeholder="0" className="w-full h-9 px-2 text-sm rounded-md border border-slate-200 bg-white outline-none focus:border-blue-500 text-right" value={vt.don_gia === '' ? '' : Number(vt.don_gia).toLocaleString('vi-VN')} onChange={e => setVt(index, 'don_gia', e.target.value.replace(/\D/g, ''))} /></div>
                      <div className="w-20 shrink-0"><label className="text-xs font-medium text-slate-500 mb-1 block">VAT %</label><input type="number" min={0} step="0.1" placeholder="0" className="w-full h-9 px-2 text-sm rounded-md border border-slate-200 bg-white outline-none focus:border-blue-500" value={vt.vat} onChange={e => setVt(index, 'vat', e.target.value)} /></div>
                      <div className="w-32 shrink-0"><label className="text-xs font-medium text-slate-500 mb-1 block">Thành tiền</label><div className="h-9 flex items-center justify-end px-2 rounded-md border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-700 whitespace-nowrap overflow-hidden">{thanhTien.toLocaleString('vi-VN')} đ</div></div>
                      <label className="shrink-0 flex items-center gap-1.5 h-9 cursor-pointer select-none"><input type="checkbox" checked={vt.hoa_don} onChange={e => setVt(index, 'hoa_don', e.target.checked)} className="w-4 h-4 accent-blue-600" /><span className="text-xs font-medium text-slate-600">HĐ</span></label>
                      <button type="button" onClick={() => rmVt(index)} className="text-slate-400 hover:text-red-500 p-2 shrink-0 h-9 flex items-center"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    {selectedItem && (() => {
                      const giu = Math.max(0, (committed[selectedItem.ma_hang] || 0) - (selfGiu[selectedItem.ma_hang] || 0))
                      const kd = (Number(selectedItem.ton_kho) || 0) - giu
                      const thieu = sl > kd
                      return (
                        <div className={`text-xs px-2.5 py-1 rounded border font-medium ${thieu ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-slate-100 text-slate-500'}`}>
                          Tồn: <span className={`font-semibold ${selectedItem.ton_kho <= 0 ? 'text-red-500' : 'text-emerald-600'}`}>{selectedItem.ton_kho}</span>
                          {giu > 0 && <> · Đang giữ: <span className="font-semibold text-amber-600">{giu}</span></>}
                          {' '}· Khả dụng: <span className={`font-semibold ${kd <= 0 ? 'text-red-500' : 'text-emerald-600'}`}>{kd}</span>
                          {' '}| Model: <span className="font-semibold text-slate-700">{selectedItem.model || 'Dùng chung'}</span>
                          {thieu && <div className="mt-0.5 font-semibold">⚠ Cần {sl} nhưng chỉ còn {kd} khả dụng. Vẫn lưu được — cân nhắc đặt thêm hàng.</div>}
                        </div>
                      )
                    })()}
                    {vt.ma_hang && !selectedItem && (
                      <div className="text-xs px-2.5 py-1 rounded border font-medium bg-amber-50 border-amber-200 text-amber-800">⚠ Mã <span className="font-mono font-semibold">{vt.ma_hang}</span> chưa có trong kho{pdfTenByMa[vt.ma_hang] ? ` — ${pdfTenByMa[vt.ma_hang]}` : ''}. {role === 'admin' ? 'Bấm Lưu để thêm mã vào kho.' : 'Cần admin thêm vào kho trước khi lưu.'}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Ghi chú */}
          <div className="space-y-1.5">
            <label className={lbl}>Ghi chú {ghiChuBatBuoc && <span className="text-rose-600 text-xs">* (bắt buộc với loại việc "Khác")</span>}</label>
            <textarea className={`w-full p-3 rounded-md border text-sm focus:border-blue-500 outline-none min-h-[80px] ${ghiChuBatBuoc && !form.ghi_chu.trim() ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'}`} placeholder={ghiChuBatBuoc ? 'Nêu rõ công việc cụ thể (vì loại việc là "Khác")...' : 'Nhập ghi chú cho KTV...'} value={form.ghi_chu} onChange={e => set('ghi_chu', e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Hủy</Button>
          <Button onClick={save} disabled={submitting || (editing && !canEdit)} className="bg-blue-600 hover:bg-blue-700 text-white">
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}{editing ? 'Cập nhật công việc' : 'Lưu công việc & Báo KTV'}
          </Button>
        </div>
      </div>

      {/* Modal admin thêm mã lạ vào kho */}
      {khoAdd && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0"><h3 className="font-bold text-slate-800 text-base">Thêm mã hàng mới vào kho</h3><button onClick={() => setKhoAdd(null)} disabled={khoAdding} className="text-slate-400 hover:text-slate-600 text-xl leading-none font-bold">✕</button></div>
            <div className="p-4 overflow-y-auto space-y-3 flex-1 min-h-0">
              <p className="text-xs text-slate-500">Các mã dưới đây chưa có trong kho nên chưa lưu được phiếu. Kiểm tra/chỉnh tên rồi thêm vào kho (tồn khởi tạo = 0). Chỉ admin được thao tác này.</p>
              {khoAdd.items.map((it, idx) => (
                <div key={it.ma_hang} className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-700 w-32 shrink-0 truncate" title={it.ma_hang}>{it.ma_hang}</span>
                  <input className="h-9 px-2 text-sm rounded-md border border-slate-200 bg-white flex-1 outline-none focus:border-blue-500" placeholder="Tên hàng" value={it.ten_hang} onChange={e => setKhoAdd(prev => prev ? { items: prev.items.map((x, i) => i === idx ? { ...x, ten_hang: e.target.value } : x) } : null)} />
                </div>
              ))}
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 shrink-0">
              <Button variant="outline" type="button" onClick={() => setKhoAdd(null)} disabled={khoAdding} className="h-9 text-xs">Hủy</Button>
              <Button disabled={khoAdding} onClick={runKhoAdd} className="h-9 text-xs">{khoAdding ? 'Đang thêm...' : 'Thêm vào kho'}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal chọn vật tư giám định */}
      {gdSelect && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0"><h3 className="font-bold text-slate-800 text-base">Chọn vật tư giám định cần thay</h3><button onClick={() => setGdSelect(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none font-bold">✕</button></div>
            <div className="p-4 overflow-y-auto space-y-3 flex-1 min-h-0">
              <p className="text-xs text-slate-500">Vui lòng tick chọn các vật tư khách hàng đồng ý thay thế lần này:</p>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-500 font-semibold uppercase"><tr>
                    <th className="px-3 py-2 text-center w-12 border-r border-slate-200"><input type="checkbox" className="w-3.5 h-3.5 accent-blue-600 cursor-pointer" checked={gdSelect.items.every(i => i.selected)} onChange={e => setGdSelect(prev => prev ? { ...prev, items: prev.items.map(i => ({ ...i, selected: e.target.checked })) } : null)} /></th>
                    <th className="px-3 py-2 border-r border-slate-200">Mã vật tư</th><th className="px-3 py-2 border-r border-slate-200">Tên vật tư</th><th className="px-3 py-2 text-center">SL</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100 bg-white font-medium">
                    {gdSelect.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 cursor-pointer" onClick={() => setGdSelect(prev => prev ? { ...prev, items: prev.items.map((x, i) => i === idx ? { ...x, selected: !x.selected } : x) } : null)}>
                        <td className="px-3 py-2 text-center border-r border-slate-100" onClick={e => e.stopPropagation()}><input type="checkbox" checked={item.selected} onChange={() => setGdSelect(prev => prev ? { ...prev, items: prev.items.map((x, i) => i === idx ? { ...x, selected: !x.selected } : x) } : null)} className="w-3.5 h-3.5 accent-blue-600 cursor-pointer" /></td>
                        <td className="px-3 py-2 font-mono font-bold text-slate-700 border-r border-slate-100">{item.ma_hang}</td>
                        <td className="px-3 py-2 border-r border-slate-100 text-slate-800 leading-snug">{item.ten_hang}</td>
                        <td className="px-3 py-2 text-center font-bold">{item.so_luong}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 shrink-0">
              <Button variant="outline" type="button" onClick={() => setGdSelect(null)} className="h-9 text-xs">Hủy</Button>
              <Button className="h-9 text-xs bg-blue-600 hover:bg-blue-700" onClick={() => {
                const sel = gdSelect.items.filter(i => i.selected)
                if (sel.length === 0) { notify('error', 'Vui lòng chọn ít nhất 1 vật tư để nạp vào phiếu.'); return }
                const allSel = sel.length === gdSelect.total
                setForm(prev => {
                  const existing = new Set(prev.vat_tu.filter(v => v.ma_hang).map(v => v.ma_hang))
                  const toAdd = sel.filter(l => !existing.has(l.ma_hang)).map(v => ({ ma_hang: v.ma_hang, so_luong: String(v.so_luong), don_gia: '', vat: '8', hoa_don: false }))
                  return { ...prev, vat_tu: [...prev.vat_tu.filter(v => v.ma_hang), ...toAdd] }
                })
                setDongGiamDinh(allSel)
                notify('success', `Đã nạp ${sel.length} vật tư giám định vào phiếu.`)
                setGdSelect(null)
              }}>Xác nhận &amp; Nạp vào phiếu</Button>
            </div>
          </div>
        </div>
      )}

      {/* Xác nhận đóng giám định khi lưu */}
      {confirmGd && (
        <div className="fixed inset-0 bg-black/50 z-[90] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 space-y-3"><h3 className="text-lg font-bold text-blue-700 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Biên bản giám định chờ thay</h3><p className="text-sm text-slate-600 whitespace-pre-wrap">{confirmGd.message}</p></div>
            <div className="bg-slate-50 p-4 flex justify-end gap-2 border-t border-slate-100">
              <Button variant="outline" onClick={() => { setConfirmGd(null); lock.current = false; setSubmitting(false) }} className="h-9">Hủy bỏ</Button>
              <Button variant="outline" onClick={confirmGd.onCancel} className="h-9 border-slate-300 text-slate-700">Chỉ lưu phiếu (Không đóng)</Button>
              <Button onClick={confirmGd.onConfirm} className="h-9 bg-blue-600 hover:bg-blue-700 text-white">Đồng ý đóng</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
