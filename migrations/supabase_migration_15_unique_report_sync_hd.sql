-- MIGRATION 15:
--  (1) Ràng buộc UNIQUE số phiếu (report) — chặn trùng khi import & khi lập phiếu
--  (2) Đồng bộ trang_thai_hd (công nợ) với cờ hoa_don của vật tư
-- Chạy trong Supabase SQL Editor. Idempotent. An toàn dữ liệu (chỉ xóa phiếu TRÙNG số phiếu).

-- ── (1) UNIQUE report ──────────────────────────────────────────
-- Chuẩn hóa: bỏ khoảng trắng thừa ở số phiếu
UPDATE public.soct_cong_viec
   SET report = trim(report)
 WHERE report IS NOT NULL AND report <> trim(report);

-- Dọn phiếu trùng còn sót: giữ bản tạo sớm nhất (created_at, rồi ctid), xóa phần thừa
DELETE FROM public.soct_cong_viec a
 USING public.soct_cong_viec b
 WHERE a.report IS NOT NULL AND a.report <> ''
   AND a.report = b.report
   AND (a.created_at, a.ctid) > (b.created_at, b.ctid);

-- Ràng buộc unique (partial) trên số phiếu khác rỗng (phiếu không số vẫn cho nhiều)
CREATE UNIQUE INDEX IF NOT EXISTS uq_soct_cong_viec_report
    ON public.soct_cong_viec (report)
 WHERE report IS NOT NULL AND report <> '';

-- ── (2) Đồng bộ trạng thái hóa đơn (công nợ) với cờ hoa_don ─────
-- Phiếu có ÍT NHẤT 1 vật tư đã hóa đơn -> coi như 'Đã lên hóa đơn' (ra khỏi công nợ)
UPDATE public.soct_cong_viec c
   SET trang_thai_hd = 'Đã lên hóa đơn'
 WHERE c.trang_thai_hd IS DISTINCT FROM 'Đã lên hóa đơn'
   AND EXISTS (
       SELECT 1 FROM public.soct_chi_tiet_vat_tu v
        WHERE v.id_cong_viec = c.id AND v.hoa_don = TRUE
   );
