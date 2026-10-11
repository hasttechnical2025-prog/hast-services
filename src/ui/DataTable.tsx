'use client'
import { useMemo, useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { compareVi } from './format'

// Bảng danh sách dùng chung — ĐÓNG KHUNG luật "sort cột bắt buộc":
// mọi cột có `sortValue` đều bấm tiêu đề để sắp xếp (localeCompare 'vi', numeric).
// Kèm empty state + loading. Component THUẦN hiển thị: không fetch, nhận rows qua props.

export type Column<T> = {
  key: string
  header: React.ReactNode
  /** Có hàm này => cột sắp xếp được (bấm header). */
  sortValue?: (row: T) => string | number | null | undefined
  render?: (row: T) => React.ReactNode
  align?: 'left' | 'right' | 'center'
  thClassName?: string
  tdClassName?: string
}

export function DataTable<T>({ columns, rows, rowKey, loading, empty = 'Không có dữ liệu.', defaultSort, onRowClick, className }: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T, i: number) => string
  loading?: boolean
  empty?: React.ReactNode
  defaultSort?: { key: string; asc: boolean }
  onRowClick?: (row: T) => void
  className?: string
}) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSort?.key ?? null)
  const [asc, setAsc] = useState<boolean>(defaultSort?.asc ?? true)

  const sorted = useMemo(() => {
    if (!sortKey) return rows
    const col = columns.find(c => c.key === sortKey)
    if (!col?.sortValue) return rows
    const arr = [...rows]
    arr.sort((a, b) => {
      const av = col.sortValue!(a), bv = col.sortValue!(b)
      if (typeof av === 'number' && typeof bv === 'number') return asc ? av - bv : bv - av
      return asc ? compareVi(av, bv) : compareVi(bv, av)
    })
    return arr
  }, [rows, sortKey, asc, columns])

  const toggle = (col: Column<T>) => {
    if (!col.sortValue) return
    if (sortKey === col.key) setAsc(a => !a)
    else { setSortKey(col.key); setAsc(true) }
  }

  const alignCls = (a?: string) => a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left'

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-left text-xs text-slate-600">
        <thead className="bg-slate-50/80 text-slate-500 text-[11px] font-semibold uppercase tracking-wide border-b border-slate-200/70">
          <tr>
            {columns.map(col => {
              const sortable = !!col.sortValue
              const activeSort = sortKey === col.key
              return (
                <th key={col.key} className={cn('px-3.5 py-2', alignCls(col.align), col.thClassName)}>
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggle(col)}
                      className={cn('inline-flex items-center gap-1 hover:text-slate-700 transition-colors',
                        col.align === 'right' && 'flex-row-reverse', activeSort && 'text-blue-600')}
                    >
                      {col.header}
                      {activeSort
                        ? (asc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
                        : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
                    </button>
                  ) : col.header}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? (
            <tr><td colSpan={columns.length} className="px-3.5 py-10 text-center text-slate-400 italic">Đang tải…</td></tr>
          ) : sorted.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-3.5 py-10 text-center text-slate-400 italic">{empty}</td></tr>
          ) : sorted.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn('hover:bg-slate-50/70 transition-colors', onRowClick && 'cursor-pointer')}
            >
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
  )
}
