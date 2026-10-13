'use client'
import { useState } from 'react'
import { useToast, fmtDate } from '@/ui'
import { useShared } from '@/features/_shell/SharedDataProvider'
import { useSession } from '@/features/_shell/SessionProvider'
import { CustomerListTool } from '@/features/quan-ly/CustomerListTool'
import { KhachCumTool } from '@/features/quan-ly/KhachCumTool'
import { ExcelTool, type ExcelCol } from '@/features/kho-hang/ExcelTool'
import { fmtThang, parseThangBaoTri, formatThangBaoTri } from '@/lib/bao-tri'

// Quản lý › Khách hàng — gộp "Điểm máy" (CustomerListTool + Excel) và "Khách cụm" (KhachCumTool)
// vào 1 mục, 2 tab con sticky. Y HỆT bản cũ. Gating từng tab theo quyền khach_hang / khach_cum.
function parseDDMMYYYY(s: string): string | null {
  const m = (s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}

export default function KhachHangPage() {
  const { customers, dmOptions, refetchAll } = useShared()
  const { user, config, subVisible } = useSession()
  const { notify, toastNode } = useToast()

  const canDiemMay = subVisible('quan_ly', 'khach_hang')
  const canCum = subVisible('quan_ly', 'khach_cum')
  const tabs = [
    ...(canDiemMay ? [{ slug: 'diem-may', label: 'Điểm máy' }] : []),
    ...(canCum ? [{ slug: 'khach-cum', label: 'Khách cụm' }] : []),
  ]
  const [tab, setTab] = useState(tabs[0]?.slug || 'diem-may')
  const active = tabs.some(t => t.slug === tab) ? tab : (tabs[0]?.slug || 'diem-may')

  const hdbtCanhBaoThang = parseInt(config?.hdbt_canh_bao_thang || '2') || 2
  const loaiHdOptions = dmOptions('loai_hd', ['HĐBT', 'MF'])
  const hangOptions = dmOptions('hang', ['Konica', 'Fuji', 'Khác'])

  const excelCols: ExcelCol[] = [
    { header: 'Mã máy', key: 'ma_may' },
    { header: 'Tên khách hàng', key: 'ten_khach_hang' },
    { header: 'Địa chỉ', key: 'dia_chi' },
    { header: 'Model', key: 'model' },
    { header: 'Hãng', key: 'hang' },
    { header: 'Km', key: 'km_mac_dinh', parse: (s) => s ? (parseFloat(s.replace(',', '.')) || 0) : null },
    { header: 'Loại HĐ', key: 'loai_hd' },
    { header: 'Ngày hết hạn HĐBT', key: 'ngay_het_han_hdbt', toCsv: (v) => v ? fmtDate(v) : '', parse: (s) => parseDDMMYYYY(s) },
    { header: 'Tháng bảo trì', key: 'thang_bao_tri', toCsv: (v) => v || '', parse: (s) => formatThangBaoTri(parseThangBaoTri(String(s || '').replace(/[^\d,]/g, ''))) || null },
    { header: 'Bắt đầu từ tháng', key: 'bat_dau_tu_thang', toCsv: (v) => fmtThang(v), parse: (s) => { const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{4})$/); return m ? `${m[2]}-${String(+m[1]).padStart(2, '0')}` : null } },
    { header: 'Tạm dừng từ tháng', key: 'tam_dung_tu_thang', toCsv: (v) => fmtThang(v), parse: (s) => { const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{4})$/); return m ? `${m[2]}-${String(+m[1]).padStart(2, '0')}` : null } },
    { header: 'Ghi chú bảo trì', key: 'ghi_chu_bao_tri' },
  ]

  return (
    <div className="space-y-4">
      {/* Thanh tab con STICKY kiểu UNDERLINE (chuẩn chung v2). */}
      {tabs.length > 1 && (
        <div className="sticky top-0 z-20 -mx-4 px-4 pt-1 bg-slate-100/95 backdrop-blur">
          <div className="flex gap-1 border-b border-slate-200">
            {tabs.map(t => {
              const on = t.slug === active
              return (
                <button key={t.slug} onClick={() => setTab(t.slug)}
                  className={`px-4 py-2 font-medium text-sm transition whitespace-nowrap border-b-2 ${on ? 'border-blue-600 text-blue-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {active === 'diem-may' && canDiemMay && (
        <div className="space-y-6">
          <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50">
            <h3 className="text-lg font-semibold text-slate-700 mb-2">Danh sách Khách hàng (Điểm máy)</h3>
            <p className="text-sm text-slate-500 mb-4">Toàn bộ khách hàng / điểm máy hiện có trong hệ thống.</p>
            <CustomerListTool customers={customers} loaiHdOptions={loaiHdOptions} hangOptions={hangOptions} hdbtCanhBaoThang={hdbtCanhBaoThang} onUpdateSuccess={refetchAll} showNotification={notify} />
          </div>
          <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50">
            <h3 className="text-lg font-semibold text-slate-700 mb-2">Nhập / Xuất khách hàng (Excel)</h3>
            <p className="text-sm text-slate-500 mb-4">
              Quy trình: <b>Xuất Excel</b> để lấy đúng cấu trúc cột → sửa/thêm dữ liệu vào file .xlsx → <b>Nhập từ Excel</b>. Import <b>cập nhật theo Mã máy</b> (trùng thì sửa, mới thì thêm) — <b>không xóa</b> khách cũ, giữ nguyên lịch sử phiếu. Máy nghỉ dùng cột <b>Tạm dừng từ tháng</b>.<br />
              <b>Cột:</b> Mã máy | Tên khách hàng | Địa chỉ | Model | Hãng | Km | Loại HĐ | Ngày hết hạn HĐBT (DD/MM/YYYY) | Tháng bảo trì | Bắt đầu từ tháng (MM/YYYY) | Tạm dừng từ tháng (MM/YYYY) | Ghi chú bảo trì. Trùng Mã máy sẽ được cập nhật.<br />
              <span className="text-xs text-slate-400"><b>Tháng bảo trì</b>: các tháng phải bảo trì, VD <b>2,4,6,8,10,12</b> — để <b>trống = hằng tháng</b>. <b>Bắt đầu từ tháng</b>: máy lắp giữa năm → tháng trước đó không tính bảo trì. <b>Tạm dừng từ tháng</b>: máy khách đã bỏ nhưng còn trong HĐ → không bị đòi bảo trì từ tháng đó, vẫn giữ trong danh sách.</span><br />
              <span className="text-xs text-slate-400">Để trống cột <b>Km</b> → hệ thống tự tính tọa độ &amp; KM từ địa chỉ (chạy tuần tự ~1s/dòng, danh sách lớn sẽ hơi lâu). Dòng đã có Km giữ nguyên.</span>
            </p>
            <ExcelTool rows={customers} filename="khach-hang" endpoint="/api/admin/khach-hang/bulk" payloadKey="customers" unit="khách hàng" requiredKeys={['ma_may', 'ten_khach_hang', 'dia_chi']} columns={excelCols} onSuccess={refetchAll} showNotification={notify} />
          </div>
        </div>
      )}

      {active === 'khach-cum' && canCum && (
        <KhachCumTool customers={customers} onUpdateSuccess={refetchAll} showNotification={notify} currentUserRole={user?.role || ''} />
      )}

      {toastNode}
    </div>
  )
}
