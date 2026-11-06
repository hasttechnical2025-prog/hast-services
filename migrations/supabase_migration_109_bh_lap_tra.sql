-- MIGRATION 109: Bảo hành FBVN — nghiệp vụ "Lắp trả" (settle ca đang mượn).
--
-- Bối cảnh: KTV tháo con DỰ PHÒNG trong kho BH lắp cho máy khách TRƯỚC (giữ máy chạy) rồi gửi
-- con lỗi đi hãng → kho mã đó = -1 "đang mượn". Khi hàng về (có thể MÃ MỚI), KTV ra hiện trường
-- "lắp trả": gỡ con dự phòng khỏi máy, lắp con hãng trả vào → con dự phòng VỀ KHO (+SL mã gửi),
-- con hãng trả BỊ TIÊU THỤ (-SL mã lắp) → cả mã mượn lẫn mã trả về = 0.
--
-- Lưu trên ca: lap_tra (đã lắp trả) + lap_tra_luc + lap_tra_ma (mã con LẮP vào máy, trừ kho)
-- + lap_tra_sl (số lượng). Mã mượn (trả về kho) = product_code của ca. Tồn kho tính động ở
-- /api/admin/bao-hanh/dmhang có cộng thêm cặp delta này khi lap_tra=true. Idempotent.

ALTER TABLE public.soct_bh_fbvn
    ADD COLUMN IF NOT EXISTS lap_tra      boolean NOT NULL DEFAULT false,  -- đã lắp trả (settle đang mượn)
    ADD COLUMN IF NOT EXISTS lap_tra_luc  timestamptz,                     -- thời điểm lắp trả
    ADD COLUMN IF NOT EXISTS lap_tra_ma   text,                            -- mã con LẮP vào máy (trừ kho)
    ADD COLUMN IF NOT EXISTS lap_tra_sl   integer;                         -- số lượng lắp trả (mặc định 1)
