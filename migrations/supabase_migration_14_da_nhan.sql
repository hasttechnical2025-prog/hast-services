-- MIGRATION 14: Thêm trạng thái "Đã nhận" vào quy trình phiếu giao việc
-- Quy trình mới: Chờ nhận -> Đã nhận -> Đang làm -> Hoàn thành / Lắp tiếp
-- CHẠY TRONG SUPABASE SQL EDITOR *TRƯỚC* KHI DEPLOY CODE MỚI (nếu không, tạo phiếu
-- có gán KTV sẽ lỗi vi phạm CHECK constraint). Idempotent — chạy lại an toàn.

-- 1) Nới CHECK constraint để chấp nhận 'Đã nhận'
ALTER TABLE public.soct_cong_viec DROP CONSTRAINT IF EXISTS soct_cong_viec_ket_qua_check;
ALTER TABLE public.soct_cong_viec
  ADD CONSTRAINT soct_cong_viec_ket_qua_check
  CHECK (ket_qua IN ('Chờ nhận', 'Đã nhận', 'Đang làm', 'Hoàn thành', 'Lắp tiếp'));

-- 2) Chuẩn hóa dữ liệu cũ: phiếu đã có KTV nhưng vẫn 'Chờ nhận' -> 'Đã nhận'
UPDATE public.soct_cong_viec
   SET ket_qua = 'Đã nhận'
 WHERE ktv_id IS NOT NULL AND ket_qua = 'Chờ nhận';
