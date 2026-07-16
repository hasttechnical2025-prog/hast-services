-- MIGRATION 28: Lịch bảo trì theo tháng cho từng máy + tạm dừng theo dõi bảo trì.
-- Bối cảnh: có máy bảo trì 2-3 tháng/lần (theo HĐ) nhưng danh sách "chưa bảo trì" đang
-- ngầm định MỌI máy HĐBT/MF phải bảo trì hằng tháng -> tháng không cần bảo trì vẫn bị đòi.
-- Có máy khách đã bỏ nhưng còn trong HĐ (giữ để quyết toán cuối năm) -> cần ẩn khỏi danh
-- sách đòi bảo trì mà KHÔNG tạo bản ghi bảo trì giả.
-- Chạy trong Supabase SQL Editor. Idempotent.

ALTER TABLE public.soct_khach_hang
    -- Các tháng phải bảo trì trong năm, VD '2,4,6,8,10,12'.
    -- NULL/rỗng = bảo trì HẰNG THÁNG (giữ nguyên hành vi cũ -> máy đang có không phải nhập lại).
    ADD COLUMN IF NOT EXISTS thang_bao_tri TEXT,
    -- 'YYYY-MM': tạm dừng theo dõi bảo trì KỂ TỪ tháng này (máy khách đã bỏ, còn trong HĐ).
    -- NULL = đang theo dõi bình thường. Xem tháng cũ hơn -> máy vẫn hiện như trước khi ngừng.
    ADD COLUMN IF NOT EXISTS tam_dung_tu_thang TEXT,
    -- Lý do tạm dừng, VD 'khách bỏ máy từ 3/2026'
    ADD COLUMN IF NOT EXISTS ghi_chu_bao_tri TEXT;
