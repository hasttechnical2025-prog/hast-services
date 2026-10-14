'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, RefreshCw, ChevronRight, Copy, CheckCircle2, Trash2 } from 'lucide-react'
import { useConfirm } from '@/components/ConfirmDialog'
import { JOBS_TOPIC, JOBS_EVENT } from '@/lib/realtime'
import { useRealtimeRefetch } from '@/lib/useRealtime'
import { normVi, BoxLoading, usePaged, Pagination } from '@/ui'
import { listBaoCao, markBaoCao, deleteBaoCao } from './api'

const dmy = (s: any) => { if (!s) return ''; const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '' }

// Ghép nội dung báo cáo để office Copy gửi khách (port y hệt buildText admin).
function buildText(r: any): string {
  const cv = r.soct_cong_viec || {}
  const kh = cv.soct_khach_hang || {}
  const code = `BC-${String(r.created_at || '').slice(0, 10).replace(/-/g, '')}-${String(r.id || '').slice(0, 4).toUpperCase()}`
  const vt = (cv.soct_chi_tiet_vat_tu || []).filter((v: any) => !v.da_tra).map((v: any) => `${v.ten_hang_hd || v.soct_kho_hang?.ten_hang || v.ma_hang} x${Number(v.so_luong) || 0}`).join(', ')
  const lines = [
    '━━━━━━━━━━━━━━━',
    '🔧 HAST · BÁO CÁO KỸ THUẬT',
    `Mã BC: ${code} · ${dmy(cv.ngay)}`,
    '━━━━━━━━━━━━━━━',
    `Kính gửi Quý khách ${kh.ten_khach_hang || 'Quý khách'},`,
    '',
    `- Thiết bị: ${kh.model || 'N/A'} — Mã máy: ${cv.ma_may || ''}`,
    (kh.vi_tri_dat_may ? `- Vị trí: ${kh.vi_tri_dat_may}` : ''),
    `- Ngày xử lý: ${dmy(cv.ngay)}`,
    `- Kết quả / tình trạng: ${r.noi_dung || ''}`,
    (vt ? `- Linh kiện đã thay: ${vt}` : ''),
    '',
    '━━━━━━━━━━━━━━━',
    'Báo cáo được hệ thống HAST tổng hợp tự động.',
  ].filter(l => l !== '')
  return lines.join('\n')
}

export function BaoCaoSuaChuaModule({ notify }: { notify: (type: 'success' | 'error', msg: string) => void }) {
  const [tab, setTab] = useState<'cho_gui' | 'da_gui'>('cho_gui')
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const { confirm, confirmNode } = useConfirm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listBaoCao(tab)
      setList(data)
      const t: Record<string, string> = {}
      for (const r of data) t[r.id] = buildText(r)
      setTexts(t)
      setOpenId(null)
    } catch (e: any) { if (e?.message !== 'UNAUTH') notify('error', e?.message || 'Lỗi tải danh sách') }
    finally { setLoading(false) }
  }, [tab, notify])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch(JOBS_TOPIC, JOBS_EVENT, () => load(), true, 0)

  const copy = (id: string) => { navigator.clipboard.writeText(texts[id] || ''); setCopied(id); setTimeout(() => setCopied(null), 1500); notify('success', 'Đã copy — dán vào Zalo/Email khách.') }
  const mark = async (id: string, action: 'da_gui' | 'cho_gui') => {
    setBusy(id)
    try { await markBaoCao(id, action); notify('success', action === 'da_gui' ? 'Đã đánh dấu đã gửi.' : 'Đã trả lại chờ gửi.'); load() }
    catch (e: any) { notify('error', e?.message || 'Lỗi') } finally { setBusy(null) }
  }
  const remove = async (id: string) => {
    if (!(await confirm('Xóa báo cáo này?', { confirmLabel: 'Xóa', danger: true }))) return
    setBusy(id)
    try { await deleteBaoCao(id); notify('success', 'Đã xóa báo cáo.'); load() }
    catch (e: any) { notify('error', e?.message || 'Lỗi') } finally { setBusy(null) }
  }

  const shown = useMemo(() => {
    const tokens = normVi(search.trim()).split(/\s+/).filter(Boolean)
    if (!tokens.length) return list
    return list.filter((r: any) => {
      const cv = r.soct_cong_viec || {}; const kh = cv.soct_khach_hang || {}
      const hay = normVi(`${kh.ten_khach_hang || ''} ${cv.ma_may || ''} ${kh.model || ''} ${r.nguoi_tao_u?.full_name || ''}`)
      return tokens.every(t => hay.includes(t))
    })
  }, [list, search])
  const paged = usePaged(shown)

  // Tab con kiểu UNDERLINE (chuẩn chung v2).
  const pill = (k: 'cho_gui' | 'da_gui', label: string) => (
    <button onClick={() => setTab(k)} className={`px-4 py-2 font-medium text-sm transition whitespace-nowrap border-b-2 ${tab === k ? 'border-blue-600 text-blue-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
  )

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 bg-slate-200 pt-2 pb-2 space-y-2.5">
        <div className="flex gap-1 border-b border-slate-200">
          {pill('cho_gui', 'Chờ gửi')}
          {pill('da_gui', 'Đã gửi')}
        </div>
        {/* Toolbar NẰM TRONG tab — ô tìm kiếm cục bộ theo tab đang mở, căn trái */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên khách / mã máy / model / KTV…" className="w-full pl-9 h-9 text-xs rounded-md border border-slate-200 bg-white outline-none focus:border-blue-500" />
          </div>
          <span className="text-xs text-slate-400 ml-auto whitespace-nowrap">{shown.length}{shown.length !== list.length ? `/${list.length}` : ''} báo cáo</span>
          <button onClick={load} className="h-9 px-3 rounded-md text-xs font-medium border border-slate-200 text-slate-600 bg-white hover:bg-blue-50 hover:text-blue-600 inline-flex items-center gap-1.5" title="Tải lại"><RefreshCw className="w-4 h-4" /> Tải lại</button>
        </div>
      </div>

      {tab === 'cho_gui' && list.length > 0 && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs px-3 py-2 leading-relaxed">
          ℹ️ Báo cáo sửa chữa được gửi từ KTV hiện trường. <b>Copy</b> nội dung báo cáo — chỉnh sửa nếu cần — và <b>paste</b> vào nhóm Zalo báo cáo sửa chữa dành cho khách hàng đã tạo.
        </div>
      )}

      {!loading && <Pagination top page={paged.page} pageCount={paged.pageCount} total={paged.total} perPage={paged.perPage} onPage={paged.setPage} onPerPage={paged.setPerPage} />}
      {loading ? <BoxLoading label="Đang tải báo cáo..." />
        : shown.length === 0 ? <p className="text-xs text-slate-400 text-center py-10 italic">{list.length === 0 ? (tab === 'cho_gui' ? 'Không có báo cáo nào chờ gửi.' : 'Chưa có báo cáo đã gửi.') : 'Không khớp tìm kiếm.'}</p>
          : (
            <div className="space-y-2">
              {paged.pageItems.map((r: any) => {
                const cv = r.soct_cong_viec || {}; const kh = cv.soct_khach_hang || {}
                const open = openId === r.id
                return (
                  <div key={r.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <button onClick={() => setOpenId(open ? null : r.id)} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left hover:bg-slate-50">
                      <ChevronRight className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                      <div className="min-w-0 flex-1">
                        <div className="t1 font-semibold text-slate-800 truncate">{kh.ten_khach_hang || 'Khách lẻ'}</div>
                        <div className="t2 text-slate-400 truncate">Mã máy {cv.ma_may || '—'} · {kh.model || 'N/A'} · {dmy(cv.ngay)} · KTV {r.nguoi_tao_u?.full_name || '—'}</div>
                      </div>
                      {tab === 'da_gui' && <span className="t3 text-emerald-600 shrink-0">đã gửi</span>}
                    </button>
                    {open && (
                      <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          <button onClick={() => copy(r.id)} className="h-9 px-3 rounded-md text-xs font-semibold border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 inline-flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" /> {copied === r.id ? 'Đã copy' : 'Copy'}</button>
                          {tab === 'cho_gui'
                            ? <button onClick={() => mark(r.id, 'da_gui')} disabled={busy === r.id} className="h-9 px-3 rounded-md text-xs font-semibold border border-emerald-300 text-white bg-emerald-600 hover:bg-emerald-700 inline-flex items-center gap-1.5 disabled:opacity-50"><CheckCircle2 className="w-3.5 h-3.5" /> Đã gửi</button>
                            : <button onClick={() => mark(r.id, 'cho_gui')} disabled={busy === r.id} className="h-9 px-3 rounded-md text-xs font-semibold border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50">Trả lại chờ gửi</button>}
                          <button onClick={() => remove(r.id)} disabled={busy === r.id} className="h-9 w-9 p-0 rounded-md text-rose-500 hover:bg-rose-50 inline-flex items-center justify-center disabled:opacity-50" title="Xóa"><Trash2 className="w-4 h-4" /></button>
                        </div>
                        <textarea value={texts[r.id] ?? ''} onChange={e => setTexts(prev => ({ ...prev, [r.id]: e.target.value }))} rows={10} className="w-full text-xs font-mono leading-relaxed rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
      {!loading && <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} perPage={paged.perPage} onPage={paged.setPage} />}
      {confirmNode}
    </div>
  )
}
