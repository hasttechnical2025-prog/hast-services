'use client'
import { useMemo, useState, useRef, useLayoutEffect } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, Filter, X, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { compareVi } from './format'

// Bảng danh sách dùng chung — ĐÓNG KHUNG 2 luật:
//  1) "sort cột bắt buộc": cột có `sortValue` → bấm tiêu đề để sắp xếp.
//  2) "lọc tại cột" (kiểu AutoFilter Excel): cột có `filter` → icon phễu mở popover chọn.
// Bấm CHỮ tiêu đề = sắp xếp; bấm PHỄU = lọc (tách riêng, không nhầm). Lọc là CLIENT (trên rows đã nạp).
// Component THUẦN: không fetch, nhận rows qua props.

export type ColumnFilter<T> = {
  /** Mỗi lựa chọn kèm hàm test(row) — linh hoạt cho cả so khớp bằng lẫn điều kiện tính toán (vd HĐ). */
  options: { value: string; label: string; test: (row: T) => boolean }[]
  title?: string
}

export type Column<T> = {
  key: string
  header: React.ReactNode
  sortValue?: (row: T) => string | number | null | undefined
  filter?: ColumnFilter<T>
  render?: (row: T) => React.ReactNode
  align?: 'left' | 'right' | 'center'
  thClassName?: string
  tdClassName?: string
}

export function DataTable<T>({ columns, rows, rowKey, loading, loadingText = 'Đang tải...', empty = 'Không có dữ liệu.', defaultSort, onRowClick, className, filters: filtersProp, onFilterChange, onClearFilters }: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T, i: number) => string
  loading?: boolean
  /** Nhãn loading cụ thể "Đang tải <cái gì>...". */
  loadingText?: string
  empty?: React.ReactNode
  defaultSort?: { key: string; asc: boolean }
  onRowClick?: (row: T) => void
  className?: string
  /** CONTROLLED: truyền filters + onFilterChange thì cha TỰ áp lọc (DataTable chỉ vẽ phễu/chip);
   *  bỏ trống = DataTable tự lọc nội bộ (cho module đơn giản). */
  filters?: Record<string, string>
  onFilterChange?: (key: string, value: string) => void
  onClearFilters?: () => void
}) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSort?.key ?? null)
  const [asc, setAsc] = useState<boolean>(defaultSort?.asc ?? true)
  const [internalFilters, setInternalFilters] = useState<Record<string, string>>({})
  const [popCol, setPopCol] = useState<string | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const controlled = !!onFilterChange
  const filters = controlled ? (filtersProp || {}) : internalFilters
  const setFilter = (key: string, val: string) => controlled ? onFilterChange!(key, val) : setInternalFilters(f => ({ ...f, [key]: val }))
  const clearFilters = () => controlled ? onClearFilters?.() : setInternalFilters({})

  // Lọc client theo từng cột (AND). CONTROLLED: cha đã lọc rồi -> giữ nguyên rows.
  const filtered = useMemo(() => {
    if (controlled) return rows
    const active = Object.entries(internalFilters).filter(([, v]) => v)
    if (active.length === 0) return rows
    return rows.filter(row => active.every(([key, val]) => {
      const col = columns.find(c => c.key === key)
      const opt = col?.filter?.options.find(o => o.value === val)
      return opt ? opt.test(row) : true
    }))
  }, [rows, internalFilters, columns, controlled])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    const col = columns.find(c => c.key === sortKey)
    if (!col?.sortValue) return filtered
    const arr = [...filtered]
    arr.sort((a, b) => {
      const av = col.sortValue!(a), bv = col.sortValue!(b)
      if (typeof av === 'number' && typeof bv === 'number') return asc ? av - bv : bv - av
      return asc ? compareVi(av, bv) : compareVi(bv, av)
    })
    return arr
  }, [filtered, sortKey, asc, columns])

  const toggleSort = (col: Column<T>) => {
    if (!col.sortValue) return
    if (sortKey === col.key) setAsc(a => !a)
    else { setSortKey(col.key); setAsc(true) }
  }

  const openPop = (col: Column<T>) => {
    const btn = btnRefs.current[col.key]
    if (!btn) return
    const r = btn.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 220)) })
    setPopCol(p => p === col.key ? null : col.key)
  }
  useLayoutEffect(() => {
    if (!popCol) return
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-dt-pop]') && !(e.target as HTMLElement).closest('[data-dt-fnl]')) setPopCol(null) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [popCol])

  const activeChips = columns.filter(c => c.filter && filters[c.key]).map(c => {
    const opt = c.filter!.options.find(o => o.value === filters[c.key])
    return { key: c.key, label: `${c.filter!.title || c.key}: ${opt?.label ?? ''}` }
  })

  const alignCls = (a?: string) => a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left'
  const popColDef = popCol ? columns.find(c => c.key === popCol) : null

  return (
    <div className={className}>
      {activeChips.length > 0 && (
        <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2 flex-wrap text-xs">
          <span className="text-slate-400">Đang lọc:</span>
          {activeChips.map(ch => (
            <span key={ch.key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              {ch.label}<button onClick={() => setFilter(ch.key, '')} className="hover:text-blue-900"><X className="w-3 h-3" /></button>
            </span>
          ))}
          <button onClick={clearFilters} className="text-rose-600 hover:underline ml-1">Bỏ lọc cột</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50/80 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200/70">
            <tr>
              {columns.map(col => {
                const activeSort = sortKey === col.key
                const hasFilter = !!col.filter
                const filterOn = hasFilter && !!filters[col.key]
                return (
                  <th key={col.key} className={cn('px-3.5 py-2', alignCls(col.align), filterOn && 'text-blue-600', col.thClassName)}>
                    <span className={cn('inline-flex items-center gap-1', col.align === 'right' && 'flex-row-reverse')}>
                      {col.sortValue ? (
                        <button type="button" onClick={() => toggleSort(col)} className={cn('inline-flex items-center gap-1 hover:text-slate-700 transition-colors', col.align === 'right' && 'flex-row-reverse', activeSort && 'text-blue-600')}>
                          {col.header}
                          {activeSort ? (asc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
                        </button>
                      ) : <span>{col.header}</span>}
                      {hasFilter && (
                        <button type="button" data-dt-fnl ref={el => { btnRefs.current[col.key] = el }} onClick={() => openPop(col)} title="Lọc cột" className="ml-0.5">
                          <Filter className={cn('w-3 h-3', filterOn ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600')} />
                        </button>
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={columns.length} className="px-3.5 py-10 text-center text-sm text-slate-400"><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1.5 text-blue-600" />{loadingText}</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-3.5 py-10 text-center text-slate-400 italic">{empty}</td></tr>
            ) : sorted.map((row, i) => (
              <tr key={rowKey(row, i)} onClick={onRowClick ? () => onRowClick(row) : undefined} className={cn('hover:bg-slate-50/70 transition-colors', onRowClick && 'cursor-pointer')}>
                {columns.map(col => (
                  <td key={col.key} className={cn('px-3.5 py-2.5', alignCls(col.align), col.tdClassName)}>
                    {col.render ? col.render(row) : String((row as any)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {popColDef?.filter && pos && (
        <div data-dt-pop className="fixed z-50 w-52 bg-white rounded-lg border border-slate-200 shadow-lg p-2" style={{ top: pos.top, left: pos.left }}>
          <div className="text-[11px] font-semibold text-slate-500 mb-1.5 px-1">Lọc: {popColDef.filter.title || popColDef.key}</div>
          <div className="max-h-56 overflow-y-auto">
            <button onClick={() => { setFilter(popColDef.key, ''); setPopCol(null) }} className={cn('w-full text-left px-2 py-1.5 rounded text-xs hover:bg-slate-50', !filters[popColDef.key] && 'text-blue-700 font-medium')}>Tất cả</button>
            {popColDef.filter.options.map(o => (
              <button key={o.value} onClick={() => { setFilter(popColDef.key, o.value); setPopCol(null) }}
                className={cn('w-full text-left px-2 py-1.5 rounded text-xs hover:bg-slate-50', filters[popColDef.key] === o.value && 'bg-blue-50 text-blue-700 font-medium')}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
