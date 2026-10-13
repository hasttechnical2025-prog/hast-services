'use client'
import { useToast } from '@/ui'
import { useShared } from '@/features/_shell/SharedDataProvider'
import { useSession } from '@/features/_shell/SessionProvider'
import { InventoryManagementTool } from '@/features/kho-hang/InventoryManagementTool'
import { ExcelTool, type ExcelCol } from '@/features/kho-hang/ExcelTool'

// Kho hàng › Tồn kho — port nguyên InventoryManagementTool + Nhập/Xuất Excel. Gọi lại /api/admin/kho-hang.
const EXCEL_COLS: ExcelCol[] = [
  { header: 'Mã hàng', key: 'ma_hang', parse: (r) => (r || '').trim().toUpperCase() || null },
  { header: 'Tên vật tư', key: 'ten_hang' },
  { header: 'Model', key: 'model' },
  { header: 'Hãng', key: 'hang' },
  { header: 'Tồn kho', key: 'ton_kho', toCsv: (v) => String(v ?? 0), parse: (r) => parseInt(r) || 0 },
]

export default function TonKhoPage() {
  const { inventory, danhMuc, refetchInventory } = useShared()
  const { config } = useSession()
  const { notify, toastNode } = useToast()
  const lowStock = parseInt(config?.nguong_ton_thap || '0') || 0

  return (
    <div className="space-y-8">
      <div>
        <InventoryManagementTool inventory={inventory} lowStock={lowStock} danhMuc={danhMuc} onUpdateSuccess={refetchInventory} showNotification={notify} />
      </div>
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <h3 className="text-base font-bold text-slate-800 mb-3">Nhập / Xuất kho hàng (Excel)</h3>
        <ExcelTool columns={EXCEL_COLS} rows={inventory} filename="kho-hang" endpoint="/api/admin/kho-hang/bulk" payloadKey="items" requiredKeys={['ma_hang', 'ten_hang']} unit="vật tư" onSuccess={refetchInventory} showNotification={notify} />
      </div>
      {toastNode}
    </div>
  )
}
