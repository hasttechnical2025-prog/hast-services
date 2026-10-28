-- MIGRATION 99: Nhật ký LƯỢT ĐI của KTV (công theo lượt, 1 phiếu = 1 report dùng xuyên nhiều buổi)
-- ============================================================================================
-- Bối cảnh: trước đây "Chưa hoàn thành" -> office bấm "Tạo phiếu tiếp" đẻ ra 1 PHIẾU MỚI. Nhưng
-- report có UNIQUE INDEX (mig 15) nên phiếu con KHÔNG mang được số report cũ -> lỗ hổng với Giao mực/
-- Thay vật tư (bắt buộc có report). Thực tế office DÙNG LẠI đúng số report cũ, KTV chỉ đi lần 2.
--
-- Mô hình MỚI: KHÔNG đẻ phiếu con. Giữ NGUYÊN 1 phiếu (giữ report + vật tư). Khi office bấm
-- "Làm tiếp", buổi đang dở được "đóng băng" thành 1 dòng ở bảng này (snapshot), rồi phiếu reset về
-- 'Chờ nhận' + ngày hôm nay để KTV đi tiếp. Công KTV đếm theo LƯỢT = (phiếu hiện tại) ∪ (các lượt đóng băng).
--
-- Vì sao snapshot (denormalize): báo cáo ngày đọc LIVE theo `ngay`; nếu chỉ đổi ngày phiếu thì buổi cũ
-- biến mất khỏi báo cáo ngày hôm đó. Lưu snapshot ở đây -> báo cáo/Word ngày cũ không vỡ dù phiếu đổi sau.
--
-- KHÔNG cần backfill: phiếu hoàn thành 1 buổi vẫn đọc từ soct_cong_viec như cũ; lượt chỉ sinh từ nay
-- khi bấm "Làm tiếp". Phiếu con cũ (nếu DB lỡ có 1-2) vẫn là phiếu riêng, được đếm như job riêng.

CREATE TABLE IF NOT EXISTS public.soct_cong_viec_luot (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_cong_viec  uuid REFERENCES public.soct_cong_viec(id) ON DELETE SET NULL,
  ktv_id        uuid REFERENCES public.soct_users(id) ON DELETE SET NULL,
  ktv2_id       uuid REFERENCES public.soct_users(id) ON DELETE SET NULL,
  ngay          date NOT NULL,
  bat_dau_luc   timestamptz,
  hoan_thanh_luc timestamptz,
  so_phut       integer,
  ket_qua_luot  text NOT NULL DEFAULT 'Chưa hoàn thành',
  ghi_chu_ktv   text,
  counter       integer,
  -- snapshot hiển thị (báo cáo ngày cũ không vỡ dù phiếu/khách sửa về sau):
  ma_may        text,
  loai_cong_viec text,
  ten_khach_hang text,
  dia_chi       text,
  report        text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cvluot_cv       ON public.soct_cong_viec_luot(id_cong_viec);
CREATE INDEX IF NOT EXISTS idx_cvluot_ktv_ngay ON public.soct_cong_viec_luot(ktv_id, ngay);
CREATE INDEX IF NOT EXISTS idx_cvluot_ngay     ON public.soct_cong_viec_luot(ngay);
