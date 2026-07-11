# HAST — Sổ công tác & Kho hàng · TRẠNG THÁI DỰ ÁN

> Tài liệu sống cho MỌI phiên làm việc (Claude Code, CC gateway, người). Đọc file này TRƯỚC
> khi bắt tay, cập nhật nó SAU khi thêm tính năng lớn / migration / gotcha mới.
> **Cập nhật lần cuối: 2026-07-10.**

## Tổng quan
- App quản lý giao việc / kho hàng / bảo trì / giám định / công nợ cho công ty dịch vụ máy photocopy.
- **Giai đoạn: BETA, đang chạy production ổn.** Deploy Vercel từ nhánh `main` → https://hast-services.vercel.app
- Stack: **Next.js 16 (App Router, Turbopack) + React 19 + Tailwind 4 + TypeScript**, **Supabase Postgres**.
- Bot Telegram **@HAST_Report_bot**; group "HAST Công việc".
- ⚠️ **Lịch sử git đã bị viết lại nhiều lần** → TIN VÀO CODE HIỆN TẠI, đừng tra cứu theo hash commit cũ.

## Quy tắc BẮT BUỘC (xem thêm AGENTS.md)
- **Kiểm tra bằng `npx tsc --noEmit`, KHÔNG dùng `npm run build`** (build làm hỏng `.next` của dev; nếu lỡ build thì `rm -rf .next`).
- Tiền: `value.toLocaleString('vi-VN')` (dạng `#.###`), số thực `Math.round` trước; VAT kèm `%`. Không áp cho số phiếu/mã.
- Ngày hiển thị/nhập: `DD/MM/YYYY`; ô chọn ngày dùng `DateField`; ô tháng giữ `MM/YYYY`.
- Xóa cứng (hard delete). Excel (không CSV) cho import/export, BOM UTF-8.
- Bảng DB tiền tố `soct_`. Truy cập DB qua **API route dùng service role**; RLS chặn anon.
- Chỉ commit/push khi người dùng yêu cầu. Commit message tiếng Việt, kết `Co-Authored-By: Claude ...`.

## GOTCHAS quan trọng (dễ vỡ nếu không biết)
1. **3 FK tới `soct_users`** trong `soct_cong_viec`: `ktv_id`, `ktv2_id`, `created_by`. Embed PostgREST PHẢI chỉ rõ FK: `soct_users!ktv_id(...)`, `ktv2:soct_users!ktv2_id(...)`. Thêm FK mới → rà lại mọi embed cũ.
2. **`ket_qua` có CHECK constraint** (`'Chờ nhận','Đã nhận','Đang làm','Hoàn thành','Lắp tiếp'`). Thêm/đổi trạng thái BẮT BUỘC có migration DROP+ADD constraint.
3. **Danh sách phiếu (GET cong-viec) giới hạn `.range(0,999)`/response** (tránh vượt payload ~4.5MB serverless). Tìm phiếu cũ = lọc **số phiếu (toàn cục)** hoặc **khoảng ngày** phía server (client gửi `report/tuNgay/denNgay`). Các list dài khác dùng helper `selectAll()` (lặp `.range`).
4. **Trừ kho chỉ khi phiếu → 'Hoàn thành'** (trigger DB `soct_tr_handle_hoan_thanh_cong_viec`, AFTER UPDATE). Import (INSERT) không trừ. "Tồn khả dụng" = Tồn − "Đang giữ" (SL vật tư phiếu chưa hoàn thành) chỉ để hiển thị/cảnh báo — API `/api/admin/kho-hang/dang-giu`.
4b. **Đặt hàng — bảo vệ tồn kho:** tồn kho CHỈ đổi qua `soct_hang_ve_dot` (trigger mig 06: hàng về +, xóa đợt −). Ghi/xóa **hàng về = admin-only**. Đơn/dòng **đã có hàng về bị KHÓA**: sửa cấu trúc & chuyển-về-Nháp bị chặn (mọi role, server `dat-hang` route); xóa dòng/đơn có hàng về chỉ admin + `window.confirm` nêu số bị trừ; tech_admin bị ẩn nút xóa khi đã có hàng về. ⚠️ `supabase_schema.sql` KHÔNG còn định nghĩa đặt-hàng (đã chuyển hẳn sang migration 06 — model header+ct; tránh model cũ 1 mã/đơn).
5. **`telegram_sent`**: luồng giao việc hàng loạt (bulk-scan) tự bắn 1 tin Telegram tổng hợp và set cờ này = true; webhook DB bỏ qua record có cờ để không spam tin lẻ.
6. Webhook Telegram chỉ bắn cho phiếu 'Chờ nhận'/'Đã nhận' (bỏ qua import lịch sử đã Hoàn thành).

## Module chính
- **Sổ công tác** (giao việc): pool + nhận việc, 4 trạng thái Chờ nhận→Đã nhận→Đang làm→Hoàn thành/Lắp tiếp, KTV hủy nhận, **KTV2** (đi cùng, chỉ office gán), realtime (Supabase Broadcast topic `soct_jobs`).
- **Kho hàng**: Tồn kho, **Đặt hàng** (đơn nháp, hàng về, tồn khả dụng, xuất Excel 8 cột đơn lẻ / 11 cột báo cáo tổng, lọc hãng), Thống kê nhập.
- **Theo dõi máy**: Bảo trì (+ tab "Chưa bảo trì tháng"), Giám định.
- **Hoàn phiếu** (kiểm soát nộp phiếu cứng), **Công nợ** (báo giá .docx 4 trang; trang_thai_hd đồng bộ 2 chiều với cờ hoa_don).
- **Quản lý**: Báo cáo KTV / Nhật ký ngày (chốt nộp, xuất .docx, cron nhắc `/api/cron/nhac-bao-cao` dùng `CRON_SECRET` — ⚠️ chưa gắn `vercel.json` chạy tự động), Danh sách khách hàng, Báo cáo tháng.
- **Batch QR Maintenance Scheduler**: trang **`/admin/scan`** — quét QR mã máy bằng camera (html5-qrcode) → giao bảo trì hàng loạt cho 1 KTV (`/api/admin/cong-viec/bulk-scan`).
- **Office Mobile `/m`**: bản gọn cho **admin/tech_admin** (chặn staff/ktv) trên điện thoại — 3 tab: Giao việc (không vật tư, bỏ Giao mực/Thay vật tư), Quét QR (→ /admin/scan), Đặt hàng (xem đơn; tech_admin tạo **đơn nháp**; ghi hàng về chỉ admin). Office trên mobile (trang chủ + Passkey) tự vào /m; PC giữ dashboard đầy đủ. KTV bị cấm /admin (login lọc role + trang /admin từ chối role ktv).
- **Hệ thống**: phân quyền tab (tabs.ts), đổi mật khẩu, Audit logs, QR đăng nhập KTV.
- **App KTV** `/ktv`: mobile, lịch chọn ngày, nhận/hủy việc, báo cáo ngày.
- **Tự cập nhật**: `/api/version` + `UpdateChecker` (root layout) → banner khi có deploy mới.
- **Đăng nhập sinh trắc học (WebAuthn/Passkey)** (mig 20, `soct_webauthn_credentials`): vân tay/Face ID; đăng nhập **usernameless** → chọn tài khoản + Face ID → điều hướng theo vai trò (dùng chuyển office↔ktv nhanh). Passkey nằm ở iCloud Keychain nên **sống sót khi iOS xóa cookie/localStorage**. Thư viện `@simplewebauthn` (tự host, miễn phí). Routes `/api/auth/webauthn/{register,login}/{options,verify}`; nút ở màn đăng nhập + Hệ thống (office) + app KTV. rpID gắn theo domain (hast-services.vercel.app).

## Migration & env
- **Migration mới nhất: 20** (`soct_webauthn_credentials`). DB mới: chạy `supabase_schema.sql` rồi `supabase_migrations_ALL.sql`. DB đang chạy: chạy các migration mới lẻ (`supabase_migration_NN_*.sql`).
- ⏳ **Việc thủ công của người dùng:** chạy `supabase_migration_19_telegram_sent.sql` và `supabase_migration_20_webauthn.sql` trên Supabase SQL Editor.
- Env cần: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_GROUP_CHAT_ID`, `NEXT_PUBLIC_APP_URL`, `WEBHOOK_SECRET` (webhook giao việc), `TELEGRAM_WEBHOOK_SECRET` (liên kết KTV), `CRON_SECRET` (nhắc báo cáo).

## Khi bắt đầu một phiên mới
Đọc: file này → `AGENTS.md` → thư mục `supabase_migration_*.sql` (migration mới nhất) → soi code hiện tại của phần định làm. Không cần khảo sát lại toàn bộ.
