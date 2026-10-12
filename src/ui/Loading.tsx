import { RefreshCw } from 'lucide-react'

// Chuẩn hóa trạng thái "Đang tải..." cho toàn bộ danh sách v2 (giống mẫu Giá niêm yết):
// biểu tượng xoay xanh + chữ (cỡ sm), căn giữa. Luôn truyền label cụ thể: "Đang tải <cái gì>...".

// Dùng trong <tbody> của bảng: 1 hàng loading trải hết cột.
export function TableLoading({ colSpan, label = 'Đang tải...' }: { colSpan: number; label?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1.5 text-blue-600" />{label}
      </td>
    </tr>
  )
}

// Dùng cho danh sách KHÔNG phải bảng (card list, panel) hoặc vùng trống.
export function BoxLoading({ label = 'Đang tải...', className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`py-8 text-center text-sm text-slate-400 ${className}`}>
      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1.5 text-blue-600" />{label}
    </div>
  )
}
