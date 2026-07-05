# Triển khai (alpha / production)

Ứng dụng: Next.js 16 (App Router) + Supabase (Postgres) + Telegram bot. Host khuyến nghị: **Vercel** (Next) + **Supabase** (DB).

## 1. Biến môi trường (đặt trên host — Vercel → Settings → Environment Variables)

| Biến | Ghi chú |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL dự án Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (công khai — bắt buộc bật RLS, xem mục 3) |
| `SUPABASE_SERVICE_ROLE_KEY` | **BÍ MẬT** — chỉ dùng phía server (API route) |
| `SESSION_SECRET` | Chuỗi ngẫu nhiên mạnh (VD `openssl rand -hex 32`) — đổi khác dev |
| `WEBHOOK_SECRET` | Bí mật xác thực Supabase DB webhook (khớp header `Authorization: Bearer` khi tạo webhook) |
| `TELEGRAM_BOT_TOKEN` | Token bot @HAST_Report_bot |
| `TELEGRAM_GROUP_CHAT_ID` | ID group Telegram nhận việc chưa gán KTV |
| `TELEGRAM_WEBHOOK_SECRET` | Bí mật đặt kèm khi `setWebhook` (Telegram gửi lại ở header `X-Telegram-Bot-Api-Secret-Token`) — nên đặt để chống giả mạo |
| `NEXT_PUBLIC_APP_URL` | Domain production, VD `https://hast-services.vercel.app` |

`.env.example` liệt kê đủ các biến. **Không commit** `.env.local`.

## 2. Chạy migrations trên DB production (Supabase → SQL Editor, đúng thứ tự)

> **Nhanh nhất:** DB mới → chạy `supabase_schema.sql` rồi `supabase_migrations_ALL.sql` (đã gộp 02→12). DB đang dùng → chỉ cần chạy `supabase_migrations_ALL.sql`. Idempotent, chạy lại không lỗi.

Chi tiết từng file (nếu muốn chạy lẻ):

1. `supabase_schema.sql` (schema gốc — chỉ chạy nếu DB mới)
2. `supabase_migration_02_pool_workflow.sql`
3. `supabase_migration_03_vattu_financials.sql`
4. `supabase_migration_04_bao_tri_giam_dinh.sql`
5. `supabase_migration_05_danh_muc_cau_hinh.sql`
6. `supabase_migration_06_dat_hang.sql`
7. `supabase_migration_07_rls.sql` ← **BẢO MẬT, bắt buộc**
8. `supabase_migration_08_bao_cao.sql` (số lượng phiếu + hãng máy + danh mục hãng)
9. `supabase_migration_09_doanh_so.sql` (bảng doanh số tháng cho báo cáo)
10. `supabase_migration_10_phieu_cung.sql` (nộp phiếu cứng + ngưỡng cảnh báo)
11. `supabase_migration_11_cong_no.sql` (trạng thái hóa đơn cấp phiếu)
12. `supabase_migration_12_audit_log.sql` (bảng audit log)

Tất cả migration đều idempotent (chạy lại không lỗi). Chạy TUẦN TỰ từ 02→12.

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

- `npm run build` phải xanh (không lỗi type/compile). **Đã verify ngày build này: xanh, 34 route.**
- Kiểm tra sau deploy (smoke test toàn quy trình):
  1. Đăng nhập admin → đổi mật khẩu (Hệ thống → Đổi mật khẩu).
  2. Giao việc → bắn Telegram (group nếu chưa gán; DM nếu gán KTV đã liên kết).
  3. KTV: đăng nhập QR → bấm "Liên kết Telegram" (/start) → nhận DM việc mới → nhận việc → hoàn thành.
  4. Sửa/Xóa phiếu (khi Chờ nhận); Hoàn phiếu → nhắc KTV qua Telegram.
  5. Đặt hàng → hàng về → tồn kho cộng; Import/Xuất Excel Khách hàng & Kho hàng.
  6. Công nợ → chọn nhiều điểm máy → xuất báo giá .docx; Báo cáo tháng .docx.
  7. Audit Logs ghi nhận các thao tác.

## 6. Khác

- `public/logo.png`: thay bằng logo thật (đã dùng ở header admin).
- Supabase bật auto-backup (gói trả phí).
- Múi giờ: dữ liệu ngày lưu dạng `YYYY-MM-DD`; hiển thị `DD/MM/YYYY` (xem AGENTS.md).
