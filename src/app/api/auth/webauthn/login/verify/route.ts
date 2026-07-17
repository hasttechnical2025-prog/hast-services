import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { getRP, getChallenge, clearChallenge } from '@/lib/webauthn'
import { setSessionCookie, type Role } from '@/lib/session'
import { getSessionMaxAge, isBaoTri, BAO_TRI_MSG } from '@/lib/config'

// Bước 2 đăng nhập bằng Passkey: xác minh chữ ký -> đặt phiên theo đúng vai trò.
export async function POST(request: Request) {
  try {
    const { rpID, origin } = getRP(request)
    const challenge = await getChallenge()
    if (!challenge) return NextResponse.json({ error: 'Phiên đăng nhập đã hết hạn, thử lại.' }, { status: 400 })

    const body = await request.json()

    const { data: cred } = await supabaseAdmin
      .from('soct_webauthn_credentials')
      .select('*')
      .eq('credential_id', body.id)
      .single()
    if (!cred) return NextResponse.json({ error: 'Không tìm thấy khóa. Hãy đăng ký lại trên thiết bị này.' }, { status: 400 })

    let verification
    try {
      verification = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: cred.credential_id,
          publicKey: new Uint8Array(Buffer.from(cred.public_key, 'base64url')),
          counter: Number(cred.counter),
          transports: cred.transports ? JSON.parse(cred.transports) : undefined,
        },
      })
    } catch (e: any) {
      return NextResponse.json({ error: e.message || 'Xác thực thất bại' }, { status: 400 })
    }

    if (!verification.verified) return NextResponse.json({ error: 'Xác thực thất bại' }, { status: 400 })

    const { data: user } = await supabaseAdmin
      .from('soct_users')
      .select('id, full_name, role, is_active')
      .eq('id', cred.user_id)
      .single()
    if (!user || user.is_active === false) {
      return NextResponse.json({ error: 'Tài khoản không tồn tại hoặc đã ngừng hoạt động.' }, { status: 403 })
    }

    // Chế độ bảo trì: chặn đăng nhập sinh trắc học của mọi role trừ admin
    if (user.role !== 'admin' && await isBaoTri()) {
      return NextResponse.json({ error: BAO_TRI_MSG }, { status: 503 })
    }

    // Cập nhật counter chống replay + thời điểm dùng
    await supabaseAdmin
      .from('soct_webauthn_credentials')
      .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
      .eq('id', cred.id)

    const maxAge = await getSessionMaxAge(user.role === 'ktv' ? 'ktv' : 'van_phong')
    await setSessionCookie({ id: user.id, full_name: user.full_name, role: user.role as Role }, maxAge)
    await clearChallenge()

    return NextResponse.json({ data: { role: user.role, full_name: user.full_name } })
  } catch (error: any) {
    console.error('WebAuthn login verify error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
