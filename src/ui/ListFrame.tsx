'use client'
import type { ReactNode } from 'react'
import { Pagination } from './table-helpers'

// Khung danh sách CHUẨN (dùng chung mọi màn): 1 THẺ TRẮNG bọc cả vùng chức năng + vùng nội dung.
//  - toolbar: vùng chức năng (tìm/lọc/nút) — nằm TRÊN cùng, trong thẻ.
//  - aboveTable: panel phụ tùy chọn (vd nhập hàng loạt) ngay dưới toolbar, vẫn trong thẻ.
//  - paged: object usePaged -> tự render Pagination TRÊN (có selector số dòng) + DƯỚI (dải số trang).
//  - variant 'table': nội dung là <table>; 'cards': nội dung là các thẻ-item trên DẢI XÁM bên trong.
// KPI (StatCard) đặt NGOÀI khung, phía trên — không đưa vào đây.
export type PagedLike = {
  page: number; setPage: (n: number) => void; pageCount: number
  total: number; perPage: number; setPerPage: (n: number) => void
}

export function ListFrame({ toolbar, aboveTable, children, variant = 'table', paged, unit }: {
  toolbar?: ReactNode
  aboveTable?: ReactNode
  children: ReactNode
  variant?: 'table' | 'cards'
  paged?: PagedLike
  unit?: string
}) {
  const hasHeader = !!(toolbar || aboveTable)
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {toolbar && <div className="p-3 md:p-4">{toolbar}</div>}
      {aboveTable && <div className="px-3 md:px-4 pb-3">{aboveTable}</div>}
      <div className={hasHeader ? 'border-t border-slate-100' : ''}>
        {paged && (
          <div className="px-3 pt-2">
            <Pagination top unit={unit} page={paged.page} pageCount={paged.pageCount} total={paged.total} perPage={paged.perPage} onPage={paged.setPage} onPerPage={paged.setPerPage} />
          </div>
        )}
        {variant === 'cards'
          ? <div className="bg-slate-50 p-3 flex flex-col gap-2.5">{children}</div>
          : <div className="overflow-x-auto">{children}</div>}
        {paged && (
          <div className="px-3 pb-1">
            <Pagination unit={unit} page={paged.page} pageCount={paged.pageCount} total={paged.total} perPage={paged.perPage} onPage={paged.setPage} />
          </div>
        )}
      </div>
    </div>
  )
}
