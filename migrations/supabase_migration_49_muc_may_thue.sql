-- MIGRATION 49: Map "model máy thuê → mã mực" để theo dõi tồn mực dự phòng cho đội máy thuê.
--
-- Mỗi model máy thuê có thể dùng nhiều mã mực (máy màu = C/M/Y/K -> 4 dòng). Admin khai tay
-- (chính là "cờ theo dõi": chỉ mã mực nằm trong bảng này mới được cảnh báo khi hết).
-- Cảnh báo (tính phía client): khả dụng = tồn − đang giữ; khả dụng ≤ 0 -> báo đỏ ở chuông.
--
-- Idempotent. Chạy trong Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.soct_muc_may_thue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_may TEXT NOT NULL,
    ma_hang   TEXT NOT NULL REFERENCES public.soct_kho_hang(ma_hang) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (model_may, ma_hang)
);

CREATE INDEX IF NOT EXISTS idx_muc_may_thue_model ON public.soct_muc_may_thue (model_may);
