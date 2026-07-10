import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { generateRegistrationOptions } from '@simplewebauthn/server'
import { getRP, setChallenge } from '@/lib/webauthn'

// Bước 1 đăng ký Passkey: tạo options (challenge) cho thiết bị. Cần đã đăng nhập.
export async function POST(request: Request) {
  try {
    const session = await requireRole()
    if (!session) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const { rpID, rpName } = getRP(request)
    const roleLabel = session.role === 'ktv' ? 'KTV' : session.role === 'tech_admin' ? 'Tech Admin' : session.role === 'staff' ? 'Staff' : 'Admin'

    const { data: creds } = await supabaseAdmin
      .from('soct_webauthn_credentials')
      .select('credential_id, transports')
      .eq('user_id', session.id)

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: `${session.full_name} · ${roleLabel}`,
      userDisplayName: `${session.full_name} (${roleLabel})`,
      userID: new TextEncoder().encode(session.id),
      attestationType: 'none',
      excludeCredentials: (creds || []).map((c: any) => ({
        id: c.credential_id,
        transports: c.transports ? JSON.parse(c.transports) : undefined,
      })),
      authenticatorSelection: {
        residentKey: 'required',        // khóa có thể khám phá -> đăng nhập không cần gõ username
        requireResidentKey: true,
        userVerification: 'required',   // bắt buộc vân tay / Face ID / PIN
      },
    })

    await setChallenge(options.challenge)
    return NextResponse.json(options)
  } catch (error: any) {
    console.error('WebAuthn register options error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
