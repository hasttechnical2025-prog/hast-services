-- MIGRATION 80: Danh mục MÁY & HÀNG HÓA (dùng chung: Lệnh xuất hàng + ô "Mã hàng (máy)" của BM38).
-- KHÁC kho vật tư soct_kho_hang (mực/vật tư kỹ thuật) — bảng này chứa MÁY + hàng bán, KHÔNG theo dõi tồn.
-- Additive: chạy trước khi deploy (API sẽ đọc/ghi). Quản lý: sale_admin (kinh_doanh + kd_quan_ly) & admin.
CREATE TABLE IF NOT EXISTS public.soct_hang_hoa (
  ma_hang           TEXT PRIMARY KEY,
  ten_hang          TEXT NOT NULL,
  dvt               TEXT DEFAULT 'Cái',
  don_gia_niem_yet  NUMERIC(15,2) NOT NULL DEFAULT 0,   -- đơn giá niêm yết (gợi ý cho Lệnh xuất)
  hang              TEXT,
  model             TEXT,
  ghi_chu           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ
);
