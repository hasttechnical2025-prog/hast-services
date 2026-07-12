-- MIGRATION 23: Thêm serial máy cho soct_khach_hang.
-- Đặc biệt cần cho máy thuê / CPC; máy thường có thể để trống.
-- Nullable, KHÔNG unique (nhiều máy có thể chưa nhập serial) -> không phá luồng hiện tại.
-- Idempotent.

ALTER TABLE public.soct_khach_hang ADD COLUMN IF NOT EXISTS serial TEXT;
