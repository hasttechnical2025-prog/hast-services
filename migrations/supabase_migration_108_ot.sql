-- MIGRATION 108: Làm thêm giờ (OT).
--
-- tech_admin phân công + tạo lịch OT → cuối tháng xuất "Phiếu đăng ký làm thêm giờ" (Word)
-- cho từng người → ký xác nhận → giao kthc tính tiền OT. KTV KHÔNG tự đăng ký (chỉ xem /ktv).
-- Mỗi dòng = 1 ca OT (= 1 dòng sheet "Data" trong file theo dõi cũ). Giờ lưu text "HH:MM".
-- Tháng suy từ `ngay`; Thứ (2–7/CN) tính runtime. 3 cột phân loại (ngày thường/đêm/lễ-tết)
-- KHÔNG lưu ở đây — để trống trên phiếu in cho P.HCNS điền + ký tay.
-- Idempotent. Chạy trong Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.soct_ot (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nhan_vien_id  uuid NOT NULL REFERENCES public.soct_users(id) ON DELETE CASCADE,
    ngay          date NOT NULL,
    tu_gio        text,                       -- "08:00"
    den_gio       text,                       -- "21:00"
    dia_diem      text,                       -- Địa điểm thực hiện
    dau_viec      text,                       -- Đầu việc cụ thể (nội dung công việc)
    ket_qua       text DEFAULT 'Hoàn thành',  -- Kết quả công việc
    ghi_chu       text,
    nguoi_tao     uuid REFERENCES public.soct_users(id),
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_soct_ot_nv_ngay ON public.soct_ot (nhan_vien_id, ngay);
CREATE INDEX IF NOT EXISTS idx_soct_ot_ngay    ON public.soct_ot (ngay);
