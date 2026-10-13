'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Package, Boxes, Search, ShoppingCart, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import MonthField from '@/components/MonthField'
import { TableLoading } from '@/ui'

// Port NGUYÊN NhapHangThangTool từ admin (y hệt): panel Cảnh báo tồn + Thống kê nhập theo tháng.
// Gọi lại /api/admin/nhap-hang-thang và /api/admin/canh-bao-ton.
export function NhapHangThangTool({
  showNotification,
  canhBao,
  refetchCanhBao,
  hangOptions,
  cartCount,
  onAddToCart,
  onGoToCart,
}: {
  showNotification: (type: 'success' | 'error', msg: string) => void
  canhBao: any[]
  refetchCanhBao: () => void
  hangOptions?: string[]
  cartCount?: number
  onAddToCart?: (items: { ma_hang: string, sl_dat: string }[], redirectToDatHang?: boolean) => void
  onGoToCart?: () => void
}) {
  const [thang, setThang] = useState("")
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [nhapSortField, setNhapSortField] = useState<string>("thang_nam")
  const [nhapSortAsc, setNhapSortAsc] = useState<boolean>(false) // mặc định tháng mới nhất trước
  const [q, setQ] = useState("") // tìm theo mã hàng / tên vật tư

  const handleNhapSort = (field: string) => {
    if (nhapSortField === field) {
      setNhapSortAsc(prev => !prev)
    } else {
      setNhapSortField(field)
      setNhapSortAsc(field === 'thang_nam' ? false : true)
    }
  }

  const sortedRows = useMemo(() => {
    const list = [...rows]
    list.sort((a, b) => {
      let cmp = 0
      if (nhapSortField === 'thang_nam') {
        cmp = String(a.thang_nam || '').localeCompare(String(b.thang_nam || ''))
      } else if (nhapSortField === 'ma_hang') {
        cmp = String(a.ma_hang || '').localeCompare(String(b.ma_hang || ''), 'vi', { numeric: true, sensitivity: 'base' })
      } else if (nhapSortField === 'ten_hang') {
        const tA = a.soct_kho_hang?.ten_hang || ''
        const tB = b.soct_kho_hang?.ten_hang || ''
        cmp = tA.localeCompare(tB, 'vi', { numeric: true, sensitivity: 'base' })
      } else if (nhapSortField === 'so_luong_nhap') {
        cmp = (Number(a.so_luong_nhap) || 0) - (Number(b.so_luong_nhap) || 0)
      }
      if (cmp === 0) {
        cmp = String(a.id || '').localeCompare(String(b.id || ''))
      }
      return nhapSortAsc ? cmp : -cmp
    })
    return list
  }, [rows, nhapSortField, nhapSortAsc])

  // Lọc theo mã hàng / tên vật tư (không phân biệt dấu & hoa thường) — office tra để cân đối đặt hàng.
  const filteredRows = useMemo(() => {
    const kw = q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
    if (!kw) return sortedRows
    return sortedRows.filter(r => {
      const hay = `${r.ma_hang || ''} ${r.soct_kho_hang?.ten_hang || ''}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
      return hay.includes(kw)
    })
  }, [sortedRows, q])

  const fetchRows = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/nhap-hang-thang' + (thang ? `?thang_nam=${thang}` : ''))
      const json = await res.json()
      setRows(json.data || [])
    } catch { showNotification('error', "Không tải được thống kê") }
    finally { setLoading(false) }
  }
  useEffect(() => { fetchRows() }, [thang]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { refetchCanhBao() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ===== Panel cảnh báo tồn kho =====
  const [ngMap, setNgMap] = useState<Record<string, string>>({})
  const [dirtyNg, setDirtyNg] = useState<Set<string>>(new Set())
  const [savingNg, setSavingNg] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [filterSearch, setFilterSearch] = useState("")
  const [filterModel, setFilterModel] = useState("")
  const [filterHang, setFilterHang] = useState("")
  const [sortField, setSortField] = useState<string>("model")
  const [sortAsc, setSortAsc] = useState<boolean>(true)
  const [extraRows, setExtraRows] = useState<any[]>([])
  const [findKw, setFindKw] = useState("")
  const [finding, setFinding] = useState(false)
  const [sug, setSug] = useState<any[]>([])
  const [showSug, setShowSug] = useState(false)
  const [sugLoading, setSugLoading] = useState(false)
  const sugToken = useRef(0)
  const addWrapRef = useRef<HTMLDivElement>(null)
  const sugBoxRef = useRef<HTMLDivElement>(null)
  const [sugRect, setSugRect] = useState<{ left: number; top: number; width: number } | null>(null)

  useEffect(() => {
    const kw = findKw.trim()
    if (kw.length < 2) { setSug([]); setSugLoading(false); return }
    const t = ++sugToken.current
    setSugLoading(true); setShowSug(true)
    const id = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/canh-bao-ton?find=' + encodeURIComponent(kw))
        const j = await res.json()
        if (t !== sugToken.current) return
        setSug(res.ok ? (j.items || []).slice(0, 40) : [])
      } catch { if (t === sugToken.current) setSug([]) }
      finally { if (t === sugToken.current) setSugLoading(false) }
    }, 250)
    return () => clearTimeout(id)
  }, [findKw])

  useEffect(() => {
    if (!showSug) return
    const upd = () => { const el = addWrapRef.current; if (el) { const r = el.getBoundingClientRect(); setSugRect({ left: r.left, top: r.bottom + 4, width: r.width }) } }
    upd()
    window.addEventListener('scroll', upd, true); window.addEventListener('resize', upd)
    const onDoc = (e: MouseEvent) => {
      if (addWrapRef.current?.contains(e.target as Node)) return
      if (sugBoxRef.current?.contains(e.target as Node)) return
      setShowSug(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => { window.removeEventListener('scroll', upd, true); window.removeEventListener('resize', upd); document.removeEventListener('mousedown', onDoc) }
  }, [showSug, sug.length])

  const addOneRow = (item: any) => {
    setExtraRows(prev => prev.some((x: any) => x.ma_hang === item.ma_hang) ? prev : [...prev, item])
    setShowAll(true); setShowSug(false); setFindKw("")
  }

  const canhBaoMerged = useMemo(() => {
    const have = new Set((canhBao || []).map((x: any) => x.ma_hang))
    return [...(canhBao || []), ...extraRows.filter((x: any) => !have.has(x.ma_hang))]
  }, [canhBao, extraRows])

  const doFindAll = async () => {
    const kw = findKw.trim()
    if (!kw) return
    setFinding(true)
    try {
      const res = await fetch('/api/admin/canh-bao-ton?find=' + encodeURIComponent(kw))
      const j = await res.json()
      if (!res.ok) { showNotification('error', j.error || 'Lỗi tìm kho'); return }
      const items: any[] = j.items || []
      const have = new Set((canhBao || []).map((x: any) => x.ma_hang))
      const add = items.filter((x: any) => !have.has(x.ma_hang))
      setExtraRows(prev => {
        const seen = new Set(prev.map((x: any) => x.ma_hang))
        return [...prev, ...add.filter((x: any) => !seen.has(x.ma_hang))]
      })
      setShowAll(true); setShowSug(false)
      if (items.length === 0) showNotification('error', 'Không tìm thấy mã/tên trong kho.')
      else if (add.length === 0) showNotification('success', 'Các mã khớp đã có trong danh sách.')
      else showNotification('success', `Đã thêm ${add.length} mặt hàng vào danh sách để đặt ngưỡng.`)
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setFinding(false) }
  }

  const handleSort = (field: string) => {
    if (sortField === field) setSortAsc(prev => !prev)
    else { setSortField(field); setSortAsc(true) }
  }

  const allHangOptions = useMemo(() => {
    const set = new Set<string>(hangOptions || [])
    for (const x of canhBaoMerged) {
      const h = String(x.hang || '').trim()
      if (h) set.add(h)
    }
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b))
  }, [hangOptions, canhBaoMerged])

  useEffect(() => {
    const m: Record<string, string> = {}
    for (const x of (canhBao || [])) m[x.ma_hang] = x.nguong_dat == null ? '' : String(x.nguong_dat)
    setNgMap(m); setDirtyNg(new Set()); setExtraRows([])
  }, [canhBao])

  useEffect(() => {
    if (!extraRows.length) return
    setNgMap(prev => {
      const m = { ...prev }
      for (const x of extraRows) if (!(x.ma_hang in m)) m[x.ma_hang] = x.nguong_dat == null ? '' : String(x.nguong_dat)
      return m
    })
  }, [extraRows])
  const ngOf = (ma: string) => (ngMap[ma] ?? '')
  const setNg = (ma: string, v: string) => {
    const digits = v.replace(/[^\d]/g, '')
    setNgMap(p => ({ ...p, [ma]: digits }))
    setDirtyNg(d => { const n = new Set(d); n.add(ma); return n })
  }
  const isWarn = (x: any) => { const n = Number(ngOf(x.ma_hang) || 0); return n > 0 && Number(x.ton_kho) <= n }
  const isSavedWarn = (x: any) => { const n = Number(x.nguong_dat || 0); return n > 0 && Number(x.ton_kho) <= n }
  const cbRows = canhBaoMerged
    .filter((x: any) => showAll || isSavedWarn(x) || dirtyNg.has(x.ma_hang))
    .filter((x: any) => {
      if (filterSearch) {
        const qq = filterSearch.trim().toLowerCase()
        const match = (x.ma_hang || '').toLowerCase().includes(qq) || (x.ten_hang || '').toLowerCase().includes(qq)
        if (!match) return false
      }
      if (filterModel) {
        const qModel = filterModel.trim().toLowerCase()
        const itemModel = String(x.model || '').toLowerCase()
        if (!itemModel.includes(qModel)) return false
      }
      if (filterHang && String(x.hang || '').trim().toLowerCase() !== filterHang.trim().toLowerCase()) return false
      return true
    })
    .sort((a: any, b: any) => {
      let cmp = 0
      if (sortField === 'model') {
        const mA = String(a.model || '').trim(); const mB = String(b.model || '').trim()
        if (!mA && mB) return 1; if (mA && !mB) return -1
        cmp = mA.localeCompare(mB, 'vi', { numeric: true, sensitivity: 'base' })
      } else if (sortField === 'ma_hang') {
        cmp = String(a.ma_hang || '').localeCompare(String(b.ma_hang || ''), 'vi', { numeric: true, sensitivity: 'base' })
      } else if (sortField === 'ten_hang') {
        cmp = String(a.ten_hang || '').localeCompare(String(b.ten_hang || ''), 'vi', { numeric: true, sensitivity: 'base' })
      } else if (sortField === 'hang') {
        const hA = String(a.hang || '').trim(); const hB = String(b.hang || '').trim()
        if (!hA && hB) return 1; if (hA && !hB) return -1
        cmp = hA.localeCompare(hB, 'vi', { numeric: true, sensitivity: 'base' })
      } else if (sortField === 'ton_kho') {
        cmp = (Number(a.ton_kho) || 0) - (Number(b.ton_kho) || 0)
      } else if (sortField === 'cho_ve') {
        cmp = (Number(a.cho_ve) || 0) - (Number(b.cho_ve) || 0)
      } else if (sortField === 'nguong_dat') {
        cmp = (Number(a.nguong_dat) || 0) - (Number(b.nguong_dat) || 0)
      } else if (sortField === 'thieu') {
        const thieuA = isSavedWarn(a) ? (Number(a.nguong_dat) || 0) - (Number(a.ton_kho) || 0) : 0
        const thieuB = isSavedWarn(b) ? (Number(b.nguong_dat) || 0) - (Number(b.ton_kho) || 0) : 0
        cmp = thieuA - thieuB
      }
      if (cmp === 0) cmp = String(a.ma_hang || '').localeCompare(String(b.ma_hang || ''))
      return sortAsc ? cmp : -cmp
    })
  const warnCount = canhBaoMerged.filter(isWarn).length

  const thieuList = useMemo(() => {
    return cbRows
      .map((x: any) => {
        const warn = isWarn(x)
        const n = Number(ngOf(x.ma_hang) || 0)
        const thieu = warn ? n - Number(x.ton_kho) : 0
        return { ma_hang: x.ma_hang, sl_dat: String(thieu), thieu }
      })
      .filter(it => it.thieu > 0)
  }, [cbRows, ngMap]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddAllToCart = () => {
    if (thieuList.length === 0) return
    onAddToCart?.(thieuList.map(t => ({ ma_hang: t.ma_hang, sl_dat: t.sl_dat })), true)
    showNotification('success', `Đã nhặt ${thieuList.length} mặt hàng thiếu vào Giỏ đặt hàng và chuyển sang tab Đặt hàng.`)
  }

  const saveNg = async () => {
    if (dirtyNg.size === 0) return
    setSavingNg(true)
    try {
      const items = [...dirtyNg].map(ma => ({ ma_hang: ma, nguong_dat: ngOf(ma) === '' ? null : Number(ngOf(ma)) }))
      const res = await fetch('/api/admin/canh-bao-ton', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) })
      const j = await res.json()
      if (res.ok) { showNotification('success', `Đã lưu ngưỡng ${j.saved} mặt hàng.`); refetchCanhBao() }
      else showNotification('error', j.error || 'Lỗi lưu ngưỡng')
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setSavingNg(false) }
  }

  return (
    <div className="space-y-4">
      {/* ===== Cảnh báo tồn kho ===== */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Package className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">Cảnh báo tồn kho {warnCount > 0 && <span className="text-amber-700">({warnCount})</span>}</h3>
            <p className="t2 text-slate-500">Mặt hàng đã nhập trong 12 tháng gần nhất (mọi hãng) + mọi mặt hàng <b>đã đặt ngưỡng</b>. Cảnh báo khi <b>tồn ≤ ngưỡng</b>. Bỏ trống ngưỡng = không cảnh báo. Hàng nhập đã lâu: dùng ô <b>“Thêm mặt hàng cũ”</b> bên dưới.</p>
          </div>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {cartCount != null && cartCount > 0 && onGoToCart && (
              <button type="button" onClick={onGoToCart} className="text-xs font-semibold px-2.5 py-1.5 rounded border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 flex items-center gap-1.5 transition" title="Chuyển sang tab Đặt hàng để xem giỏ hàng">
                <ShoppingCart className="w-3.5 h-3.5" /> Xem giỏ ({cartCount})
              </button>
            )}
            {thieuList.length > 0 && onAddToCart && (
              <button type="button" onClick={handleAddAllToCart} className="text-xs font-semibold px-2.5 py-1.5 rounded border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 flex items-center gap-1.5 transition" title="Nhặt toàn bộ các mặt hàng đang thiếu vào Giỏ đặt hàng và chuyển sang tab Đặt hàng">
                <ShoppingCart className="w-3.5 h-3.5 text-amber-600" /> Nhặt vào Giỏ đặt hàng ({thieuList.length} món)
              </button>
            )}
            <button onClick={() => setShowAll(s => !s)} className="text-xs font-semibold px-2.5 py-1.5 rounded border border-slate-200 text-slate-600 bg-white hover:bg-slate-50">
              {showAll ? 'Chỉ hiện cảnh báo' : '⚙ Thiết lập ngưỡng (tất cả)'}
            </button>
            <Button onClick={saveNg} disabled={savingNg || dirtyNg.size === 0} className="h-9 gap-1.5">
              {savingNg ? 'Đang lưu…' : dirtyNg.size > 0 ? `Lưu (${dirtyNg.size})` : 'Đã lưu'}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center pt-1 border-t border-slate-100">
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input placeholder="Gõ mã / tên vật tư..." className="pl-8 pr-6 h-9 text-xs bg-white" value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} />
            {filterSearch && <button onClick={() => setFilterSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs" title="Xóa tìm kiếm mã / tên">✕</button>}
          </div>
          <div className="relative w-44">
            <Input placeholder="Tìm / gõ model..." className="h-9 text-xs bg-white pr-6" value={filterModel} onChange={(e) => setFilterModel(e.target.value)} />
            {filterModel && <button onClick={() => setFilterModel("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs" title="Xóa bộ lọc model">✕</button>}
          </div>
          <select value={filterHang} onChange={(e) => setFilterHang(e.target.value)} className="h-9 px-2 w-36 rounded-md border border-slate-200 text-xs bg-white outline-none focus:ring-1 focus:ring-blue-500">
            <option value="">Hãng: Tất cả</option>
            {allHangOptions.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          {(filterSearch || filterModel || filterHang) && <button onClick={() => { setFilterSearch(""); setFilterModel(""); setFilterHang("") }} className="text-xs text-rose-600 hover:underline font-medium ml-1">Bỏ lọc</button>}
          <div className="t2 text-slate-400 ml-auto">Hiển thị <b>{cbRows.length}</b> mặt hàng</div>
        </div>

        <div className="flex flex-wrap gap-2 items-center bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
          <span className="t2 font-semibold text-slate-600">Thêm mặt hàng cũ:</span>
          <div className="relative w-72" ref={addWrapRef}>
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input placeholder="Gõ mã / tên vật tư (gợi ý từ toàn kho)…" className="pl-8 pr-6 h-9 text-xs bg-white" value={findKw} onChange={(e) => setFindKw(e.target.value)} onFocus={() => { if (findKw.trim().length >= 2) setShowSug(true) }} />
            {findKw && <button onClick={() => { setFindKw(""); setSug([]); setShowSug(false) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs" title="Xóa">✕</button>}
          </div>
          <button type="button" onClick={doFindAll} disabled={finding || !findKw.trim()} className="text-xs font-semibold px-3 py-2 rounded border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 transition" title="Thêm TẤT CẢ mặt hàng khớp mã/tên vào danh sách để đặt ngưỡng">
            {finding ? 'Đang tra…' : 'Thêm tất cả khớp'}
          </button>
        </div>

        {showSug && sugRect && findKw.trim().length >= 2 && typeof document !== 'undefined' && createPortal(
          <div ref={sugBoxRef} style={{ position: 'fixed', left: sugRect.left, top: sugRect.top, width: Math.max(sugRect.width, 360), zIndex: 9999 }} className="bg-white border border-slate-200 rounded-lg shadow-xl max-h-80 overflow-y-auto text-xs">
            {sugLoading && <div className="px-3 py-2.5 text-slate-400">Đang tra kho…</div>}
            {!sugLoading && sug.length === 0 && <div className="px-3 py-2.5 text-rose-600">Không có mã/tên nào khớp trong kho.</div>}
            {!sugLoading && sug.map((it: any) => {
              const inList = canhBaoMerged.some((x: any) => x.ma_hang === it.ma_hang)
              const hasNg = it.nguong_dat != null && Number(it.nguong_dat) > 0
              return (
                <button key={it.ma_hang} type="button" onClick={() => addOneRow(it)} className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-slate-100 last:border-b-0 flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-slate-800">{it.ma_hang}</span>
                      {hasNg && <span className="t3 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">ngưỡng {Number(it.nguong_dat).toLocaleString('vi-VN')}</span>}
                      {inList && <span className="t3 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold">đã trong danh sách</span>}
                    </div>
                    <div className="text-slate-600 truncate">{it.ten_hang || <span className="italic text-slate-400">(chưa có tên)</span>}</div>
                    {(it.model || it.hang) && <div className="t2 text-slate-400 truncate">{[it.hang, it.model].filter(Boolean).join(' · ')}</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="t3 text-slate-400 uppercase">Tồn</div>
                    <div className={`font-bold ${Number(it.ton_kho) <= 0 ? 'text-rose-600' : 'text-slate-700'}`}>{Number(it.ton_kho || 0).toLocaleString('vi-VN')}</div>
                  </div>
                </button>
              )
            })}
          </div>,
          document.body
        )}

        {dirtyNg.size > 0 && (
          <div className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5">
            ⚠ Còn <b>{dirtyNg.size}</b> ngưỡng chưa lưu — bấm <b>Lưu</b>. Reload khi chưa lưu sẽ mất thay đổi.
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase border-b border-slate-200 select-none">
              <tr>
                <th onClick={() => handleSort('ma_hang')} className={`px-3 py-2 cursor-pointer transition-colors ${sortField === 'ma_hang' ? 'text-blue-600 font-bold bg-blue-50/60' : 'hover:bg-slate-100 hover:text-slate-700'}`} title="Bấm để sắp xếp theo Mã hàng">
                  <div className="flex items-center gap-1"><span>Mã hàng</span>{sortField === 'ma_hang' && (sortAsc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}</div>
                </th>
                <th onClick={() => handleSort('ten_hang')} className={`px-3 py-2 cursor-pointer transition-colors ${sortField === 'ten_hang' ? 'text-blue-600 font-bold bg-blue-50/60' : 'hover:bg-slate-100 hover:text-slate-700'}`} title="Bấm để sắp xếp theo Tên hàng">
                  <div className="flex items-center gap-1"><span>Tên hàng</span>{sortField === 'ten_hang' && (sortAsc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}</div>
                </th>
                <th onClick={() => handleSort('hang')} className={`px-2 py-2 cursor-pointer transition-colors ${sortField === 'hang' ? 'text-blue-600 font-bold bg-blue-50/60' : 'hover:bg-slate-100 hover:text-slate-700'}`} title="Bấm để sắp xếp theo Hãng">
                  <div className="flex items-center gap-1"><span>Hãng</span>{sortField === 'hang' && (sortAsc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}</div>
                </th>
                <th onClick={() => handleSort('model')} className={`px-3 py-2 cursor-pointer transition-colors ${sortField === 'model' ? 'text-blue-600 font-bold bg-blue-50/60' : 'hover:bg-slate-100 hover:text-slate-700'}`} title="Bấm để sắp xếp theo Model máy">
                  <div className="flex items-center gap-1"><span>Model</span>{sortField === 'model' && (sortAsc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}</div>
                </th>
                <th onClick={() => handleSort('ton_kho')} className={`px-2 py-2 text-center cursor-pointer transition-colors ${sortField === 'ton_kho' ? 'text-blue-600 font-bold bg-blue-50/60' : 'hover:bg-slate-100 hover:text-slate-700'}`} title="Bấm để sắp xếp theo SL Tồn">
                  <div className="flex items-center justify-center gap-1"><span>Tồn</span>{sortField === 'ton_kho' && (sortAsc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}</div>
                </th>
                <th onClick={() => handleSort('cho_ve')} className={`px-2 py-2 text-center cursor-pointer transition-colors ${sortField === 'cho_ve' ? 'text-blue-600 font-bold bg-blue-50/60' : 'hover:bg-slate-100 hover:text-slate-700'}`} title="Bấm để sắp xếp theo SL Chờ về">
                  <div className="flex items-center justify-center gap-1"><span>Chờ về</span>{sortField === 'cho_ve' && (sortAsc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}</div>
                </th>
                <th onClick={() => handleSort('nguong_dat')} className={`px-3 py-2 text-center w-28 cursor-pointer transition-colors ${sortField === 'nguong_dat' ? 'text-blue-600 font-bold bg-blue-50/60' : 'hover:bg-slate-100 hover:text-slate-700'}`} title="Bấm để sắp xếp theo Ngưỡng">
                  <div className="flex items-center justify-center gap-1"><span>Ngưỡng</span>{sortField === 'nguong_dat' && (sortAsc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}</div>
                </th>
                <th onClick={() => handleSort('thieu')} className={`px-2 py-2 text-center cursor-pointer transition-colors ${sortField === 'thieu' ? 'text-blue-600 font-bold bg-blue-50/60' : 'hover:bg-slate-100 hover:text-slate-700'}`} title="Bấm để sắp xếp theo Số lượng Thiếu">
                  <div className="flex items-center justify-center gap-1"><span>Thiếu</span>{sortField === 'thieu' && (sortAsc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}</div>
                </th>
                <th className="px-2 py-2 text-center w-24">Đặt hàng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cbRows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-slate-400">
                  {(filterSearch || filterModel || filterHang) ? 'Không tìm thấy mặt hàng khớp bộ lọc.' : showAll ? 'Không có mặt hàng nào đã nhập trong 12 tháng.' : 'Không có mặt hàng nào dưới ngưỡng khớp bộ lọc. Bấm "Thiết lập ngưỡng" để xem và đặt ngưỡng.'}
                </td></tr>
              ) : cbRows.map((x: any) => {
                const warn = isWarn(x); const n = Number(ngOf(x.ma_hang) || 0)
                const thieu = warn ? n - Number(x.ton_kho) : 0
                return (
                  <tr key={x.ma_hang} className={warn ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                    <td className="px-3 py-1.5 font-mono font-medium text-slate-700">{x.ma_hang}</td>
                    <td className="px-3 py-1.5">{x.ten_hang}</td>
                    <td className="px-2 py-1.5 text-xs text-slate-500">{x.hang || '—'}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-500">{x.model || '—'}</td>
                    <td className={`px-2 py-1.5 text-center font-semibold ${warn ? 'text-amber-700' : 'text-slate-700'}`}>{x.ton_kho}</td>
                    <td className="px-2 py-1.5 text-center">{x.cho_ve > 0 ? x.cho_ve : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-1.5 text-center">
                      <Input value={ngOf(x.ma_hang)} onChange={e => setNg(x.ma_hang, e.target.value)} placeholder="—" className="h-8 bg-white text-center w-24 mx-auto" />
                    </td>
                    <td className="px-2 py-1.5 text-center font-semibold text-rose-600">{thieu > 0 ? thieu : ''}</td>
                    <td className="px-2 py-1.5 text-center">
                      {thieu > 0 ? (
                        <button type="button" onClick={() => { onAddToCart?.([{ ma_hang: x.ma_hang, sl_dat: String(thieu) }], false); showNotification('success', `Đã thêm ${x.ma_hang} (${thieu}) vào giỏ đặt hàng`) }} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition" title={`Nhặt ${thieu} ${x.ma_hang} vào giỏ hàng`}>
                          + Đặt ({thieu})
                        </button>
                      ) : (<span className="text-slate-300 text-xs">—</span>)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Danh sách Thống kê nhập hàng theo tháng ===== */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <Boxes className="w-5 h-5 text-blue-600 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                Thống kê nhập hàng theo tháng {rows.length > 0 && <span className="text-slate-500 font-normal">({q.trim() ? `${filteredRows.length}/${rows.length}` : rows.length} lượt nhập{thang ? ` · Tháng ${thang.split('-').reverse().join('/')}` : ''})</span>}
              </h3>
            </div>
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Tìm mã hàng / tên vật tư</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input value={q} onChange={e => setQ(e.target.value)} placeholder="VD: TN326, trống lấy ảnh..." className="pl-8 h-9 text-xs w-56 bg-white" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Lọc theo tháng (để trống = tất cả)</label>
              <MonthField value={thang} onChange={setThang} className="h-9 px-3 text-xs w-44" />
            </div>
            {thang && <Button variant="outline" onClick={() => setThang("")} className="h-9 text-xs">Xem tất cả</Button>}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden max-h-[480px] overflow-y-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide sticky top-0 border-b border-slate-200 shadow-sm z-10">
              <tr>
                <th onClick={() => handleNhapSort('thang_nam')} className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors ${nhapSortField === 'thang_nam' ? 'text-blue-600 font-bold bg-blue-50/60' : 'hover:bg-slate-100 hover:text-slate-700'}`} title="Bấm để sắp xếp theo Tháng">
                  <div className="inline-flex items-center gap-1"><span>Tháng</span>{nhapSortField === 'thang_nam' && (nhapSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                </th>
                <th onClick={() => handleNhapSort('ma_hang')} className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors ${nhapSortField === 'ma_hang' ? 'text-blue-600 font-bold bg-blue-50/60' : 'hover:bg-slate-100 hover:text-slate-700'}`} title="Bấm để sắp xếp theo Mã hàng">
                  <div className="inline-flex items-center gap-1"><span>Mã hàng</span>{nhapSortField === 'ma_hang' && (nhapSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                </th>
                <th onClick={() => handleNhapSort('ten_hang')} className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors ${nhapSortField === 'ten_hang' ? 'text-blue-600 font-bold bg-blue-50/60' : 'hover:bg-slate-100 hover:text-slate-700'}`} title="Bấm để sắp xếp theo Tên vật tư">
                  <div className="inline-flex items-center gap-1"><span>Tên vật tư</span>{nhapSortField === 'ten_hang' && (nhapSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                </th>
                <th onClick={() => handleNhapSort('so_luong_nhap')} className={`px-4 py-3 font-semibold text-center cursor-pointer select-none transition-colors ${nhapSortField === 'so_luong_nhap' ? 'text-blue-600 font-bold bg-blue-50/60' : 'hover:bg-slate-100 hover:text-slate-700'}`} title="Bấm để sắp xếp theo SL nhập">
                  <div className="inline-flex items-center justify-center gap-1"><span>SL nhập</span>{nhapSortField === 'so_luong_nhap' && (nhapSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <TableLoading colSpan={4} label="Đang tải thống kê nhập..." />
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">{q.trim() ? `Không có mặt hàng khớp "${q.trim()}".` : 'Chưa có dữ liệu nhập.'}</td></tr>
              ) : filteredRows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-xs">{r.thang_nam.split('-').reverse().join('/')}</td>
                  <td className="px-4 py-2.5 font-mono font-medium text-slate-700">{r.ma_hang}</td>
                  <td className="px-4 py-2.5">{r.soct_kho_hang?.ten_hang || ''}</td>
                  <td className="px-4 py-2.5 text-center font-bold text-emerald-600">{r.so_luong_nhap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
