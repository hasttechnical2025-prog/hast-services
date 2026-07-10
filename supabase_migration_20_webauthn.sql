-- MIGRATION 20: Đăng nhập sinh trắc học (WebAuthn / Passkey - vân tay, Face ID)
-- Lưu public key của thiết bị; xác thực bằng khóa riêng nằm trong Secure Enclave/iCloud Keychain.
-- Chạy trong Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS public.soct_webauthn_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.soct_users(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE,   -- ID khóa (base64url)
    public_key TEXT NOT NULL,             -- public key (base64url)
    counter BIGINT NOT NULL DEFAULT 0,    -- chống replay
    transports TEXT,                       -- JSON mảng transports
    device_label TEXT,                     -- nhãn thiết bị (tùy chọn)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_used_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_webauthn_user ON public.soct_webauthn_credentials(user_id);

-- RLS: chặn anon như các bảng khác (API dùng service role nên vẫn truy cập được)
ALTER TABLE public.soct_webauthn_credentials ENABLE ROW LEVEL SECURITY;
