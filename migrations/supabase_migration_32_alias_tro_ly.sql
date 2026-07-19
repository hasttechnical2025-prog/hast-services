-- MIGRATION 32: Bảng biệt danh/viết tắt cho Trợ lý AI (resolver khớp tên khách).
-- VD: "TCCB" -> "Tổ chức cán bộ", "PV06" -> "Cục Hồ sơ nghiệp vụ", "dầu khí" -> "dầu khí".
-- Trợ lý dùng để mở rộng từ khóa trước khi tìm khách hàng => khớp tên gần như bất bại.
-- Admin tự thêm dần. Chạy trong Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS public.soct_alias (
    tu_khoa    TEXT PRIMARY KEY,   -- biệt danh/viết tắt (lưu chữ thường, không dấu khi tra)
    mo_rong    TEXT NOT NULL,      -- cụm từ chuẩn để tìm trong tên/địa chỉ khách
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
