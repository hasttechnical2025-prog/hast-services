-- MIGRATION 59: Tự động hóa tên dòng hóa đơn Thuê/CPC (giảm sửa tay hàng kỳ).
--
-- Hai "cần gạt" cài MỘT LẦN trên điểm máy, dùng mãi — tên dòng thuê máy (DVTM) tự sinh
-- lại đúng mỗi kỳ khi đẩy bảng kê sang Kanban, không cần tech_admin/staff gõ lại:
--
--  * kieu_ky TEXT ('thang' | 'tu_den', mặc định 'thang'):
--      - 'thang'  -> ghi "tháng M/YYYY" (như cũ).
--      - 'tu_den' -> ghi "từ DD/MM/YYYY đến DD/MM/YYYY" — TỰ TÍNH theo chot_so_ngay/
--                    chot_so_cuoi_thang đã có (tái dùng logic kyNgay của Word bảng kê),
--                    nên sang kỳ sau tự nhảy ngày, không đóng băng như lưu chuỗi cứng.
--        Áp cho khách chốt số giữa tháng (không lấy counter cuối tháng).
--
--  * ten_may_hd TEXT: "Tên máy trên hóa đơn". Rỗng -> dùng model. Cho phép gõ prefix hãng
--    tùy ý MỘT LẦN (VD "Konica Minolta bizhub C258") vì hãng thiếu quy luật, không tự đoán.
--
-- Chỉ ảnh hưởng dòng DVTM (thuê máy). Dòng số bản giữ "...trong kỳ".
--
-- ⚠️ CHẠY SQL TRƯỚC KHI DEPLOY. Idempotent.

ALTER TABLE public.soct_khach_hang ADD COLUMN IF NOT EXISTS kieu_ky TEXT NOT NULL DEFAULT 'thang';
ALTER TABLE public.soct_khach_hang ADD COLUMN IF NOT EXISTS ten_may_hd TEXT;

-- Ràng buộc giá trị hợp lệ cho kieu_ky (bỏ trước rồi thêm lại -> idempotent).
ALTER TABLE public.soct_khach_hang DROP CONSTRAINT IF EXISTS soct_khach_hang_kieu_ky_check;
ALTER TABLE public.soct_khach_hang ADD CONSTRAINT soct_khach_hang_kieu_ky_check
  CHECK (kieu_ky IN ('thang', 'tu_den'));
