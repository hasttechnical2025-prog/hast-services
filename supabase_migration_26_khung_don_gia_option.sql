-- MIGRATION 26: Thêm dữ liệu cấp hợp đồng khung cho bảng kê đa máy (gộp).
-- Đơn giá & miễn phí & card reader đặt ở CẤP HỢP ĐỒNG KHUNG (dùng chung mọi máy trong khung).
-- Idempotent.

ALTER TABLE public.soct_thue_cpc_hop_dong_khung
    ADD COLUMN IF NOT EXISTS don_gia_bw NUMERIC(15,2) DEFAULT 0,     -- đơn giá / bản đen trắng (chung khung)
    ADD COLUMN IF NOT EXISTS don_gia_mau NUMERIC(15,2) DEFAULT 0,    -- đơn giá / bản màu (chung khung)
    ADD COLUMN IF NOT EXISTS mien_phi_bw INT DEFAULT 0,              -- số bản đen trắng miễn phí (chung khung)
    ADD COLUMN IF NOT EXISTS mien_phi_mau INT DEFAULT 0,             -- số bản màu miễn phí (chung khung)
    ADD COLUMN IF NOT EXISTS card_reader NUMERIC(15,2) DEFAULT 0;    -- giá card reader / option (chung khung)
