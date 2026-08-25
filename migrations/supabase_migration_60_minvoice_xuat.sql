-- MIGRATION 60: Chống hóa đơn ĐÚP khi xuất M-invoice (an toàn tối đa, phòng thủ nhiều lớp).
--
-- Bối cảnh rủi ro: nút "M-invoice" ở cột KT-HC xuất TẤT CẢ thẻ trong cột. Nếu kthc đã xuất
-- (đã import MISA) nhưng chưa chốt số HĐ sang cột 3, mà office đẩy thêm phiếu -> bấm lại =
-- import trùng -> HÓA ĐƠN ĐÚP (rất khó giải trình/hủy với cơ quan thuế).
--
-- Neo chân lý = SỐ HĐ THẬT (kthc nhập khi chốt sang cột 3). "Đã xuất file" ≠ "đã có hóa đơn".
-- Cờ dưới đây chỉ đánh dấu ĐÃ TẠO FILE, là trạng thái CHỜ đối chiếu — KHÔNG phải "xong".
--
--  * minvoice_luc TIMESTAMPTZ: thời điểm xuất M-invoice gần nhất của phiếu (NULL = chưa xuất).
--    -> nút hàng loạt CHỈ xuất phiếu chưa có cờ (chống đúp); banner đầu cột đếm phiếu "đã xuất
--       nhưng CHƯA có số HĐ" để kthc không quên đối chiếu MISA.
--  * minvoice_lan INT: số lần đã xuất (badge; tăng mỗi lần, kể cả xuất lại 1 thẻ có chủ đích).
--
-- Hàm stamp_minvoice(ids): đóng dấu ATOMIC (now() + tăng lần) cho lô phiếu, một vòng gọi.
--
-- ⚠️ CHẠY SQL TRƯỚC KHI DEPLOY (GET kanban-hd select minvoice_luc/minvoice_lan -> 500 nếu thiếu). Idempotent.

ALTER TABLE public.soct_cong_viec ADD COLUMN IF NOT EXISTS minvoice_luc TIMESTAMPTZ;
ALTER TABLE public.soct_cong_viec ADD COLUMN IF NOT EXISTS minvoice_lan INT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.stamp_minvoice(p_ids uuid[])
RETURNS void LANGUAGE sql AS $$
  UPDATE public.soct_cong_viec
  SET minvoice_luc = now(),
      minvoice_lan = COALESCE(minvoice_lan, 0) + 1
  WHERE id = ANY(p_ids)
    AND trang_thai_hd = 'Đang xử lý HĐ';  -- chỉ đóng dấu phiếu đang ở cột KT-HC (an toàn)
$$;
