-- MIGRATION 110: CHUẨN HÓA SỐ PHIẾU (report) + SIẾT UNIQUE CHẶN TRÙNG TRIỆT ĐỂ
-- ---------------------------------------------------------------------------
-- Bối cảnh: unique index cũ (mig 15) chỉ so NGUYÊN VĂN nên trùng vẫn lọt khi 2 số phiếu
-- "nhìn giống nhau nhưng byte khác": ký tự ẩn (zero-width) do pdfjs chèn khi nhập PDF,
-- khoảng trắng thừa/giữa, hoa-thường. App còn công cụ "Dọn phiếu trùng" (so bằng lowercase)
-- chính là bằng chứng loại trùng này tồn tại.
--
-- Giải pháp (khớp hàm normReport() ở src/lib/report.ts): chuẩn hóa = bỏ ký tự ẩn + bỏ MỌI
-- khoảng trắng + viết HOA. Chuẩn hóa toàn bộ dữ liệu cũ, dọn trùng còn sót (giữ bản sớm nhất),
-- rồi dựng lại unique index trên giá trị ĐÃ chuẩn hóa. Từ nay server luôn ghi xuống giá trị
-- chuẩn hóa nên index khớp 1:1, không còn lọt.
--
-- Số report là DUY NHẤT trải nhiều năm (không tái dùng) -> unique TOÀN THỜI GIAN là đúng.
-- Chạy trong Supabase SQL Editor. Idempotent. An toàn dữ liệu (chỉ xóa phiếu TRÙNG số phiếu).

-- (0) Bỏ unique index cũ TRƯỚC khi chuẩn hóa — tránh vi phạm giữa chừng khi 2 bản
--     chưa-chuẩn-hóa cùng quy về 1 giá trị.
DROP INDEX IF EXISTS public.uq_soct_cong_viec_report;

-- (1) Chuẩn hóa số phiếu hiện có: bỏ ký tự ẩn zero-width, bỏ mọi khoảng trắng, viết hoa.
UPDATE public.soct_cong_viec
   SET report = upper(regexp_replace(
                  translate(report, E'​‌‍﻿', ''),
                  '\s+', '', 'g'))
 WHERE report IS NOT NULL
   AND report <> upper(regexp_replace(
                  translate(report, E'​‌‍﻿', ''),
                  '\s+', '', 'g'));

-- (2) Dọn phiếu trùng còn sót sau chuẩn hóa: giữ bản tạo sớm nhất (created_at, rồi ctid),
--     xóa phần thừa (chi_tiet vật tư cascade theo FK).
DELETE FROM public.soct_cong_viec a
 USING public.soct_cong_viec b
 WHERE a.report IS NOT NULL AND a.report <> ''
   AND a.report = b.report
   AND (a.created_at, a.ctid) > (b.created_at, b.ctid);

-- (3) Dựng lại unique index (partial) trên số phiếu khác rỗng. Phiếu KHÔNG số vẫn cho nhiều.
CREATE UNIQUE INDEX IF NOT EXISTS uq_soct_cong_viec_report
    ON public.soct_cong_viec (report)
 WHERE report IS NOT NULL AND report <> '';
