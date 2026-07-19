-- MIGRATION 34: Lưu thêm CÂU TRẢ LỜI + THAM SỐ AI hiểu, vào nhật ký Trợ lý.
-- Vì chỉ có "số kết quả" thì không phát hiện được ca AI trả lời SAI dù vẫn ra dữ liệu
-- (VD trả "không tìm thấy" nhưng bảng có 1 dòng). Có câu trả lời + tham số mới soi được.
-- Chạy trong Supabase SQL Editor. Idempotent.

ALTER TABLE public.soct_tro_ly_log
    ADD COLUMN IF NOT EXISTS tra_loi TEXT,   -- câu trả lời AI đưa ra
    ADD COLUMN IF NOT EXISTS tham_so TEXT;   -- JSON: AI hiểu câu hỏi thế nào (mã hàng/khách/địa chỉ...)
