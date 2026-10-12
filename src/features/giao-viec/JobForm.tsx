'use client'
import { useEffect, useMemo, useState, useRef } from 'react'
import { X, Plus, Trash2, Loader2, MapPin } from 'lucide-react'
import DateField from '@/components/DateField'
import { Button } from '@/components/ui/button'
import { CustomerPicker } from './CustomerPicker'
import { createCustomer, saveJob } from './api'
import { emptyForm, emptyVatTu, todayVN, LOAI_CV_CAN_VAT_TU, RENTAL_LOAI_HD, type Job, type JobForm as JForm } from './types'

export function JobFormModal({ editingJob, onClose, onSaved, notify, customers, inventory, users, loaiOptions, canEdit }: {
  editingJob: Job | null
  onClose: () => void
  onSaved: (msg: string) => void
  notify: (type: 'success' | 'error', msg: string) => void
  customers: any[]
  inventory: any[]
  users: any[]
  loaiOptions: string[]
  canEdit: boolean
}) {
  const [form, setForm] = useState<JForm>(() => {
    if (!editingJob) return emptyForm(todayVN())
    return {
      ngay: editingJob.ngay || todayVN(),
      ma_may: editingJob.ma_may || '',
      id_khach_hang: editingJob.id_khach_hang || '',
      loai_cong_viec: editingJob.loai_cong_viec || '',
      km: editingJob.km || 0,
      so_luong: editingJob.so_luong || 1,
      ktv_id: editingJob.ktv_id || '',
      ktv2_id: editingJob.ktv2_id || '',
      report: editingJob.report || '',
      ghi_chu: editingJob.ghi_chu || '',
      mien_phi: !!editingJob.mien_phi,
      vat_tu: (editingJob.soct_chi_tiet_vat_tu || []).map(v => ({
        ma_hang: v.ma_hang, so_luong: String(v.so_luong), don_gia: String(v.don_gia ?? ''),
        vat: String(v.vat ?? '8'), hoa_don: !!v.hoa_don,
      })),
      ten_khach_hang_moi: '', dia_chi_moi: '', model_moi: '', vi_tri_dat_may_moi: '',
    }
  })
  const [submitting, setSubmitting] = useState(false)
  const lock = useRef(false)
  const editing = !!editingJob

  const techs = useMemo(() => users.filter(u => u.role === 'ktv'), [users])
  const invByMa = useMemo(() => {
    const m = new Map<string, any>()
    for (const it of inventory) m.set(String(it.ma_hang).toLowerCase(), it)
    return m
  }, [inventory])

  const set = <K extends keyof JForm>(k: K, v: JForm[K]) => setForm(prev => ({ ...prev, [k]: v }))

  // Mã máy LÀ CHÍNH: gõ mã khớp 1 khách -> gán khách (khóa ô khách); không khớp -> bỏ liên kết.
  const handleMaMayChange = (val: string) => {
    if (val.trim() === '') { setForm(prev => ({ ...prev, ma_may: val })); return }
    const matched = customers.find(c => c.ma_may && String(c.ma_may).toLowerCase() === val.trim().toLowerCase())
    if (matched) setForm(prev => ({ ...prev, ma_may: val, id_khach_hang: matched.id, ten_khach_hang_moi: '', dia_chi_moi: '', model_moi: '', vi_tri_dat_may_moi: '' }))
    else setForm(prev => ({ ...prev, ma_may: val, id_khach_hang: prev.id_khach_hang === 'NEW' ? 'NEW' : '' }))
  }

  // Chọn khách (ô máy trống/không khớp) -> gán id + điền mã máy theo khách (parity autofill admin).
  useEffect(() => {
    if (!form.id_khach_hang || form.id_khach_hang === 'NEW') return
    const c = customers.find(x => x.id === form.id_khach_hang)
    if (c) setForm(prev => ({ ...prev, km: c.km_mac_dinh || prev.km, ma_may: prev.ma_may || c.ma_may || '' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id_khach_hang])

  // MF-auto theo mã máy (chỉ khi tạo mới): máy Thuê/CPC -> Miễn phí mặc định.
  useEffect(() => {
    if (editing) return
    const mm = form.ma_may.trim()
    const m = mm ? customers.find(c => c.ma_may && String(c.ma_may).toLowerCase() === mm.toLowerCase()) : undefined
    const rental = RENTAL_LOAI_HD.includes(String(m?.loai_hd || '').trim())
    setForm(f => (f.mien_phi === rental ? f : { ...f, mien_phi: rental }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.ma_may, editing])

  const lockedCustomer = form.ma_may.trim() ? customers.find(c => c.ma_may && String(c.ma_may).toLowerCase() === form.ma_may.trim().toLowerCase()) : undefined
  const selected = form.id_khach_hang && form.id_khach_hang !== 'NEW' ? customers.find(c => c.id === form.id_khach_hang) : undefined

  // ===== Vật tư =====
  const setVt = (i: number, patch: Partial<JForm['vat_tu'][number]>) => setForm(prev => ({ ...prev, vat_tu: prev.vat_tu.map((r, idx) => idx === i ? { ...r, ...patch } : r) }))
  const addVt = () => setForm(prev => ({ ...prev, vat_tu: [...prev.vat_tu, emptyVatTu()] }))
  const rmVt = (i: number) => setForm(prev => ({ ...prev, vat_tu: prev.vat_tu.filter((_, idx) => idx !== i) }))
  const unknownMa = useMemo(() => Array.from(new Set(form.vat_tu.map(v => v.ma_hang.trim()).filter(Boolean).filter(ma => !invByMa.has(ma.toLowerCase())))), [form.vat_tu, invByMa])

  const save = async () => {
    if (lock.current) return
    const loai = form.loai_cong_viec.trim()
    if (form.id_khach_hang === 'NEW') {
      if (!form.ten_khach_hang_moi || !form.dia_chi_moi) return notify('error', 'Nhập Tên khách hàng và Địa chỉ mới.')
      if (!form.ma_may.trim()) return notify('error', 'Nhập Mã máy cho khách hàng mới.')
    } else if (!form.id_khach_hang) {
      return notify('error', 'Vui lòng chọn khách hàng (gõ mã máy hoặc chọn từ danh sách).')
    }
    if (!loai) return notify('error', 'Vui lòng chọn Loại công việc.')
    if (loai === 'Khác' && !form.ghi_chu.trim()) return notify('error', 'Loại việc "Khác" bắt buộc nhập Ghi chú.')
    if (LOAI_CV_CAN_VAT_TU.includes(loai)) {
      if (!form.report.trim()) return notify('error', `"${loai}" bắt buộc có Số phiếu.`)
      if (!form.vat_tu.some(v => v.ma_hang.trim())) return notify('error', `"${loai}" bắt buộc có ít nhất 1 vật tư.`)
    }
    if (unknownMa.length > 0) return notify('error', `Mã hàng chưa có trong kho: ${unknownMa.join(', ')}. Thêm ở Kho hàng trước khi lưu.`)

    lock.current = true; setSubmitting(true)
    try {
      let custId = form.id_khach_hang
      if (custId === 'NEW') custId = await createCustomer(form)
      await saveJob(form, custId, editing ? editingJob!.id : null)
      onSaved(editing ? 'Đã cập nhật phiếu.' : 'Tạo và giao phiếu thành công.')
    } catch (e: any) { notify('error', e?.message || 'Lỗi lưu phiếu.') }
    finally { lock.current = false; setSubmitting(false) }
  }

  const lbl = 'text-sm font-medium text-slate-700'
  const inp = 'w-full h-9 px-2.5 text-sm rounded-md border border-slate-200 bg-white focus:border-blue-500 outline-none'

  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">{editing ? 'Sửa công việc' : 'Giao công việc mới'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        {editing && !canEdit && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-800">KTV đã bắt đầu việc — chỉ admin mới sửa được phiếu này.</div>
        )}

        <div className="p-5 space-y-4">
          {/* Ngày · KTV chính · KTV kèm */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5 lg:col-span-1">
              <label className={lbl}>Ngày</label>
              <DateField value={form.ngay} onChange={v => set('ngay', v)} heightClass="h-9" className="w-full" />
            </div>
            <div className="space-y-1.5 lg:col-span-2">
              <label className={lbl}>Kỹ thuật viên (chính)</label>
              <select className={inp} value={form.ktv_id} onChange={e => set('ktv_id', e.target.value)}>
                <option value="">Chưa gán (vào pool)</option>
                {techs.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 lg:col-span-2">
              <label className={lbl}>Kỹ thuật viên (kèm)</label>
              <select className={inp} value={form.ktv2_id} onChange={e => set('ktv2_id', e.target.value)}>
                <option value="">— Không —</option>
                {techs.filter(u => u.id !== form.ktv_id).map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
          </div>

          {/* Mã máy (chính) · Khách hàng (khóa theo mã máy, hoặc combobox) */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5 lg:col-span-1">
              <label className={lbl}>Mã máy <span className="text-amber-500 font-normal text-xs italic">(Gõ mã để điền KH)</span></label>
              <input className={inp} placeholder="VD: 35953" value={form.ma_may} onChange={e => handleMaMayChange(e.target.value)} />
            </div>
            <div className="space-y-1.5 lg:col-span-4">
              <label className={lbl}>Khách hàng <span className="text-red-500">*</span>{lockedCustomer && <span className="text-slate-400 font-normal text-xs italic ml-1">(khóa theo mã máy)</span>}</label>
              {lockedCustomer ? (
                <div className="w-full h-9 px-3 rounded-md border border-slate-200 bg-slate-100 text-slate-600 text-sm flex items-center cursor-not-allowed" title="Khách hàng được xác định theo mã máy. Sửa/xóa mã máy để chọn khách khác.">
                  <span className="truncate">{lockedCustomer.ten_khach_hang}{lockedCustomer.ma_may ? ` — ${lockedCustomer.ma_may}` : ''}</span>
                </div>
              ) : (
                <CustomerPicker customers={customers} value={form.id_khach_hang} onChange={v => set('id_khach_hang', v)} />
              )}
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

          {/* Loại · SL · Số phiếu · KM */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5"><label className={lbl}>Loại công việc <span className="text-red-500">*</span></label>
              <select className={inp} value={form.loai_cong_viec} onChange={e => set('loai_cong_viec', e.target.value)}>
                <option value="">— Chọn loại —</option>
                {loaiOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><label className={lbl}>Số lượng</label><input type="number" min={1} className={inp} value={form.so_luong} onChange={e => set('so_luong', parseInt(e.target.value) || 1)} /></div>
            <div className="space-y-1.5"><label className={lbl}>Số phiếu (Report)</label><input className={inp} placeholder="VD: 958102" value={form.report} onChange={e => set('report', e.target.value)} /></div>
            <div className="space-y-1.5"><label className={lbl}>Khoảng cách (KM)</label><input type="number" min={0} className={inp} value={form.km} onChange={e => set('km', parseInt(e.target.value) || 0)} /></div>
          </div>

          {/* Hình thức xuất */}
          <div className="flex items-center gap-3">
            <label className={lbl}>Hình thức xuất vật tư:</label>
            <div className="inline-flex rounded-md border border-slate-300 overflow-hidden">
              <button type="button" onClick={() => set('mien_phi', false)} className={`px-3 h-9 text-sm transition ${!form.mien_phi ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>Có phí</button>
              <button type="button" onClick={() => set('mien_phi', true)} className={`px-3 h-9 text-sm transition border-l border-slate-300 ${form.mien_phi ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>Miễn phí (MF)</button>
            </div>
          </div>

          {/* Vật tư */}
          <div className="rounded-lg border border-slate-200">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50/60">
              <h3 className="text-sm font-semibold text-slate-700">Vật tư / Linh kiện thay thế</h3>
              <button type="button" onClick={addVt} className="h-8 px-2.5 rounded-md border border-blue-200 text-blue-700 text-xs font-medium flex items-center gap-1 hover:bg-blue-50"><Plus className="w-3.5 h-3.5" /> Thêm vật tư</button>
            </div>
            <datalist id="jf-ma-hang">{inventory.slice(0, 2000).map(it => <option key={it.ma_hang} value={it.ma_hang}>{it.ten_hang}</option>)}</datalist>
            {form.vat_tu.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400 italic">Chưa có vật tư.</div>
            ) : (
              <div className="divide-y divide-slate-50 p-2 space-y-2">
                {form.vat_tu.map((v, i) => {
                  const it = invByMa.get(v.ma_hang.trim().toLowerCase())
                  const unknown = v.ma_hang.trim() && !it
                  const thanhTien = (parseInt(v.so_luong) || 0) * (parseInt(v.don_gia) || 0)
                  return (
                    <div key={i} className="flex items-end gap-2">
                      <div className="flex-1 min-w-0">
                        <label className="text-xs font-medium text-slate-500 mb-1 block">Mã hàng (Kho)</label>
                        <input list="jf-ma-hang" value={v.ma_hang} onChange={e => setVt(i, { ma_hang: e.target.value })}
                          className={`w-full h-9 px-2 text-sm rounded border ${unknown ? 'border-rose-300 bg-rose-50' : 'border-slate-200'} outline-none focus:border-blue-500`} placeholder="Mã hàng" />
                        <div className="text-[10px] mt-0.5 h-3.5 truncate">{it ? <span className="text-slate-400">{it.ten_hang}{it.model ? ` · ${it.model}` : ''}</span> : unknown ? <span className="text-rose-500">Chưa có trong kho — thêm ở Kho hàng</span> : ''}</div>
                      </div>
                      <div className="w-14"><label className="text-xs font-medium text-slate-500 mb-1 block">SL</label><input type="number" min={1} value={v.so_luong} onChange={e => setVt(i, { so_luong: e.target.value })} className="w-full h-9 px-2 text-sm rounded border border-slate-200 outline-none focus:border-blue-500" /></div>
                      <div className="w-28"><label className="text-xs font-medium text-slate-500 mb-1 block">Đơn giá</label><input inputMode="numeric" value={v.don_gia === '' ? '' : Number(v.don_gia).toLocaleString('vi-VN')} onChange={e => setVt(i, { don_gia: e.target.value.replace(/\D/g, '') })} placeholder="0" className="w-full h-9 px-2 text-sm rounded border border-slate-200 outline-none focus:border-blue-500 text-right" /></div>
                      <div className="w-16"><label className="text-xs font-medium text-slate-500 mb-1 block">VAT %</label><input type="number" min={0} step="0.1" value={v.vat} onChange={e => setVt(i, { vat: e.target.value })} className="w-full h-9 px-2 text-sm rounded border border-slate-200 outline-none focus:border-blue-500" /></div>
                      <div className="w-28"><label className="text-xs font-medium text-slate-500 mb-1 block">Thành tiền</label><div className="w-full h-9 px-2 text-sm rounded border border-slate-100 bg-slate-50 text-slate-600 flex items-center justify-end">{thanhTien.toLocaleString('vi-VN')}</div></div>
                      <label className="shrink-0 flex items-center gap-1.5 h-9 cursor-pointer select-none pb-0.5"><input type="checkbox" checked={v.hoa_don} onChange={e => setVt(i, { hoa_don: e.target.checked })} className="w-4 h-4 accent-blue-600" /><span className="text-xs text-slate-600">HĐ</span></label>
                      <button type="button" onClick={() => rmVt(i)} className="text-slate-400 hover:text-rose-500 h-9 flex items-center shrink-0"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Ghi chú */}
          <div className="space-y-1.5">
            <label className={lbl}>Ghi chú {form.loai_cong_viec.trim() === 'Khác' && <span className="text-rose-600 text-xs">* (bắt buộc với loại việc "Khác")</span>}</label>
            <textarea rows={2} className="w-full px-2.5 py-2 text-sm rounded-md border border-slate-200 bg-white focus:border-blue-500 outline-none resize-y" value={form.ghi_chu} onChange={e => set('ghi_chu', e.target.value)} placeholder={form.loai_cong_viec.trim() === 'Khác' ? 'Nêu rõ công việc cụ thể (vì loại việc là "Khác")…' : 'Nhập ghi chú cho KTV…'} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100">
          <Button variant="outline" onClick={onClose} className="h-9 text-sm">Hủy</Button>
          <Button onClick={save} disabled={submitting || (editing && !canEdit)} className="h-9 text-sm bg-blue-600 hover:bg-blue-700 text-white">
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            {editing ? 'Cập nhật công việc' : 'Lưu công việc & Báo KTV'}
          </Button>
        </div>
      </div>
    </div>
  )
}
