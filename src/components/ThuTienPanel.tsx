"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Landmark, Check, Trash2, Clock } from "lucide-react"

// Panel THU TIỀN + DUYỆT (Lát 5, luồng KINH DOANH) — dùng chung cho modal chi tiết ở /lenh-xuat-hang
// và modal thẻ KD ở /admin. Đọc/ghi qua /api/admin/thu-tien (bảng soct_thu_tien). Anti-biển thủ:
// NV/sale_admin KHAI (cho_duyet) -> kthc/admin DUYỆT (da_duyet) -> mới tính "đã thu"/công nợ.

type Khoan = {
  id: string; so_tien: number; loai: 'dat_coc' | 'thanh_toan'; trang_thai: 'cho_duyet' | 'da_duyet'
  so_hoa_don: string | null; ghi_chu: string | null; thoi_diem: string; duyet_luc: string | null
  nguoi_ghi: string | null; nguoi_ghi_ten: string; nguoi_duyet_ten: string
}

const parseMoney = (s: any) => Number(String(s ?? '').replace(/\D/g, '')) || 0
const fmtMoneyInput = (s: any) => { const n = String(s ?? '').replace(/\D/g, ''); return n ? Number(n).toLocaleString('vi-VN') : '' }
const fmtVnd = (n: any) => Math.round(Number(n) || 0).toLocaleString('vi-VN')
const fmtDT = (s?: string | null) => { if (!s) return ''; const d = new Date(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

export default function ThuTienPanel({ lenhId, role, meId, canKhai, tongSauVat, onChanged, notify }: {
  lenhId: string
  role: string
  meId?: string
  canKhai: boolean            // NV/sale_admin/kthc/admin được khai khoản
  tongSauVat: number          // tổng hóa đơn (sau VAT) để tính còn phải thu
  onChanged?: () => void      // báo cha refetch (cập nhật badge trên thẻ)
  notify: (t: 'success' | 'error', m: string) => void
}) {
  const isKeToan = role === 'admin' || role === 'kthc'
  const [list, setList] = useState<Khoan[]>([])
  const [daDuyet, setDaDuyet] = useState(0)
  const [choDuyet, setChoDuyet] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState('')
  const [loai, setLoai] = useState<'thanh_toan' | 'dat_coc'>('thanh_toan')
  const [ghiChu, setGhiChu] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/thu-tien?lenh_id=${lenhId}`)
      const j = await res.json()
      if (res.ok) { setList(j.data || []); setDaDuyet(j.da_duyet || 0); setChoDuyet(j.cho_duyet || 0) }
    } catch { /* im lặng */ } finally { setLoading(false) }
  }, [lenhId])
  useEffect(() => { load() }, [load])

  const conLai = Math.max(0, Math.round(tongSauVat) - daDuyet)

  const khai = async () => {
    const st = parseMoney(amount)
    if (st <= 0) { notify('error', 'Nhập số tiền hợp lệ.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/admin/thu-tien', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lenh_id: lenhId, so_tien: st, loai, ghi_chu: ghiChu.trim() || null }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) { notify('success', 'Đã khai khoản thu (chờ kế toán duyệt).'); setAmount(''); setGhiChu(''); setLoai('thanh_toan'); load(); onChanged?.() }
      else notify('error', j.error || 'Lỗi khai thu')
    } catch { notify('error', 'Lỗi kết nối') } finally { setBusy(false) }
  }

  const duyet = async (id: string) => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/thu-tien', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      const j = await res.json().catch(() => ({}))
      if (res.ok) { notify('success', 'Đã duyệt khoản thu.'); load(); onChanged?.() }
      else notify('error', j.error || 'Lỗi duyệt')
    } catch { notify('error', 'Lỗi kết nối') } finally { setBusy(false) }
  }

  const huy = async (id: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/thu-tien?id=${id}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (res.ok) { notify('success', 'Đã hủy khoản thu.'); load(); onChanged?.() }
      else notify('error', j.error || 'Lỗi hủy')
    } catch { notify('error', 'Lỗi kết nối') } finally { setBusy(false) }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2.5">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wide">
        <Landmark className="w-4 h-4 text-indigo-600" /> Thu tiền / Đặt cọc
      </div>

      {/* Tóm tắt */}
      <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
        <div className="rounded-md bg-emerald-50 border border-emerald-100 py-1.5"><div className="text-slate-500">Đã thu (duyệt)</div><b className="text-emerald-700">{fmtVnd(daDuyet)}</b></div>
        <div className="rounded-md bg-amber-50 border border-amber-100 py-1.5"><div className="text-slate-500">Chờ duyệt</div><b className="text-amber-700">{fmtVnd(choDuyet)}</b></div>
        <div className="rounded-md bg-slate-100 border border-slate-200 py-1.5"><div className="text-slate-500">Còn phải thu</div><b className="text-slate-800">{fmtVnd(conLai)}</b></div>
      </div>

      {/* Danh sách khoản */}
      {loading ? (
        <div className="text-center text-[11px] text-slate-400 py-2">Đang tải…</div>
      ) : list.length === 0 ? (
        <div className="text-center text-[11px] text-slate-400 py-2 italic">Chưa có khoản thu nào.</div>
      ) : (
        <div className="space-y-1.5">
          {list.map(k => {
            const daDuyetKhoan = k.trang_thai === 'da_duyet'
            const canHuy = !daDuyetKhoan && (isKeToan || (meId && k.nguoi_ghi === meId))
            return (
              <div key={k.id} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px]">
                <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold ${k.loai === 'dat_coc' ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'}`}>{k.loai === 'dat_coc' ? 'Đặt cọc' : 'Thanh toán'}</span>
                <span className="font-bold text-slate-800">{fmtVnd(k.so_tien)} đ</span>
                {k.ghi_chu && <span className="text-slate-400 truncate max-w-[120px]" title={k.ghi_chu}>· {k.ghi_chu}</span>}
                <span className="ml-auto flex items-center gap-1.5">
                  {daDuyetKhoan ? (
                    <span className="inline-flex items-center gap-0.5 text-emerald-600 font-semibold" title={`Duyệt bởi ${k.nguoi_duyet_ten || ''} · ${fmtDT(k.duyet_luc)}`}><Check className="w-3 h-3" /> Đã duyệt</span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-amber-600 font-semibold" title={`Khai bởi ${k.nguoi_ghi_ten || ''} · ${fmtDT(k.thoi_diem)}`}><Clock className="w-3 h-3" /> Chờ duyệt</span>
                  )}
                  {isKeToan && !daDuyetKhoan && (
                    <button onClick={() => duyet(k.id)} disabled={busy} title="Duyệt (đã nhận tiền/nộp quỹ)" className="inline-flex items-center gap-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white px-1.5 py-0.5 font-semibold disabled:opacity-50"><Check className="w-3 h-3" /> Duyệt</button>
                  )}
                  {canHuy && (
                    <button onClick={() => huy(k.id)} disabled={busy} title="Hủy khoản chờ duyệt" className="p-0.5 rounded text-rose-500 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Khai khoản mới */}
      {canKhai && (
        <div className="pt-1.5 border-t border-dashed border-slate-200 space-y-1.5">
          <div className="flex gap-1.5">
            <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 shrink-0">
              <button onClick={() => setLoai('thanh_toan')} className={`px-2 h-8 rounded text-[11px] font-semibold ${loai === 'thanh_toan' ? 'bg-sky-600 text-white' : 'text-slate-500'}`}>Thanh toán</button>
              <button onClick={() => setLoai('dat_coc')} className={`px-2 h-8 rounded text-[11px] font-semibold ${loai === 'dat_coc' ? 'bg-violet-600 text-white' : 'text-slate-500'}`}>Đặt cọc</button>
            </div>
            <Input value={amount} onChange={e => setAmount(fmtMoneyInput(e.target.value))} inputMode="numeric" placeholder="Số tiền" className="h-8 bg-white text-right font-mono font-bold text-slate-800 text-xs" />
            <Button onClick={() => setAmount(fmtMoneyInput(String(conLai)))} variant="outline" className="h-8 text-[11px] whitespace-nowrap px-2">Còn lại</Button>
          </div>
          <div className="flex gap-1.5">
            <Input value={ghiChu} onChange={e => setGhiChu(e.target.value)} placeholder="Ghi chú (không bắt buộc)" className="h-8 bg-white text-xs" />
            <Button onClick={khai} disabled={busy || parseMoney(amount) <= 0} className="h-8 text-xs whitespace-nowrap bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-3">Khai khoản</Button>
          </div>
          <p className="text-[10px] text-slate-400">Khoản khai xong ở trạng thái <b>chờ duyệt</b> — kế toán duyệt (đã nhận tiền/nộp quỹ) mới tính vào công nợ.</p>
        </div>
      )}
    </div>
  )
}
