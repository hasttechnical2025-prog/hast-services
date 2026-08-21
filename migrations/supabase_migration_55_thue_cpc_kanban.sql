-- MIGRATION 55: Đẩy bảng kê Thuê/CPC sang Kanban (sinh phiếu giao việc cho kthc lên hóa đơn).
--
-- 1) don_vi_tinh cho dòng vật tư (thuê máy cần "Tháng"/"Bản", không phải "Cái").
-- 2) nguon: đánh dấu phiếu SINH TỪ Thuê/CPC -> ẩn khỏi Sổ công tác/Giao việc + Báo cáo KTV.
-- 3) ten_khach_hd: tên người mua GHI ĐÈ trên hóa đơn (dùng cho bảng kê GỘP = tên hợp đồng khung).
-- 4) soct_thue_cpc_bk.id_cong_viec: liên kết bảng kê -> phiếu đã đẩy (chống đẩy trùng).
-- 5) 4 "mã dịch vụ" trong kho (dòng hóa đơn thuê/CPC là dịch vụ, không phải hàng kho).
--
-- ⚠️ CHẠY SQL TRƯỚC KHI DEPLOY (GET kanban-hd/cong-viec select cột mới -> 500 nếu thiếu).
-- Idempotent. Chạy trong Supabase SQL Editor.

ALTER TABLE public.soct_chi_tiet_vat_tu ADD COLUMN IF NOT EXISTS don_vi_tinh TEXT;
ALTER TABLE public.soct_cong_viec       ADD COLUMN IF NOT EXISTS nguon TEXT;
ALTER TABLE public.soct_cong_viec       ADD COLUMN IF NOT EXISTS ten_khach_hd TEXT;
ALTER TABLE public.soct_thue_cpc_bk      ADD COLUMN IF NOT EXISTS id_cong_viec UUID REFERENCES public.soct_cong_viec(id) ON DELETE SET NULL;

INSERT INTO public.soct_kho_hang (ma_hang, ten_hang, ton_kho) VALUES
    ('DVTM',  'Dịch vụ thuê máy', 0),
    ('DVBDT', 'Số bản sử dụng đen trắng trong kỳ', 0),
    ('DVBM',  'Số bản sử dụng màu trong kỳ', 0),
    ('DVCR',  'Dịch vụ đầu đọc thẻ', 0)
ON CONFLICT (ma_hang) DO NOTHING;
