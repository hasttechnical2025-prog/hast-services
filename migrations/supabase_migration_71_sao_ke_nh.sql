-- Migration 71: Đối chiếu sao kê ngân hàng (bù trừ công nợ tự động ở Kanban cột 3).
-- Lưu MỖI giao dịch đã đối chiếu (đã ghi thu cho 1 hóa đơn) để lần import sau KHÔNG gán lại (chống thu đúp).
-- Nguồn: upload sao kê MB / VCB -> khớp số HĐ + số tiền với phiếu "Đã lên hóa đơn" -> ghi soct_hd_thu.

CREATE TABLE IF NOT EXISTS soct_sao_ke_nh (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_key        TEXT NOT NULL UNIQUE,        -- chữ ký ổn định của giao dịch (bank|ngày|tiền|ref|nội dung) -> chống trùng
  ngan_hang     TEXT NOT NULL,              -- 'MB' | 'VCB'
  ref           TEXT,                        -- số tham chiếu (VCB có; MB thường trống)
  ngay          DATE,                        -- ngày giao dịch
  so_tien       NUMERIC NOT NULL DEFAULT 0,  -- số tiền ghi có (thu vào)
  nguoi_chuyen  TEXT,                         -- đơn vị chuyển (đã bóc tách)
  noi_dung      TEXT,                         -- nội dung/mô tả gốc (đã làm sạch)
  so_hoa_don    TEXT,                         -- số HĐ đã đối ứng
  id_cong_viec  UUID REFERENCES soct_cong_viec(id) ON DELETE SET NULL, -- 1 phiếu đại diện của HĐ (tham chiếu)
  created_by    UUID REFERENCES soct_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sao_ke_nh_hd ON soct_sao_ke_nh (so_hoa_don);
CREATE INDEX IF NOT EXISTS idx_sao_ke_nh_created ON soct_sao_ke_nh (created_at DESC);
