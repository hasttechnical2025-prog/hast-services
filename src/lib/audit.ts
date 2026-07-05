import { supabaseAdmin } from '@/lib/supabase-admin'

// Ghi nhật ký thao tác. Không ném lỗi ra ngoài (log lỗi được thì tốt, không thì bỏ qua).
export async function logAudit(
  actor: { id: string; full_name: string; role: string } | null,
  action: string,
  detail?: string,
) {
  try {
    await supabaseAdmin.from('soct_audit_log').insert({
      user_id: actor?.id || null,
      user_name: actor?.full_name || null,
      user_role: actor?.role || null,
      action,
      detail: detail || null,
    })
  } catch (e) {
    console.error('Ghi audit log thất bại:', e)
  }
}
