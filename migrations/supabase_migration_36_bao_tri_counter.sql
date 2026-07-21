-- MIGRATION 36: Ghi thêm CHỈ SỐ COUNTER tại thời điểm bảo trì.
-- Dùng để theo dõi sản lượng in giữa 2 lần bảo trì (chênh lệch counter).
-- KHÁC với counter billing máy thuê/CPC (soct_thue_cpc_counter) và counter trên
-- phiếu công việc (soct_cong_viec.counter) — 3 miền dữ liệu khác mục đích.
-- Để TRỐNG (NULL) được: KTV không đọc được số thì bỏ qua.
-- Chạy trong Supabase SQL Editor. Idempotent.

ALTER TABLE public.soct_bao_tri
    ADD COLUMN IF NOT EXISTS counter BIGINT;
