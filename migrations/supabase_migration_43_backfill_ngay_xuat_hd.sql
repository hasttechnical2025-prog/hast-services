-- MIGRATION 43: Khôi phục ngày xuất hóa đơn bị thiếu (thẻ Kanban biến mất)
-- Trước đây khi "Hoàn tất xuất hóa đơn", code KHÔNG set ngay_xuat_hd -> NULL, mà GET Kanban
-- lọc cột "Chờ thanh toán" theo ngay_xuat_hd IS NOT NULL -> các thẻ đã lên hóa đơn bị ẩn.
-- Bản vá đã tự chốt ngay_xuat_hd khi lên hóa đơn. Câu này khôi phục các phiếu CŨ đã lên
-- hóa đơn / đã thanh toán nhưng còn thiếu ngày (lấy ngày phiếu làm mốc, fallback hôm nay).
-- An toàn chạy lại (chỉ đụng dòng đang NULL). Chạy trong Supabase SQL Editor.

UPDATE public.soct_cong_viec
SET ngay_xuat_hd = COALESCE(ngay_xuat_hd, ngay, CURRENT_DATE)
WHERE trang_thai_hd IN ('Đã lên hóa đơn', 'Đã thanh toán')
  AND ngay_xuat_hd IS NULL;
