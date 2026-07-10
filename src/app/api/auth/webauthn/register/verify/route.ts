import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import { getRP, getChallenge, clearChallenge } from '@/lib/webauthn'
import { logAudit } from '@/lib/audit'

// Bước 2 đăng ký Passkey: xác minh và lưu public key của thiết bị.
export async function POST(request: Request) {
  try {
    const session = await requireRole()
    if (!session) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const { rpID, origin } = getRP(request)
    const challenge = await getChallenge()
    if (!challenge) return NextResponse.json({ error: 'Phiên đăng ký đã hết hạn, vui lòng thử lại.' }, { status: 400 })

    const body = await request.json()
    let verification
    try {
      verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      })
    } catch (e: any) {
      return NextResponse.json({ error: e.message || 'Xác minh thất bại' }, { status: 400 })
    }

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: 'Đăng ký không hợp lệ' }, { status: 400 })
    }

    const cred = verification.registrationInfo.credential
    const { error } = await supabaseAdmin.from('soct_webauthn_credentials').insert({
      user_id: session.id,
      credential_id: cred.id,
      public_key: Buffer.from(cred.publicKey).toString('base64url'),
      counter: cred.counter,
      transports: cred.transports ? JSON.stringify(cred.transports) : null,
    })
    await clearChallenge()

    if (error) {
      // Đã đăng ký khóa này rồi trên thiết bị -> coi như thành công
      if (error.code === '23505') return NextResponse.json({ success: true, already: true })
      throw error
    }

    await logAudit(session, 'Đăng ký đăng nhập sinh trắc học (Passkey)')
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('WebAuthn register verify error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
