import { NextResponse } from 'next/server'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { getRP, setChallenge } from '@/lib/webauthn'

// Bước 1 đăng nhập bằng Passkey: tạo options. Không cần username (usernameless) —
// thiết bị tự hiện danh sách tài khoản đã đăng ký để chọn.
export async function POST(request: Request) {
  try {
    const { rpID } = getRP(request)
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
      allowCredentials: [],
    })
    await setChallenge(options.challenge)
    return NextResponse.json(options)
  } catch (error: any) {
    console.error('WebAuthn login options error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
