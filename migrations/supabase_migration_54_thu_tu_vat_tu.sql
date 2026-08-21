-- MIGRATION 54: Thứ tự dòng vật tư (kéo-thả sắp xếp ở modal Trợ thủ, cột "Chờ lên hóa đơn").
--
-- `thu_tu` INT: thứ tự hiển thị/xuất của dòng vật tư trong 1 phiếu. Kéo-thả để đổi vị trí,
-- áp cho hiển thị modal + Xuất Excel + Xuất M-invoice (STT theo đúng thứ tự đã sắp).
-- Backfill theo thứ tự NHẬP (created_at) trong từng phiếu -> ban đầu không đổi gì trực quan.
--
-- ⚠️ CHẠY SQL TRƯỚC KHI DEPLOY: GET kanban-hd có select `thu_tu`, thiếu cột sẽ 500.
-- Idempotent (chạy lại chỉ đặt lại đúng thứ tự cũ). Chạy trong Supabase SQL Editor.

ALTER TABLE public.soct_chi_tiet_vat_tu
    ADD COLUMN IF NOT EXISTS thu_tu INT NOT NULL DEFAULT 0;

WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY id_cong_viec ORDER BY created_at, id) - 1 AS rn
    FROM public.soct_chi_tiet_vat_tu
)
UPDATE public.soct_chi_tiet_vat_tu c
SET thu_tu = r.rn
FROM ranked r
WHERE c.id = r.id;
