-- MIGRATION 104: Module Bảo hành hãng — FBVN (FUJIFILM).
--
-- Sổ GỘP 1 bản ghi = 1 ca bảo hành (1 vật tư lỗi/1 máy), 2 mặt độc lập tùy chọn:
--   ① Claim hãng  -> xuất Form (A)
--   ② Bàn giao KH -> xuất BB Bàn giao
-- + 2 bảng tra cứu nền: PL-Invoice (serial->hóa đơn/FOB/model), DM Hàng (mã claim).
-- Số Form A: HST-{YY}.{nnn} reset theo năm; Số BB: HST-{năm}.{nnn} reset theo năm.
-- On-air (hạn BH) = cuối tháng, FOB + 12 tháng (tính + lưu khi lưu bản ghi).
-- API dùng service role (supabaseAdmin) -> bỏ qua RLS; không cần GRANT.
-- Idempotent. Chạy trong Supabase SQL Editor.

-- ─── Bảng tra: PL-Invoice (dữ liệu giao hàng FUJIFILM) ───
CREATE TABLE IF NOT EXISTS public.soct_bh_plinvoice (
    id          BIGSERIAL PRIMARY KEY,
    do_no       TEXT,
    item_no     TEXT,              -- mã máy (Item No.)
    serial      TEXT NOT NULL,     -- số serial máy
    model       TEXT,
    fob_date    DATE,              -- Date of Invoice (= FOB)
    invoice_no  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bh_plinvoice_serial ON public.soct_bh_plinvoice (serial);

-- ─── Bảng tra: DM Hàng (mã vật tư claim được của hãng) ───
CREATE TABLE IF NOT EXISTS public.soct_bh_dmhang (
    id         BIGSERIAL PRIMARY KEY,
    ma_hang    TEXT NOT NULL,
    ten_hang   TEXT,
    model      TEXT,
    ghi_chu    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bh_dmhang_ma ON public.soct_bh_dmhang (ma_hang);

-- ─── Sổ chính: 1 bản ghi = 1 ca ───
CREATE TABLE IF NOT EXISTS public.soct_bh_fbvn (
    id            BIGSERIAL PRIMARY KEY,
    ngay          DATE,              -- ngày lập phiếu claim (Date trên Form A)
    ktv           TEXT,              -- Name (CE) — tên KTV
    -- Máy (auto từ PL-Invoice qua serial)
    serial        TEXT,
    item_no       TEXT,
    model         TEXT,
    fob_date      DATE,
    invoice_no    TEXT,
    do_no         TEXT,
    on_air        DATE,              -- hạn BH = cuối tháng, FOB+12th (tính khi lưu)
    -- Vật tư (auto từ DM Hàng qua mã)
    product_code  TEXT,
    ten_claim     TEXT,
    don_vi        TEXT,
    -- Lỗi (dùng chung 2 form)
    defect_date   DATE,
    contents      TEXT,              -- Contents of Quality Problem / Tình trạng
    possible_cause TEXT,             -- Possible Cause / Nguyên nhân
    -- Judgment (CE) — 4 cờ; mặc định tick Goods Confirmation
    judg_install  BOOLEAN NOT NULL DEFAULT false,
    judg_tech     BOOLEAN NOT NULL DEFAULT false,
    judg_goods    BOOLEAN NOT NULL DEFAULT true,
    judg_info     BOOLEAN NOT NULL DEFAULT false,
    -- Attached Material — 6 cờ; mặc định tick Invoice + Faulty Goods + P/O
    att_invoice   BOOLEAN NOT NULL DEFAULT true,
    att_mhc       BOOLEAN NOT NULL DEFAULT false,
    att_faulty    BOOLEAN NOT NULL DEFAULT true,
    att_sample    BOOLEAN NOT NULL DEFAULT false,
    att_po        BOOLEAN NOT NULL DEFAULT true,
    att_license   BOOLEAN NOT NULL DEFAULT false,
    -- Mặt bật/tắt
    co_claim      BOOLEAN NOT NULL DEFAULT true,
    co_ban_giao   BOOLEAN NOT NULL DEFAULT true,
    -- Tiến trình
    claim_sent         BOOLEAN NOT NULL DEFAULT false,
    fbvn_claim_no      TEXT,         -- hãng cấp sau, nhập tay
    goods_received     BOOLEAN NOT NULL DEFAULT false,
    goods_received_date DATE,
    back_to_customer   BOOLEAN NOT NULL DEFAULT false,
    -- Bàn giao khách (BB)
    customer      TEXT,
    dia_chi       TEXT,
    nguoi_lien_he TEXT,
    dien_thoai    TEXT,
    counter       TEXT,
    huong_giai_quyet TEXT DEFAULT 'Trả hàng bảo hành',
    ngay_hen_tra  DATE,
    ghi_chu       TEXT,
    -- Số hiệu (cấp khi xuất Word, giữ nguyên khi xuất lại)
    so_form_a     TEXT,
    so_bb         TEXT,
    -- Meta
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    TEXT,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bh_fbvn_serial ON public.soct_bh_fbvn (serial);
CREATE INDEX IF NOT EXISTS idx_bh_fbvn_ngay   ON public.soct_bh_fbvn (ngay);

-- ─── Bộ đếm số theo năm (Form A + BB), atomic ───
CREATE TABLE IF NOT EXISTS public.soct_bh_forma_seq (nam INT PRIMARY KEY, seq INT NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS public.soct_bh_bb_seq    (nam INT PRIMARY KEY, seq INT NOT NULL DEFAULT 0);

CREATE OR REPLACE FUNCTION public.next_bh_forma_seq(p_nam INT) RETURNS INT AS $$
    INSERT INTO public.soct_bh_forma_seq (nam, seq) VALUES (p_nam, 1)
    ON CONFLICT (nam) DO UPDATE SET seq = soct_bh_forma_seq.seq + 1
    RETURNING seq;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION public.next_bh_bb_seq(p_nam INT) RETURNS INT AS $$
    INSERT INTO public.soct_bh_bb_seq (nam, seq) VALUES (p_nam, 1)
    ON CONFLICT (nam) DO UPDATE SET seq = soct_bh_bb_seq.seq + 1
    RETURNING seq;
$$ LANGUAGE sql;
