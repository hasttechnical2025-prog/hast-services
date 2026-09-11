-- Migration 72: Ngưỡng cảnh báo tồn kho theo TỪNG mặt hàng (đặt lại hàng).
-- Chỉ dùng cho bảng "Cảnh báo tồn kho Konica" ở tab Thống kê nhập: tồn_kho <= nguong_dat -> cảnh báo.
-- NULL = chưa đặt ngưỡng = KHÔNG cảnh báo (opt-in từng mặt hàng).

ALTER TABLE soct_kho_hang ADD COLUMN IF NOT EXISTS nguong_dat NUMERIC;
