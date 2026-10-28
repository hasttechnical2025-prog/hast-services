'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Bell, Droplets, Package, AlertTriangle, Clock, Users, ClipboardList, ClipboardCheck, Palmtree, ChevronDown } from 'lucide-react'
import { fmtDate } from '@/ui'
import { hdbtStatus } from '@/lib/hd-status'
import { V2_BASE } from '@/lib/v2-nav'
import { LOAI_LABEL, moTaKhoang } from '@/lib/nghi-phep'
import { useSession } from './SessionProvider'
import { useAlerts } from './AlertsProvider'

type Tone = 'red' | 'amber' | 'blue'
type Section = { key: string; icon: any; label: string; count: number; tone: Tone; detail: React.ReactNode; navHref?: string; navLabel?: string; canSee?: boolean }

// Chuông cảnh báo xuyên-module — kiểu /admin: gom nhiều nhóm, mỗi nhóm bung chi tiết + link ĐÚNG vùng v2.
export function NotificationCenter() {
  const { subVisible, tabVisible } = useSession()
  const a = useAlerts()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const sections: Section[] = [
    {
      key: 'muc', icon: Droplets, tone: 'red', label: 'Mực máy thuê đã hết', count: a.mucCanhBao.length,
      navHref: `${V2_BASE}/tai-chinh/thue-cpc`, navLabel: '→ Mở Thuê/CPC › Cảnh báo vật tư', canSee: subVisible('tai_chinh', 'thue_cpc'),
      detail: (
        <div className="border border-red-100 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-red-50 text-red-800"><tr><th className="px-2.5 py-1.5 font-medium">Mã / tên mực</th><th className="px-2 py-1.5 font-medium text-center">Khả dụng</th><th className="px-2 py-1.5 font-medium text-center">Chờ về</th><th className="px-2 py-1.5 font-medium text-center">Máy</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {a.mucCanhBao.map((m: any) => (
                <tr key={m.ma_hang}>
                  <td className="px-2.5 py-1.5"><span className="font-mono font-semibold text-slate-700">{m.ma_hang}</span><div className="text-slate-500" title={m.ten_hang}>{m.ten_hang}{m.hang ? ` [${m.hang}]` : ''}{m.model ? ` · ${m.model}` : ''}</div></td>
                  <td className="px-2 py-1.5 text-center font-semibold text-red-600">{m.kha_dung}{m.giu > 0 && <div className="text-[10px] text-slate-400 font-normal">tồn {m.ton} · giữ {m.giu}</div>}</td>
                  <td className="px-2 py-1.5 text-center">{m.cho_ve > 0 ? <span className="font-semibold text-emerald-600">{m.cho_ve}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-center">{m.so_may}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    },
    {
      key: 'muc_sap_het', icon: Droplets, tone: 'amber', label: 'Máy thuê sắp cần thay vật tư', count: a.mucSapHet.length,
      navHref: `${V2_BASE}/tai-chinh/thue-cpc`, navLabel: '→ Mở Thuê/CPC › Cảnh báo vật tư', canSee: subVisible('tai_chinh', 'thue_cpc'),
      detail: (
        <div className="border border-amber-100 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-amber-50 text-amber-800"><tr><th className="px-2.5 py-1.5 font-medium">Khách / máy</th><th className="px-2 py-1.5 font-medium">Mực</th><th className="px-2 py-1.5 font-medium text-right">Còn (trang)</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {a.mucSapHet.map((m: any, i: number) => (
                <tr key={i}>
                  <td className="px-2.5 py-1.5"><div className="font-medium text-slate-800">{m.ten_khach_hang}</div><div className="text-[10px] text-slate-400 font-mono">{m.ma_may || '—'}</div></td>
                  <td className="px-2 py-1.5 text-[11px]"><span className={`text-[9px] font-semibold mr-1 ${m.nhom === 'trong' ? 'text-violet-600' : 'text-sky-600'}`}>{m.nhom === 'trong' ? 'Trống' : 'Mực'}</span><span className="font-mono">{m.is_group ? `Bộ màu (C/M/Y)` : m.ma_muc}</span></td>
                  <td className="px-2 py-1.5 text-right font-semibold text-red-600">{Number(m.con_lai).toLocaleString('vi-VN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    },
    {
      key: 'ton_kho_nguong', icon: Package, tone: 'amber', label: 'Hàng dưới ngưỡng tồn kho', count: a.canhBaoTonList.length,
      navHref: `${V2_BASE}/kho-hang/thong-ke`, navLabel: '→ Mở Kho hàng › Thống kê nhập', canSee: subVisible('kho_hang', 'thong_ke'),
      detail: (
        <div className="border border-amber-100 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-amber-50 text-amber-800"><tr><th className="px-2.5 py-1.5 font-medium">Mã / tên</th><th className="px-2 py-1.5 font-medium text-center">Tồn</th><th className="px-2 py-1.5 font-medium text-center">Ngưỡng</th><th className="px-2 py-1.5 font-medium text-center">Chờ về</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {a.canhBaoTonList.map((m: any) => (
                <tr key={m.ma_hang}>
                  <td className="px-2.5 py-1.5"><span className="font-mono font-semibold text-slate-700">{m.ma_hang}</span><div className="text-slate-500" title={m.ten_hang}>{m.ten_hang}{m.hang ? ` [${m.hang}]` : ''}{m.model ? ` · ${m.model}` : ''}</div></td>
                  <td className="px-2 py-1.5 text-center font-semibold text-amber-700">{m.ton_kho}</td>
                  <td className="px-2 py-1.5 text-center">{m.nguong_dat}</td>
                  <td className="px-2 py-1.5 text-center">{m.cho_ve > 0 ? m.cho_ve : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    },
    {
      key: 'unfinished', icon: AlertTriangle, tone: 'red', label: 'Phiếu ngày trước chưa Hoàn thành', count: a.unfinishedPastJobs.length,
      navHref: `${V2_BASE}/so-cong-tac/giao-viec`, navLabel: '→ Mở Sổ công tác', canSee: tabVisible('cong_viec'),
      detail: (
        <div className="border border-rose-100 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-rose-50 text-rose-800"><tr><th className="px-2.5 py-1.5 font-medium">Ngày</th><th className="px-2 py-1.5 font-medium">Khách / mã máy</th><th className="px-2 py-1.5 font-medium text-center">TT</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {a.unfinishedPastJobs.map((j: any) => (
                <tr key={j.id}>
                  <td className="px-2.5 py-1.5 whitespace-nowrap">{fmtDate(j.ngay)}</td>
                  <td className="px-2 py-1.5"><div className="font-medium text-slate-800">{j.soct_khach_hang?.ten_khach_hang || '—'}</div><div className="text-[10px] text-slate-400 font-mono">{j.ma_may || '—'} · {j.soct_users?.full_name || 'Chưa gán'}</div></td>
                  <td className="px-2 py-1.5 text-center"><span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 whitespace-nowrap">{j.ket_qua}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    },
    {
      key: 'future', icon: Clock, tone: 'blue', label: 'Phiếu đặt trước cho ngày tới', count: a.futureJobs.length,
      navHref: `${V2_BASE}/so-cong-tac/giao-viec`, navLabel: '→ Xem & sắp xếp trong Sổ công tác', canSee: tabVisible('cong_viec'),
      detail: (
        <div className="border border-blue-100 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-blue-50 text-blue-800"><tr><th className="px-2.5 py-1.5 font-medium">Ngày</th><th className="px-2 py-1.5 font-medium">Khách / mã máy</th><th className="px-2 py-1.5 font-medium">Loại · KTV</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {a.futureJobs.map((j: any) => (
                <tr key={j.id}>
                  <td className="px-2.5 py-1.5 whitespace-nowrap font-semibold text-blue-700">{fmtDate(j.ngay)}</td>
                  <td className="px-2 py-1.5"><div className="font-medium text-slate-800">{j.soct_khach_hang?.ten_khach_hang || '—'}</div><div className="text-[10px] text-slate-400 font-mono">{j.ma_may || '—'}</div></td>
                  <td className="px-2 py-1.5 text-[10px]">{j.loai_cong_viec || '—'} · {j.soct_users?.full_name || <span className="text-amber-600">Chưa giao</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    },
    {
      key: 'cskh_hen', icon: Users, tone: 'amber', label: 'Khách đến hẹn chăm sóc', count: a.henCskh.length,
      navHref: `${V2_BASE}/so-cong-tac/cham-soc-kh`, navLabel: '→ Mở Sổ công tác › Chăm sóc KH', canSee: subVisible('cong_viec', 'cham_soc_kh'),
      detail: (
        <div className="border border-amber-100 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-amber-50 text-amber-800"><tr><th className="px-2.5 py-1.5 font-medium">Khách hàng</th><th className="px-2 py-1.5 font-medium text-center">Máy</th><th className="px-2 py-1.5 font-medium text-center">Hẹn</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {a.henCskh.slice(0, 40).map((h: any) => (
                <tr key={h.ma_may}>
                  <td className="px-2.5 py-1.5"><div className="font-medium text-slate-800">{h.ten}</div></td>
                  <td className="px-2 py-1.5 text-center"><span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">{h.ma_may}</span></td>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap"><span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${h.qua_han ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{fmtDate(h.ngay_hen)}{h.qua_han ? ' · quá hạn' : ''}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {a.henCskh.length > 40 && <p className="t3 text-slate-400 px-2 py-1">…và {a.henCskh.length - 40} khách nữa.</p>}
        </div>
      ),
    },
    {
      key: 'kanban_c1', icon: ClipboardList, tone: 'amber', label: 'Thẻ chờ lên hóa đơn (Kanban Cột 1)', count: a.kanban.col1,
      navHref: `${V2_BASE}/kanban`, navLabel: '→ Mở Kanban Hóa đơn', canSee: subVisible('tai_chinh', 'kanban'),
      detail: (
        <div className="text-xs text-slate-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-relaxed">
          <b>{a.kanban.col1}</b> thẻ{a.kanban.col1_phieu !== a.kanban.col1 ? ` (gồm ${a.kanban.col1_phieu} phiếu)` : ''} đang ở Cột 1 (Chờ lên hóa đơn) — mỗi thẻ = 1 hóa đơn. Vào <b>Kanban Hóa đơn</b>: <b>bàn giao kế toán</b> lên hóa đơn, hoặc <b>thu hồi</b> về Công nợ nếu chưa cần.
        </div>
      ),
    },
    {
      key: 'kanban_c2', icon: ClipboardList, tone: 'amber', label: 'Thẻ chờ kế toán lên hóa đơn (Kanban Cột 2)', count: a.kanban.col2_chua_minv,
      navHref: `${V2_BASE}/kanban`, navLabel: '→ Mở Kanban Hóa đơn', canSee: subVisible('tai_chinh', 'kanban'),
      detail: (
        <div className="text-xs text-slate-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-relaxed">
          <b>{a.kanban.col2_chua_minv}</b> phiếu ở Cột 2 (đã bàn giao) <b>chưa xuất hóa đơn (M-invoice)</b>, đang chờ <b>kế toán (KT-HC)</b> xử lý. Khớp với badge ở menu Kanban Hóa đơn.
        </div>
      ),
    },
    {
      key: 'hdbt', icon: ClipboardCheck, tone: 'amber', label: `HĐBT/thuê sắp hết hạn (${a.hdbtCanhBaoThang} tháng)`, count: a.hdbtExpiring.length,
      navHref: `${V2_BASE}/theo-doi-may/bao-tri`, navLabel: '→ Mở Theo dõi máy › Bảo trì', canSee: subVisible('theo_doi_may', 'bao_tri'),
      detail: (
        <div className="border border-amber-100 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-amber-50 text-amber-800"><tr><th className="px-2.5 py-1.5 font-medium">Mã máy</th><th className="px-2 py-1.5 font-medium">Khách hàng</th><th className="px-2 py-1.5 font-medium text-center">Hết hạn</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {a.hdbtExpiring.map((c: any) => {
                const st = hdbtStatus(c.ngay_het_han_hdbt)
                return (
                  <tr key={c.id}>
                    <td className="px-2.5 py-1.5 font-mono">{c.ma_may || '—'}</td>
                    <td className="px-2 py-1.5"><div className="font-medium text-slate-800">{c.ten_khach_hang}</div><div className="text-[10px] text-slate-400">{c.loai_hd || '—'}</div></td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap">{st && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${st.cls}`} title={st.note}>{st.label}</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ),
    },
    {
      key: 'counter', icon: Clock, tone: 'amber', label: 'Máy thuê/CPC đến hạn lấy counter', count: a.counterDueList.length,
      navHref: `${V2_BASE}/tai-chinh/thue-cpc`, navLabel: '→ Mở Thuê/CPC › Nhập counter', canSee: subVisible('tai_chinh', 'thue_cpc'),
      detail: (
        <div className="border border-amber-100 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-amber-50 text-amber-800"><tr><th className="px-2.5 py-1.5 font-medium">Mã máy</th><th className="px-2 py-1.5 font-medium">Khách hàng</th><th className="px-2 py-1.5 font-medium text-center">TT</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {a.counterDueList.map((m: any) => {
                const overdue = m._st.status === 'overdue'
                const label = overdue ? `Quá ${m._st.days}n` : (m._st.days === 0 ? 'Hôm nay' : `Còn ${m._st.days}n`)
                const cls = overdue ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                return (
                  <tr key={m.id}>
                    <td className="px-2.5 py-1.5 font-mono">{m.ma_may || '—'}</td>
                    <td className="px-2 py-1.5"><div className="font-medium text-slate-800">{m.ten_khach_hang}</div><div className="text-[10px] text-slate-400">{m.loai_hd || '—'}</div></td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap"><span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>{label}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ),
    },
    {
      key: 'leave', icon: Palmtree, tone: 'blue', label: 'Nghỉ hôm nay', count: a.leaveToday.length,
      navHref: `${V2_BASE}/quan-ly/nghi-phep`, navLabel: '→ Mở Quản lý › Nghỉ phép', canSee: subVisible('quan_ly', 'nghi_phep'),
      detail: (
        <div className="flex flex-wrap gap-1.5 px-1 py-1">
          {a.leaveToday.map((d: any) => {
            const approved = d.trang_thai === 'da_duyet'
            return (
              <div key={d.id} className="flex items-center gap-1.5 bg-white border border-indigo-100 rounded-lg px-2 py-1">
                <span className="text-xs font-medium text-slate-800">{d.soct_users?.full_name || '—'}</span>
                <span className="t3 text-slate-500">{LOAI_LABEL[d.loai as keyof typeof LOAI_LABEL] || d.loai} · {moTaKhoang(d.tu_ngay, d.den_ngay, d.buoi)}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${approved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{approved ? 'Đã duyệt' : 'Chờ duyệt'}</span>
              </div>
            )
          })}
        </div>
      ),
    },
  ]

  const active = sections.filter(s => s.count > 0)
  const total = active.reduce((s, x) => s + x.count, 0)
  const worst = active.some(s => s.tone === 'red') ? 'red' : active.some(s => s.tone === 'amber') ? 'amber' : active.length ? 'blue' : 'none'
  const btnCls = worst === 'red' ? 'bg-red-50 border-red-200 text-red-600' : worst === 'amber' ? 'bg-amber-50 border-amber-200 text-amber-600' : worst === 'blue' ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-200 text-slate-400'
  const badgeCls = worst === 'red' ? 'bg-red-500' : worst === 'amber' ? 'bg-amber-500' : 'bg-blue-500'
  const iconTone = (t: string) => t === 'red' ? 'text-red-600' : t === 'amber' ? 'text-amber-600' : 'text-blue-600'
  const dotTone = (t: string) => t === 'red' ? 'bg-red-500' : t === 'amber' ? 'bg-amber-500' : 'bg-blue-500'

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} title="Cảnh báo & nhắc việc"
        className={`relative w-9 h-9 rounded-full border flex items-center justify-center transition ${btnCls}`}>
        <Bell className="w-[18px] h-[18px]" />
        {total > 0 && <span className={`absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full text-white t3 font-bold flex items-center justify-center ring-2 ring-white ${badgeCls}`}>{total}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 mt-2 w-[520px] max-w-[94vw] max-h-[75vh] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl z-[56]">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
              <span className="text-sm font-semibold text-slate-700">Cảnh báo &amp; nhắc việc</span>
              <span className="text-xs text-slate-400">{total > 0 ? `${total} mục` : 'Không có'}</span>
            </div>
            {active.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">Không có cảnh báo nào.</div>
            ) : (
              <div className="p-1.5">
                {active.map(s => {
                  const Icon = s.icon
                  const isOpen = expanded === s.key
                  return (
                    <div key={s.key}>
                      <button type="button" onClick={() => setExpanded(e => e === s.key ? null : s.key)} className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg hover:bg-slate-50 text-left">
                        <Icon className={`w-[18px] h-[18px] shrink-0 ${iconTone(s.tone)}`} />
                        <span className="flex-1 text-sm text-slate-700">{s.label}</span>
                        <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-white t2 font-bold flex items-center justify-center ${dotTone(s.tone)}`}>{s.count}</span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isOpen && (
                        <div className="px-1 pb-2 space-y-1.5">
                          {s.detail}
                          {s.navHref && s.canSee && (
                            <Link href={s.navHref} onClick={() => setOpen(false)}
                              className={`block w-full text-center t2 font-semibold rounded-lg border py-1.5 ${s.tone === 'red' ? 'text-red-700 bg-red-50 hover:bg-red-100 border-red-100' : s.tone === 'amber' ? 'text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-100' : 'text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-100'}`}>
                              {s.navLabel}
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
