-- Migration 111: Số tháng tính phí bảo trì cho từng máy (phí BT theo kỳ)
-- Lý do: cùng 1 HĐ, máy đang bảo trì hằng tháng tính đủ kỳ (12 tháng), còn máy TẠM DỪNG
-- (vd "không sử dụng từ 01/2026") chỉ tính số tháng đã bảo trì. Trước đây app coi mọi máy = 12
-- nên tổng lệch với office. Thêm 1 cột để office nhập số tháng/máy khi lập hóa đơn.
--
-- Công thức mỗi máy: thành tiền = round(don_gia_bt * so_thang_bt / 12).
-- NULL = 12 (đủ kỳ) -> dữ liệu cũ KHÔNG đổi kết quả. Chặn [0..12].

ALTER TABLE soct_khach_hang
  ADD COLUMN IF NOT EXISTS so_thang_bt smallint;

ALTER TABLE soct_khach_hang
  DROP CONSTRAINT IF EXISTS soct_khach_hang_so_thang_bt_chk;
ALTER TABLE soct_khach_hang
  ADD CONSTRAINT soct_khach_hang_so_thang_bt_chk
  CHECK (so_thang_bt IS NULL OR (so_thang_bt >= 0 AND so_thang_bt <= 12));

COMMENT ON COLUMN soct_khach_hang.so_thang_bt IS
  'Số tháng tính phí bảo trì trong kỳ (0..12). NULL = 12 (đủ kỳ). thành tiền = don_gia_bt * so_thang_bt / 12';
