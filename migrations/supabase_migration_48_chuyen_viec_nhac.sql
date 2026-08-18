-- MIGRATION 48: Chuyển việc KTV→KTV (lời mời) + mốc thời gian phục vụ nhắc trạng thái
--
-- Chuyển việc dạng "lời mời": KTV đang giữ việc (Đã nhận) mời 1 KTV khác nhận thay. Việc VẪN
-- thuộc người mời cho tới khi người được mời bấm "Nhận".
--   moi_ktv_id : KTV được mời (đang chờ trả lời). NULL = không có lời mời treo.
--   moi_boi    : KTV gửi lời mời (người đang giữ việc).
--   moi_luc    : thời điểm gửi lời mời.
--
-- Nhắc trạng thái qua Telegram (cron):
--   nhan_luc   : thời điểm KTV NHẬN việc (tự nhận / được giao / nhận lời mời). Dùng để nhắc
--                "đã nhận nhưng chưa bấm Đang làm". (bat_dau_luc/hoan_thanh_luc đã có từ mig 30.)
--   nhac_luc   : lần nhắc gần nhất (chống spam — chỉ nhắc lại sau một khoảng).
--
-- Idempotent. Chạy trong Supabase SQL Editor.

ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS moi_ktv_id UUID REFERENCES public.soct_users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS moi_boi    UUID REFERENCES public.soct_users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS moi_luc    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS nhan_luc   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS nhac_luc   TIMESTAMPTZ;
