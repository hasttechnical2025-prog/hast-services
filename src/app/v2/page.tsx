import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { defaultModuleFor } from '@/lib/v2-nav'

// /v2 → điều hướng tới module mặc định theo role (server-side, không nháy màn).
export default async function V2Index() {
  const session = await getSession()
  if (!session) redirect('/')
  if (session!.role === 'kinh_doanh') redirect('/kho-thue')
  if (session!.role === 'ktv') redirect('/ktv')
  redirect(defaultModuleFor(session!.role))
}
