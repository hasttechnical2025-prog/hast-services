# Sao lưu Database về PC (local backup)

App **không dùng Supabase Storage** → toàn bộ dữ liệu nằm trong Postgres. Chỉ cần `pg_dump` là sao lưu trọn vẹn.
Backup lưu ở `App So Cong tac/backups/` (đã gitignore — **không** commit). Chạy tự động **hàng tuần** qua Task Scheduler.

> ⚠️ Ngoài database, hãy **tự lưu riêng** các secret ở Vercel (SESSION_SECRET, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, CRON_SECRET…) vào trình quản lý mật khẩu — chúng KHÔNG nằm trong dump.

---

## Bước 1 — Cài PostgreSQL client (pg_dump)

Tải **PostgreSQL 17** (bản Windows) tại https://www.postgresql.org/download/windows/ (EDB installer).
Khi cài, có thể **bỏ chọn "PostgreSQL Server"**, chỉ cần **"Command Line Tools"** (chứa `pg_dump`/`pg_restore`).
Mặc định cài vào `C:\Program Files\PostgreSQL\17\bin` — script tự tìm ở đây nên **không bắt buộc** thêm PATH.

Kiểm tra:
```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" --version
```

> Dùng client **17** (mới hơn hoặc bằng server) để tránh lỗi lệch version.

## Bước 2 — Lấy chuỗi kết nối & tạo file cấu hình

1. Supabase Dashboard → **Project Settings → Database → Connection string** → chọn tab **Session pooler** → copy dạng **URI**. Nó giống:
   ```
   postgresql://postgres.gdlsyktofnvmzajocfcs:[MẬT-KHẨU]@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
   Thay `[MẬT-KHẨU]` bằng **Database password** (Settings → Database → *Reset database password* nếu quên).
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
