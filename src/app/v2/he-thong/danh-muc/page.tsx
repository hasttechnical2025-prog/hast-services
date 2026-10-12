'use client'
import { useState, useEffect } from 'react'
import { useToast } from '@/ui'
import { useShared } from '@/features/_shell/SharedDataProvider'
import { AdminGuard } from '@/features/he-thong/AdminGuard'
import { DanhMucTool, AliasTool } from '@/features/he-thong/DanhMucTool'

// Hệ thống › Danh mục (chỉ admin) = DanhMucTool + AliasTool. danhMuc giữ bản local cho reorder lạc quan,
// đồng bộ lại từ SharedData sau mỗi refetchAll.
export default function DanhMucPage() {
  const { danhMuc, refetchAll } = useShared()
  const { notify, toastNode } = useToast()
  const [dm, setDm] = useState<any[]>(danhMuc)
  useEffect(() => { setDm(danhMuc) }, [danhMuc])
  return (
    <AdminGuard>
      <div className="space-y-6">
        <DanhMucTool danhMuc={dm} setDanhMuc={setDm} onUpdateSuccess={refetchAll} showNotification={notify} />
        <AliasTool showNotification={notify} />
      </div>
      {toastNode}
    </AdminGuard>
  )
}
