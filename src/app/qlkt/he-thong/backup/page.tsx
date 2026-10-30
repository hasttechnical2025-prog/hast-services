'use client'
import { AdminGuard } from '@/features/he-thong/AdminGuard'
import { BackupGuideTool } from '@/features/he-thong/BackupGuideTool'

// Hệ thống › Backup / Restore — hướng dẫn sao lưu & khôi phục CSDL (chỉ admin).
export default function BackupPage() {
  return (
    <AdminGuard>
      <BackupGuideTool />
    </AdminGuard>
  )
}
