'use client'
import { useToast } from '@/ui'
import KhoMayThueTool from '@/features/kho-hang/KhoMayThueTool'

// Kho hàng › Kho máy thuê — tái dùng nguyên KhoMayThueTool.
export default function KhoMayThuePage() {
  const { notify, toastNode } = useToast()
  return (<><KhoMayThueTool showNotification={notify} />{toastNode}</>)
}
