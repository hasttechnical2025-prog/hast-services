'use client'
import { useToast } from '@/ui'
import NghiPhepDuyet from '@/features/quan-ly/NghiPhepDuyet'

// Quản lý › Nghỉ phép — tái dùng nguyên NghiPhepDuyet (duyệt đơn nghỉ phép/ốm).
export default function NghiPhepPage() {
  const { notify, toastNode } = useToast()
  return (
    <>
      <NghiPhepDuyet notify={notify} />
      {toastNode}
    </>
  )
}
