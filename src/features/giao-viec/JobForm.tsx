'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Plus, Trash2, Loader2 } from 'lucide-react'
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
  canEdit: boolean   // true nếu phiếu sửa được (parity: Chờ nhận/Đã nhận, hoặc admin)
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

  const invByMa = useMemo(() => {
    const m = new Map<string, any>()
    for (const it of inventory) m.set(String(it.ma_hang).toLowerCase(), it)
    return m
  }, [inventory])

  // Autofill km + ma_may khi chọn khách (giữ parity admin).
  useEffect(() => {
    if (!form.id_khach_hang || form.id_khach_hang === 'NEW') return
    const c = customers.find(x => x.id === form.id_khach_hang)
    if (c) setForm(prev => ({ ...prev, km: c.km_mac_dinh || 0, ma_may: c.ma_may || prev.ma_may }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id_khach_hang])

  // MF-auto theo mã máy (CHỈ khi tạo mới): máy Thuê/CPC → Miễn phí mặc định.
  useEffect(() => {
    if (editing) return
    const mm = form.ma_may.trim()
    const m = mm ? customers.find(c => c.ma_may && String(c.ma_may).toLowerCase() === mm.toLowerCase()) : undefined
    const rental = RENTAL_LOAI_HD.includes(String(m?.loai_hd || '').trim())
    setForm(f => (f.mien_phi === rental ? f : { ...f, mien_phi: rental }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.ma_may, editing])

  const set = <K extends keyof JForm>(k: K, v: JForm[K]) => setForm(prev => ({ ...prev, [k]: v }))
  const setVt = (i: number, patch: Partial<JForm['vat_tu'][number]>) =>
    setForm(prev => ({ ...prev, vat_tu: prev.vat_tu.map((r, idx) => idx === i ? { ...r, ...patch } : r) }))
  const addVt = () => setForm(prev => ({ ...prev, vat_tu: [...prev.vat_tu, emptyVatTu()] }))
  const rmVt = (i: number) => setForm(prev => ({ ...prev, vat_tu: prev.vat_tu.filter((_, idx) => idx !== i) }))

  const unknownMa = useMemo(() =>
    Array.from(new Set(form.vat_tu.map(v => v.ma_hang.trim()).filter(Boolean).filter(ma => !invByMa.has(ma.toLowerCase())))),
    [form.vat_tu, invByMa])

  const save = async () => {
    if (lock.current) return
    const loai = form.loai_cong_viec.trim()
    // Validation mirror server.
    if (form.id_khach_hang === 'NEW') {
      if (!form.ten_khach_hang_moi || !form.dia_chi_moi) return notify('error', 'Nhập Tên khách hàng và Địa chỉ mới.')
      if (!form.ma_may.trim()) return notify('error', 'Nhập Mã máy cho khách hàng mới.')
    } else if (!form.id_khach_hang) {
      return notify('error', 'Vui lòng chọn khách hàng.')
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
    } catch (e: any) {
      notify('error', e?.message || 'Lỗi lưu phiếu.')
    } finally {
      lock.current = false; setSubmitting(false)
    }
  }

  const fieldCls = 'w-full h-8 px-2.5 text-xs rounded-md border border-slate-200 bg-white focus:border-blue-500 outline-none'

  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">{editing ? 'Sửa phiếu công việc' : 'Tạo & giao phiếu'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        {editing && !canEdit && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
            KTV đã bắt đầu việc — chỉ admin mới sửa được phiếu này.
          </div>
        )}

        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Khách hàng / Điểm máy *</span>
              <div className="mt-1"><CustomerPicker customers={customers} value={form.id_khach_hang} onChange={v => set('id_khach_hang', v)} /></div>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Ngày thực hiện</span>
              <div className="mt-1"><DateField value={form.ngay} onChange={v => set('ngay', v)} className="w-full" /></div>
            </label>
          </div>

          {form.id_khach_hang === 'NEW' && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-blue-50/40 border border-blue-100">
              <input className={fieldCls} placeholder="Tên khách hàng mới *" value={form.ten_khach_hang_moi} onChange={e => set('ten_khach_hang_moi', e.target.value)} />
              <input className={fieldCls} placeholder="Model máy" value={form.model_moi} onChange={e => set('model_moi', e.target.value)} />
              <input className={fieldCls} placeholder="Địa chỉ (hóa đơn) *" value={form.dia_chi_moi} onChange={e => set('dia_chi_moi', e.target.value)} />
              <input className={fieldCls} placeholder="Vị trí đặt máy" value={form.vi_tri_dat_may_moi} onChange={e => set('vi_tri_dat_may_moi', e.target.value)} />
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Mã máy</span>
              <input className={`${fieldCls} mt-1`} value={form.ma_may} onChange={e => set('ma_may', e.target.value)} placeholder="Mã máy" />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Loại công việc *</span>
              <select className={`${fieldCls} mt-1`} value={form.loai_cong_viec} onChange={e => set('loai_cong_viec', e.target.value)}>
                <option value="">— Chọn loại —</option>
                {loaiOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Số phiếu</span>
              <input className={`${fieldCls} mt-1`} value={form.report} onChange={e => set('report', e.target.value)} placeholder="Số phiếu (report)" />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">KTV chính</span>
              <select className={`${fieldCls} mt-1`} value={form.ktv_id} onChange={e => set('ktv_id', e.target.value)}>
                <option value="">Chưa gán (vào pool)</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">KTV kèm</span>
              <select className={`${fieldCls} mt-1`} value={form.ktv2_id} onChange={e => set('ktv2_id', e.target.value)}>
                <option value="">— Không —</option>
                {users.filter(u => u.id !== form.ktv_id).map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Số lượng</span>
              <input type="number" min={1} className={`${fieldCls} mt-1`} value={form.so_luong} onChange={e => set('so_luong', parseInt(e.target.value) || 1)} />
            </label>
          </div>

          <label className="block">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Ghi chú</span>
            <textarea rows={2} className="w-full mt-1 px-2.5 py-2 text-xs rounded-md border border-slate-200 bg-white focus:border-blue-500 outline-none resize-y" value={form.ghi_chu} onChange={e => set('ghi_chu', e.target.value)} placeholder="Ghi chú (bắt buộc với loại việc “Khác”)" />
          </label>

          <label className="inline-flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={form.mien_phi} onChange={e => set('mien_phi', e.target.checked)} className="w-4 h-4 accent-blue-600" />
            Xuất miễn phí (MF) — không lên hóa đơn / công nợ
          </label>

          {/* Vật tư */}
          <div className="rounded-lg border border-slate-200">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50/60">
              <span className="text-[11px] font-semibold text-slate-600 uppercase">Vật tư / linh kiện</span>
              <button type="button" onClick={addVt} className="h-7 px-2.5 rounded-md border border-blue-200 text-blue-700 text-[11px] font-medium flex items-center gap-1 hover:bg-blue-50"><Plus className="w-3 h-3" /> Thêm dòng</button>
            </div>
            <datalist id="jf-ma-hang">{inventory.slice(0, 2000).map(it => <option key={it.ma_hang} value={it.ma_hang}>{it.ten_hang}</option>)}</datalist>
            {form.vat_tu.length === 0 ? (
              <div className="px-3 py-4 text-center text-[11px] text-slate-400 italic">Chưa có vật tư.</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {form.vat_tu.map((v, i) => {
                  const it = invByMa.get(v.ma_hang.trim().toLowerCase())
                  const unknown = v.ma_hang.trim() && !it
                  return (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                      <div className="flex-1 min-w-0">
                        <input list="jf-ma-hang" value={v.ma_hang} onChange={e => setVt(i, { ma_hang: e.target.value })}
                          className={`w-full h-7 px-2 text-xs rounded border ${unknown ? 'border-rose-300 bg-rose-50' : 'border-slate-200'} outline-none focus:border-blue-500`} placeholder="Mã hàng" />
                        <div className="text-[10px] text-slate-400 truncate h-3.5">{it?.ten_hang || (unknown ? 'Chưa có trong kho' : '')}</div>
                      </div>
                      <input type="number" min={1} value={v.so_luong} onChange={e => setVt(i, { so_luong: e.target.value })} className="w-16 h-7 px-2 text-xs rounded border border-slate-200 outline-none focus:border-blue-500" placeholder="SL" />
                      <input type="number" min={0} value={v.don_gia} onChange={e => setVt(i, { don_gia: e.target.value })} className="w-24 h-7 px-2 text-xs rounded border border-slate-200 outline-none focus:border-blue-500" placeholder="Đơn giá" />
                      <input type="number" min={0} value={v.vat} onChange={e => setVt(i, { vat: e.target.value })} className="w-14 h-7 px-2 text-xs rounded border border-slate-200 outline-none focus:border-blue-500" placeholder="VAT%" />
                      <label className="inline-flex items-center gap-1 text-[10px] text-slate-500"><input type="checkbox" checked={v.hoa_don} onChange={e => setVt(i, { hoa_don: e.target.checked })} className="w-3.5 h-3.5 accent-blue-600" />HĐ</label>
                      <button type="button" onClick={() => rmVt(i)} className="text-slate-300 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100">
          <Button variant="outline" onClick={onClose} className="h-9 text-xs">Hủy</Button>
          <Button onClick={save} disabled={submitting || (editing && !canEdit)} className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white">
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            {editing ? 'Lưu thay đổi' : 'Tạo & giao'}
          </Button>
        </div>
      </div>
    </div>
  )
}
