"use client"

import { useState, useEffect, useCallback } from "react"
import { AlertTriangle, Plus, X } from "lucide-react"
import { supabase } from "@/lib/supabase"

type Item = {
  id: string
  ngay: string
  ngay_hen: string
  ma_may: string | null
  report: string | null
  loai_cong_viec: string
  ghi_chu: string | null
  soct_khach_hang: { ten_khach_hang: string; dia_chi: string; model: string | null; vi_tri_dat_may: string | null } | null
}

const fmtDMY = (s: any) => { if (!s) return ''; const d = new Date(s); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` }
const todayVN = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)

// Banner nhắc VĂN PHÒNG: phiếu 'Chưa hoàn thành' đến hẹn -> tạo phiếu làm tiếp.
export default function LamTiepBanner({ showNotification, onCreated }: { showNotification: (t: 'success' | 'error', m: string) => void, onCreated?: () => void }) {
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/admin/cong-viec/lam-tiep').then(r => r.json()).then(j => { if (Array.isArray(j?.data)) setItems(j.data) }).catch(() => { })
  }, [])

  useEffect(() => {
    load()
    const ch = supabase.channel('soct_jobs').on('broadcast', { event: 'changed' }, () => load()).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  const taoTiep = async (it: Item) => {
    setBusy(it.id)
    try {
      const res = await fetch('/api/admin/cong-viec/lam-tiep', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: it.id }) })
      const j = await res.json()
      if (res.ok) { showNotification('success', 'Đã tạo phiếu làm tiếp (vào danh sách chờ nhận).'); load(); onCreated?.() }
      else showNotification('error', j.error || 'Lỗi tạo phiếu tiếp')
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setBusy(null) }
  }

  const boQua = async (it: Item) => {
    setBusy(it.id)
    try {
      const res = await fetch('/api/admin/cong-viec/lam-tiep', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: it.id }) })
      if (res.ok) { showNotification('success', 'Đã bỏ nhắc phiếu này.'); load() }
      else { const j = await res.json(); showNotification('error', j.error || 'Lỗi') }
    } catch { showNotification('error', 'Lỗi kết nối') } finally { setBusy(null) }
  }

  if (items.length === 0) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
        <AlertTriangle className="w-4 h-4" /> {items.length} phiếu chưa hoàn thành cần làm tiếp
      </div>
      <div className="space-y-2">
        {items.map(it => {
          const kh = it.soct_khach_hang
          const quaHan = it.ngay_hen < todayVN()
          return (
            <div key={it.id} className="bg-white border border-amber-100 rounded-lg px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0 text-xs">
                <div className="font-semibold text-slate-800 truncate">{kh?.ten_khach_hang || 'Khách'} <span className="text-slate-400 font-normal">· {it.loai_cong_viec}</span></div>
                <div className="text-slate-500">
                  {it.ma_may && <>Máy {it.ma_may} · </>}
                  Hẹn: <b className={quaHan ? 'text-red-600' : 'text-amber-700'}>{fmtDMY(it.ngay_hen)}{quaHan ? ' (quá hạn)' : ''}</b>
                  {it.report && <> · Phiếu {it.report}</>}
                </div>
                {it.ghi_chu && <div className="text-slate-400 truncate">{it.ghi_chu}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => taoTiep(it)} disabled={busy === it.id} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                  <Plus className="w-3.5 h-3.5" /> Tạo phiếu tiếp
                </button>
                <button onClick={() => boQua(it)} disabled={busy === it.id} title="Không làm tiếp (bỏ nhắc)" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 px-1.5 py-1.5 disabled:opacity-50">
                  <X className="w-3.5 h-3.5" /> Không làm tiếp
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
