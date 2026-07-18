-- MIGRATION 30: Đo "thời gian xử lý phiếu" (lead time) của KTV: bấm Đang làm -> Hoàn thành.
-- Trước đây đổi trạng thái CHỈ ghi đè ket_qua, không lưu mốc giờ -> không đo được.
-- 3 cột đều GHI MỘT LẦN (set khi đang NULL) để việc gửi lại (hàng đợi offline) không
-- ghi đè: gửi bao nhiêu lần cũng ra một kết quả (idempotent).
-- Chạy trong Supabase SQL Editor. Idempotent.

ALTER TABLE public.soct_cong_viec
    ADD COLUMN IF NOT EXISTS bat_dau_luc     TIMESTAMP WITH TIME ZONE, -- lần ĐẦU bấm "Đang làm"
    ADD COLUMN IF NOT EXISTS hoan_thanh_luc  TIMESTAMP WITH TIME ZONE, -- lúc bấm "Hoàn thành"
    -- Thời lượng KTV XÁC NHẬN (phút) tại hộp thoại Hoàn thành — có thể chỉnh tay để bù
    -- thời gian đi bộ/mất sóng. Đây là con số dùng để hiển thị & tính trung bình.
    ADD COLUMN IF NOT EXISTS so_phut_xu_ly   INTEGER;

CREATE INDEX IF NOT EXISTS idx_cong_viec_so_phut ON public.soct_cong_viec(so_phut_xu_ly) WHERE so_phut_xu_ly IS NOT NULL;
