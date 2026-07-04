-- MIGRATION 07: Bật RLS chặn anon trên mọi bảng (BẢO MẬT PRODUCTION)
-- Lý do: NEXT_PUBLIC_SUPABASE_ANON_KEY lộ trong bundle trình duyệt. Nếu không bật RLS,
-- bất kỳ ai có anon key đều đọc/ghi thẳng DB qua REST của Supabase, bỏ qua kiểm quyền ở API.
--
-- App truy cập DB HOÀN TOÀN qua service role (trong các API route) -> service role BỎ QUA RLS,
-- nên bật RLS mà KHÔNG tạo policy nào = chặn sạch anon/authenticated, app vẫn chạy bình thường.
-- Realtime dùng cơ chế Broadcast (không phụ thuộc RLS bảng) -> không ảnh hưởng.
--
-- Idempotent: chạy lại nhiều lần không lỗi.

ALTER TABLE public.soct_users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_khach_hang         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_kho_hang           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_nhap_hang_thang    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_dat_hang           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_dat_hang_ct        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_hang_ve_dot        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_cong_viec          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_chi_tiet_vat_tu    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_bao_tri            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_giam_dinh          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_giam_dinh_vat_tu   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_danh_muc           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soct_cau_hinh           ENABLE ROW LEVEL SECURITY;

-- (Cố ý KHÔNG tạo policy: RLS bật + không policy = deny-all cho anon/authenticated.
--  Nếu sau này cần cho client đọc trực tiếp bảng nào, mới thêm policy cụ thể cho bảng đó.)
