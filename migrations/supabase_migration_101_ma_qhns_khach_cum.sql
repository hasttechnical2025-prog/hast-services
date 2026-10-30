-- Migration 101: Mã đơn vị quan hệ ngân sách (QHNS) cho khách cụm.
-- Đơn vị hưởng ngân sách nhà nước (cơ quan, đơn vị sự nghiệp công) có mã này;
-- in trên hóa đơn GTGT (khối người mua) + đổ vào cột 29 file nạp M-invoice.
-- Nullable — DN thường để trống. Tương thích ngược: cụm cũ ma_qhns = NULL.
ALTER TABLE soct_khach_cum ADD COLUMN IF NOT EXISTS ma_qhns text;
