# Dựng STAGING trên máy (Supabase local qua Docker) để THỬ MIGRATION trước khi chạy prod.
# Không tốn slot Supabase cloud, không đụng dữ liệu thật.
#
# Dùng chung chuỗi kết nối prod ở scripts/.backup-conn (1 dòng, ĐÃ gitignore) để DUMP SCHEMA (chỉ cấu trúc, KHÔNG dữ liệu).
#
# CÁCH DÙNG (PowerShell, tại thư mục app):
#   scripts\staging-local.ps1                      # dựng/khởi động local + nạp schema prod
#   scripts\staging-local.ps1 -Migration migrations\supabase_migration_104_xxx.sql   # ... rồi CHẠY THỬ migration
#   scripts\staging-local.ps1 -Stop                # tắt stack local (giải phóng Docker)
#
# Xem hướng dẫn chi tiết: scripts/BACKUP-README.md (mục "Staging local").
param(
  [string]$Migration = '',
  [switch]$Stop
)
$ErrorActionPreference = 'Stop'

$root      = Split-Path -Parent $PSScriptRoot            # thư mục app (cha của scripts)
$connFile  = Join-Path $PSScriptRoot '.backup-conn'      # chuỗi Session pooler prod (có mật khẩu)
$localConn = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'   # DB local mặc định của Supabase CLI
$studioUrl = 'http://127.0.0.1:54323'

# --- Tắt stack rồi thoát ---
if ($Stop) {
  Push-Location $root
  try { supabase stop; Write-Host "`nĐã tắt stack staging local." -ForegroundColor Green }
  finally { Pop-Location }
  exit 0
}

# --- Tìm pg_dump + psql (ưu tiên PATH, fallback PostgreSQL\*\bin) ---
function Find-PgTool([string]$name) {
  if (Get-Command $name -ErrorAction SilentlyContinue) { return $name }
  $cand = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\$name.exe" -ErrorAction SilentlyContinue |
          Sort-Object FullName -Descending | Select-Object -First 1
  if ($cand) { return $cand.FullName }
  return $null
}
$pgDump = Find-PgTool 'pg_dump'
$psql   = Find-PgTool 'psql'
if (-not $pgDump) { Write-Error "Không tìm thấy pg_dump. Cài PostgreSQL client (xem BACKUP-README.md)."; exit 1 }
if (-not $psql)   { Write-Error "Không tìm thấy psql. Cài PostgreSQL client (xem BACKUP-README.md).";   exit 1 }

# --- Kiểm tra Docker đang chạy ---
docker info *> $null
if ($LASTEXITCODE -ne 0) { Write-Error "Docker chưa chạy. Mở Docker Desktop rồi thử lại."; exit 1 }

Push-Location $root
try {
  # --- 1) Khởi tạo project Supabase local (chỉ lần đầu) ---
  if (-not (Test-Path (Join-Path $root 'supabase\config.toml'))) {
    Write-Host "Lần đầu: khởi tạo cấu hình Supabase local..." -ForegroundColor Cyan
    supabase init
    if ($LASTEXITCODE -ne 0) { Write-Error "supabase init lỗi."; exit 1 }
  }

  # --- 2) Start stack local (lần đầu tải Docker image ~vài phút) ---
  Write-Host "Khởi động Supabase local (Docker)..." -ForegroundColor Cyan
  supabase start
  if ($LASTEXITCODE -ne 0) { Write-Error "supabase start lỗi."; exit 1 }

  # --- 3) Dump SCHEMA prod (chỉ cấu trúc) ---
  if (-not (Test-Path $connFile)) { Write-Error "Thiếu $connFile (chuỗi kết nối prod). Xem BACKUP-README.md."; exit 1 }
  $conn = (Get-Content $connFile -Raw).Trim()
  if (-not $conn) { Write-Error "File $connFile rỗng."; exit 1 }

  $schemaFile = Join-Path $env:TEMP "soct_schema_$(Get-Date -Format yyyyMMdd_HHmm).sql"
  Write-Host "Dump schema prod (chỉ cấu trúc, KHÔNG dữ liệu)..." -ForegroundColor Cyan
  & $pgDump --dbname=$conn --schema-only --no-owner --no-privileges -n public -f $schemaFile
  if ($LASTEXITCODE -ne 0) { Write-Error "pg_dump lỗi (exit $LASTEXITCODE)."; exit 1 }

  # --- 4) Nạp schema vào DB local ---
  Write-Host "Nạp schema vào DB local..." -ForegroundColor Cyan
  & $psql $localConn -v ON_ERROR_STOP=1 -f $schemaFile
  if ($LASTEXITCODE -ne 0) { Write-Error "Nạp schema lỗi (exit $LASTEXITCODE)."; exit 1 }
  Remove-Item $schemaFile -ErrorAction SilentlyContinue

  Write-Host "`n✅ Staging local sẵn sàng." -ForegroundColor Green
  Write-Host "   Studio (xem/sửa DB): $studioUrl"
  Write-Host "   Chuỗi kết nối local: $localConn"

  # --- 5) (Tuỳ chọn) chạy thử migration ---
  if ($Migration) {
    if (-not (Test-Path $Migration)) { Write-Error "Không thấy file migration: $Migration"; exit 1 }
    Write-Host "`n--- CHẠY THỬ migration: $Migration ---" -ForegroundColor Yellow
    & $psql $localConn -v ON_ERROR_STOP=1 -f $Migration
    if ($LASTEXITCODE -eq 0) {
      Write-Host "`n✅ Migration CHẠY OK trên local. An toàn để chạy lên prod." -ForegroundColor Green
    } else {
      Write-Host "`n❌ Migration LỖI trên local (exit $LASTEXITCODE). SỬA trước khi đụng prod!" -ForegroundColor Red
      exit 1
    }
  }

  Write-Host "`nChạy lại với -Migration <file.sql> để thử một migration. Tắt stack: scripts\staging-local.ps1 -Stop" -ForegroundColor DarkGray
}
finally { Pop-Location }
