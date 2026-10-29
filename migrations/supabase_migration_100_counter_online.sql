-- Migration 100: đánh dấu máy thuê/CPC lấy counter online (qua email/Zalo) hay onsite (đến điểm máy đọc).
-- Mặc định false = onsite -> tab "Nhập counter" hiện badge "Onsite" cạnh ngày chốt; online (true) thì không.
ALTER TABLE public.soct_khach_hang
  ADD COLUMN IF NOT EXISTS counter_online BOOLEAN DEFAULT false;
