'use client'
import { useState, useEffect } from 'react'
import { useToast } from '@/ui'
import { useShared } from '@/features/_shell/SharedDataProvider'
import { AdminGuard } from '@/features/he-thong/AdminGuard'
import { DanhMucTool } from '@/features/he-thong/DanhMucTool'

// Hệ thống › Danh mục (chỉ admin) = DanhMucTool (dropdown danh mục). Biệt danh Trợ lý AI đã chuyển
// sang tab "Trợ lý AI". danhMuc giữ bản local cho reorder lạc quan, đồng bộ lại từ SharedData sau refetchAll.
export default function DanhMucPage() {
  const { danhMuc, refetchAll } = useShared()
  const { notify, toastNode } = useToast()
  const [dm, setDm] = useState<any[]>(danhMuc)
  useEffect(() => { setDm(danhMuc) }, [danhMuc])
  return (
    <AdminGuard>
      <DanhMucTool danhMuc={dm} setDanhMuc={setDm} onUpdateSuccess={refetchAll} showNotification={notify} />
      {toastNode}
    </AdminGuard>
  )
}
