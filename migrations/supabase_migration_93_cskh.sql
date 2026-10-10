-- MIGRATION 93: Chăm sóc khách hàng (CSKH) — Giai đoạn 1.
-- Nền là khách cụm (soct_khach_cum) + cho admin thêm KHÁCH TIỀM NĂNG (mới). Nhật ký chăm sóc dùng chung.
-- Office dùng chung (chưa gán người phụ trách). Tab: Sổ công tác › Chăm sóc KH (admin-only mặc định).

-- Khách tiềm năng (khách mới admin tự thêm). Khách cụm KHÔNG lưu ở đây (lấy trực tiếp từ soct_khach_cum).
CREATE TABLE IF NOT EXISTS public.soct_cskh_khach (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ten_khach_hang TEXT NOT NULL,
  nguoi_lien_he TEXT,
  dien_thoai    TEXT,
  email         TEXT,
  dia_chi       TEXT,
  nguon         TEXT,                         -- nguồn: giới thiệu / tự tìm / sự kiện / khác
  trang_thai    TEXT NOT NULL DEFAULT 'moi',  -- pipeline: moi | dang_tiep_can | thanh_khach | khong_thanh
  ghi_chu       TEXT,
  an            BOOLEAN NOT NULL DEFAULT false,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nhật ký chăm sóc — gắn với khách cụm (ma_khach_cum) HOẶC khách tiềm năng (tiem_nang_id), đúng 1 trong 2.
CREATE TABLE IF NOT EXISTS public.soct_cskh_log (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ma_khach_cum TEXT,                          -- khi chăm sóc khách CỤM
  tiem_nang_id BIGINT REFERENCES public.soct_cskh_khach(id) ON DELETE CASCADE, -- khi chăm sóc khách tiềm năng
  ngay         DATE NOT NULL DEFAULT current_date,
  kenh         TEXT,                          -- Điện thoại | Zalo | Email | Onsite | Khác
  noi_dung     TEXT,
  ket_qua      TEXT,
  viec_tiep    TEXT,
  ngay_hen     DATE,                          -- hẹn làm việc tiếp theo (để nhắc)
  nguoi_id     UUID,
  nguoi_ten    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cskh_log_cum ON public.soct_cskh_log (ma_khach_cum);
CREATE INDEX IF NOT EXISTS idx_cskh_log_tn  ON public.soct_cskh_log (tiem_nang_id);
CREATE INDEX IF NOT EXISTS idx_cskh_log_hen ON public.soct_cskh_log (ngay_hen);
