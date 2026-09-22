# Sao lưu Database về PC (local backup)

App **không dùng Supabase Storage** → toàn bộ dữ liệu nằm trong Postgres. Chỉ cần `pg_dump` là sao lưu trọn vẹn.
Backup lưu ở `App So Cong tac/backups/` (đã gitignore — **không** commit). Chạy tự động **hàng tuần** qua Task Scheduler.

> ⚠️ Ngoài database, hãy **tự lưu riêng** các secret ở Vercel (SESSION_SECRET, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, CRON_SECRET…) vào trình quản lý mật khẩu — chúng KHÔNG nằm trong dump.

---

## Bước 1 — Cài PostgreSQL client (pg_dump)

Tải **PostgreSQL 17 trở lên (18 cũng được)** cho Windows tại https://www.postgresql.org/download/windows/ (EDB installer).
Khi cài, **chỉ cần "Command Line Tools"** (`pg_dump`/`pg_restore`) — có thể bỏ chọn "PostgreSQL Server" (khi đó không bị hỏi Port/mật khẩu). Nếu cứ để cài đủ thì ở màn hình **Port** để mặc định **5432** (server local này không dùng cho backup, vô hại).
Cài vào `C:\Program Files\PostgreSQL\<phiên bản>\bin` — script **tự dò và chọn bản mới nhất** nên không cần thêm PATH.

Kiểm tra (đổi 18 thành phiên bản đã cài):
```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" --version
```

> Client phải **≥ server** (Supabase PG 15/17). 17 hoặc 18 đều đạt; chỉ client CŨ hơn server mới lỗi.

## Bước 2 — Lấy chuỗi kết nối & tạo file cấu hình

1. Supabase Dashboard → bấm nút **Connect** (góc trên, cạnh `main PRODUCTION`) → mục **Connection string** → chọn kiểu **Session pooler** → copy **URI**. Project này (ref `gdlsyktofnvmzajocfcs`, region Sydney = ap-southeast-2) sẽ dạng:
   ```
   postgresql://postgres.gdlsyktofnvmzajocfcs:[MẬT-KHẨU]@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres
   ```
   Thay `[MẬT-KHẨU]` bằng **Database password** (Project Settings → Database → *Reset database password* nếu quên — reset KHÔNG ảnh hưởng app vì app dùng service-role key, không dùng mật khẩu Postgres).
   > Dùng **Session pooler** (cổng 5432) vì hỗ trợ IPv4 — hợp với PC thường. Đừng dùng Transaction pooler (6543) cho pg_dump.
2. Tạo file **`scripts/.backup-conn`** (đã gitignore), dán đúng **1 dòng** chuỗi trên vào, lưu lại.

## Bước 3 — Chạy thử

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\Claude Code\App So Cong tac\scripts\backup-db.ps1"
```
Thành công sẽ thấy `OK: ...\backups\soct_YYYYMMDD_HHmm.dump (x MB)`.

## Bước 4 — Đặt lịch tự động HÀNG TUẦN (Task Scheduler)

Mở **PowerShell với quyền Admin**, chạy (đặt Chủ nhật 20:00 — đổi tùy ý):
```powershell
schtasks /Create /TN "HAST Backup DB" /SC WEEKLY /D SUN /ST 20:00 /F ^
 /TR "powershell -NoProfile -ExecutionPolicy Bypass -File \"D:\Claude Code\App So Cong tac\scripts\backup-db.ps1\""
```
- Chạy thử ngay: `schtasks /Run /TN "HAST Backup DB"`
- Gỡ lịch: `schtasks /Delete /TN "HAST Backup DB" /F`
> PC phải **đang bật** vào giờ hẹn. Nếu hay tắt máy, chọn giờ chắc chắn mở, hoặc trong Task Scheduler tick "Run task as soon as possible after a scheduled start is missed".

## Xoay vòng (tự động trong script)
Giữ **8 bản gần nhất** + **1 bản/tháng cho 6 tháng gần nhất**; bản cũ hơn tự xóa.

## 3-2-1 — Đưa bản sao ra ngoài PC
`backups/` nằm trong thư mục app trên **1 ổ đĩa** → nếu ổ/PC hỏng là mất. Hãy để 1 bản ở nơi khác:
- Copy định kỳ thư mục `backups/` sang **Google Drive** hoặc **ổ cứng ngoài**; hoặc trỏ Google Drive for Desktop đồng bộ thư mục này.

---

## Khôi phục (restore)

Khôi phục vào **1 project Supabase TEST** (hoặc Postgres local) — **đừng** restore đè lên DB đang chạy trừ khi thực sự cần:
```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" `
  --dbname="postgresql://postgres.<REF-TEST>:[MẬT-KHẨU]@<host-test>:5432/postgres" `
  --clean --if-exists --no-owner --no-privileges `
  "D:\Claude Code\App So Cong tac\backups\soct_YYYYMMDD_HHmm.dump"
```

## ⚠️ Nên làm định kỳ
- **Test khôi phục** 1–2 lần/quý vào project test — *backup chưa test coi như chưa có*.
- Kiểm tra file mới sinh ra hàng tuần trong `backups/` (kích thước > 0).
