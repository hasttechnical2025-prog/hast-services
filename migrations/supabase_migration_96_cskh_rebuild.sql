-- MIGRATION 96: CSKH — SAN PHẲNG & XÂY LẠI theo MÁY.
-- Nghiệp vụ mới: danh sách máy đã từng lấy vật tư/dịch vụ (import lịch sử 2024→nay), chăm sóc để
-- kéo khách MUA LẠI / quay lại (nếu đã mất). Đơn vị = 1 MÁY (khóa ma_may), làm giàu từ điểm máy app.
-- Bỏ hẳn: khách tiềm năng, pipeline tiềm năng, KPI, hàng đợi "cần chăm sóc" tự sinh.

-- Gỡ bảng CSKH cũ (mig 93). CASCADE để bỏ FK/index liên quan.
DROP TABLE IF EXISTS public.soct_cskh_log CASCADE;
DROP TABLE IF EXISTS public.soct_cskh_khach CASCADE;

-- Hồ sơ chăm sóc theo MÁY. 1 dòng / mã máy.
CREATE TABLE public.soct_cskh_may (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ma_may          TEXT NOT NULL UNIQUE,
  ten_khach_hang  TEXT,                         -- lấy từ điểm máy (app) nếu khớp, else từ Excel
  ma_khach_cum    TEXT,                         -- mã cụm (nếu máy thuộc khách cụm)
  ten_cum         TEXT,
  model           TEXT,
  dia_chi         TEXT,
  nguoi_lien_he   TEXT,                         -- tách từ cột "Vật tư + Người liên hệ"
  dien_thoai      TEXT,                         -- tách từ cột "Vật tư + Người liên hệ"
  lan_cuoi        TEXT,                         -- tháng lấy gần nhất 'YYYY-MM'
  so_lan_lay      INTEGER NOT NULL DEFAULT 0,
  vat_tu_gan_nhat TEXT,
  phan_loai       TEXT,                         -- dang_dung | nguy_co | da_mat (chỉ lưu khi SỬA TAY)
  phan_loai_tay   BOOLEAN NOT NULL DEFAULT false,-- true = đã đè tay, GET không tự suy nữa
  giai_doan       TEXT NOT NULL DEFAULT 'chua_lien_he', -- chua_lien_he|da_lien_he|quan_tam|da_quay_lai|tu_choi
  khop_diem_may   BOOLEAN NOT NULL DEFAULT false,-- mã máy có khớp điểm máy trong app không
  ghi_chu         TEXT,
  an              BOOLEAN NOT NULL DEFAULT false,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cskh_may_cum ON public.soct_cskh_may (ma_khach_cum);
CREATE INDEX idx_cskh_may_lancuoi ON public.soct_cskh_may (lan_cuoi);

-- Lịch sử lấy hàng (mỗi lần import = 1 dòng). Dùng tính tần suất & timeline.
CREATE TABLE public.soct_cskh_lichsu (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ma_may     TEXT NOT NULL,
  thang      TEXT NOT NULL,                     -- 'YYYY-MM'
  vat_tu     TEXT,                              -- nguyên văn cột "Vật tư + Người liên hệ"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Chống trùng khi import lại cùng file: 1 (máy, tháng, nội dung) chỉ 1 dòng.
CREATE UNIQUE INDEX uq_cskh_lichsu ON public.soct_cskh_lichsu (ma_may, thang, md5(coalesce(vat_tu, '')));
CREATE INDEX idx_cskh_lichsu_may ON public.soct_cskh_lichsu (ma_may);

-- Nhật ký chăm sóc tay (gọi/Zalo/onsite...). Gắn theo MÁY.
CREATE TABLE public.soct_cskh_log (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ma_may     TEXT NOT NULL,
  ngay       DATE NOT NULL DEFAULT current_date,
  kenh       TEXT,                              -- Điện thoại | Zalo | Email | Onsite | Khác
  noi_dung   TEXT,
  ket_qua    TEXT,
  viec_tiep  TEXT,
  ngay_hen   DATE,                              -- hẹn gọi lại (để nhắc chuông)
  nguoi_id   UUID,
  nguoi_ten  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cskh_log_may ON public.soct_cskh_log (ma_may);
CREATE INDEX idx_cskh_log_hen ON public.soct_cskh_log (ngay_hen);
