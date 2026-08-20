-- MIGRATION 53: Đưa phiếu MIỄN PHÍ (MF) ra khỏi luồng hóa đơn / công nợ.
--
-- MF = không thu tiền / không lên hóa đơn / không công nợ -> trạng thái tài chính KẾT THÚC
-- `trang_thai_hd = 'Miễn phí'`: tự loại khỏi Kanban Hóa đơn (lọc IN 4 cột) và tab Công nợ
-- (đã thêm loại trừ), nhưng VẪN nằm đầy đủ trong Sổ công tác (Giao việc) với badge MF.
-- Từ nay code tự đặt 'Miễn phí' khi giao việc/sửa phiếu MF (bỏ MF thì tự tính lại như cũ).
--
-- Câu UPDATE dưới DỌN phiếu MF CŨ đang kẹt trong luồng. CHỈ đụng phiếu CHƯA lên HĐ thật —
-- GIỮ NGUYÊN phiếu MF lỡ 'Đã lên hóa đơn'/'Đã thanh toán' để rà tay (tránh xóa vết HĐ đã có).
-- `trang_thai_hd` KHÔNG có CHECK constraint nên không cần đổi schema. An toàn chạy lại.
-- Chạy trong Supabase SQL Editor.

UPDATE public.soct_cong_viec
SET trang_thai_hd = 'Miễn phí'
WHERE mien_phi = true
  AND trang_thai_hd IN ('Chờ xuất HĐ', 'Đang xử lý HĐ', 'Chưa hóa đơn', 'Đã báo giá');
