# Triển khai (alpha / production)

Ứng dụng: Next.js 16 (App Router) + Supabase (Postgres) + Telegram bot. Host khuyến nghị: **Vercel** (Next) + **Supabase** (DB).

## 1. Biến môi trường (đặt trên host — Vercel → Settings → Environment Variables)

| Biến | Ghi chú |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL dự án Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (công khai — bắt buộc bật RLS, xem mục 3) |
| `SUPABASE_SERVICE_ROLE_KEY` | **BÍ MẬT** — chỉ dùng phía server (API route) |
| `SESSION_SECRET` | Chuỗi ngẫu nhiên mạnh (VD `openssl rand -hex 32`) — đổi khác dev |
| `WEBHOOK_SECRET` | Bí mật xác thực Supabase DB webhook |
| `TELEGRAM_BOT_TOKEN` | Token bot @HAST_Report_bot |
| `TELEGRAM_GROUP_CHAT_ID` | `-5476784992` (group báo việc chưa gán) |
| `NEXT_PUBLIC_APP_URL` | Domain production, VD `https://hast-services.vercel.app` |

`.env.example` liệt kê đủ các biến. **Không commit** `.env.local`.

## 2. Chạy migrations trên DB production (Supabase → SQL Editor, đúng thứ tự)

1. `supabase_schema.sql` (schema gốc — chỉ chạy nếu DB mới)
2. `supabase_migration_02_pool_workflow.sql`
3. `supabase_migration_03_vattu_financials.sql`
4. `supabase_migration_04_bao_tri_giam_dinh.sql`
5. `supabase_migration_05_danh_muc_cau_hinh.sql`
6. `supabase_migration_06_dat_hang.sql`
7. `supabase_migration_07_rls.sql` ← **BẢO MẬT, bắt buộc**

Tất cả migration đều idempotent (chạy lại không lỗi).

## 3. Bảo mật (BẮT BUỘC trước alpha)

- **RLS**: chạy migration 07 để bật RLS chặn anon trên mọi bảng. App dùng service role qua API nên không ảnh hưởng; realtime dùng Broadcast nên không cần policy.
- **Đổi mật khẩu admin** `Admin@123` sang mật khẩu mạnh (Hệ thống → Tài khoản).
- **Dọn dữ liệu/tài khoản test** (VD `ducthe` nếu là test).
- Nên thêm **rate-limit đăng nhập** (chống dò mật khẩu) — chưa có.
- Cân nhắc chạy skill **`/security-review`** trước khi mở alpha.

## 4. Webhook

- **Supabase → Database → Webhooks**: bảng `soct_cong_viec` (INSERT/UPDATE) → `POST {APP_URL}/api/webhook/supabase`, header `Authorization: Bearer {WEBHOOK_SECRET}`.
- **Telegram bot** setWebhook → `{APP_URL}/api/telegram/webhook` (để KTV /start liên kết telegram_id).

## 5. Build & kiểm tra

- `npm run build` phải xanh (không lỗi type/compile).
- Kiểm tra sau deploy: đăng nhập admin, giao việc, đăng nhập KTV (QR), bắn Telegram, đặt hàng → hàng về → tồn kho cộng.

## 6. Khác

- `public/logo.png`: thay bằng logo thật (đã dùng ở header admin).
- Supabase bật auto-backup (gói trả phí).
- Múi giờ: dữ liệu ngày lưu dạng `YYYY-MM-DD`; hiển thị `DD/MM/YYYY` (xem AGENTS.md).
